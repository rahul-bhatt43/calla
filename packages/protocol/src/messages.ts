import { z } from "zod";
import {
  END_REASONS,
  ERROR_CODES,
  MODES,
  REPORT_REASONS,
  TIERS,
} from "./constants";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

export const zRoomId = z.string().length(21);
export const zUserId = z.string().length(21);

/** BCP-47-ish language tag, deliberately loose: we only key queues on it. */
export const zLang = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
  .max(5);

export const zCountry = z.string().regex(/^[A-Z]{2}$/);

export const zInterest = z
  .string()
  .regex(/^[a-z0-9-]{2,24}$/)
  .max(24);

/**
 * SDP and ICE bodies are passed through untouched — the server has no business
 * parsing them. We validate only shape and size so a peer can't use signaling
 * as an unbounded relay for arbitrary data (which would defeat the entire
 * point of keeping media off our servers).
 */
export const zSignalPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("offer"),
    sdp: z.string().max(32_000),
  }),
  z.object({
    kind: z.literal("answer"),
    sdp: z.string().max(32_000),
  }),
  z.object({
    kind: z.literal("candidate"),
    candidate: z.string().max(1_024),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }),
  // Sent when a peer gives up on ICE so the other side can stop waiting.
  z.object({ kind: z.literal("ice-restart") }),
]);
export type SignalPayload = z.infer<typeof zSignalPayload>;

export const zIceServer = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export type IceServer = z.infer<typeof zIceServer>;

/** The subset of a peer's profile we are willing to reveal on match. */
export const zPeerProfile = z.object({
  id: zUserId,
  displayName: z.string().max(32),
  isGuest: z.boolean(),
  country: zCountry.nullable(),
  lang: zLang.nullable(),
  interests: z.array(zInterest).max(10),
});
export type PeerProfile = z.infer<typeof zPeerProfile>;

/* -------------------------------------------------------------------------- */
/* Client -> Server                                                            */
/* -------------------------------------------------------------------------- */

export const zClientMessage = z.discriminatedUnion("t", [
  /** First frame on every socket. The ticket is a single-use 60s token. */
  z.object({
    t: z.literal("hello"),
    ticket: z.string().min(16).max(512),
  }),

  z.object({
    t: z.literal("queue.join"),
    mode: z.enum(MODES),
    lang: zLang,
    interests: z.array(zInterest).max(10).default([]),
    /** Opt-in preference; the server still widens past it rather than stall. */
    preferCountry: zCountry.nullable().optional(),
  }),

  z.object({ t: z.literal("queue.leave") }),

  z.object({
    t: z.literal("match.ack"),
    roomId: zRoomId,
  }),

  z.object({
    t: z.literal("signal"),
    roomId: zRoomId,
    payload: zSignalPayload,
  }),

  z.object({
    t: z.literal("peer.skip"),
    roomId: zRoomId,
    /** Re-enter the queue immediately instead of returning to the lobby. */
    requeue: z.boolean().default(true),
  }),

  z.object({
    t: z.literal("peer.block"),
    roomId: zRoomId,
  }),

  z.object({
    t: z.literal("peer.report"),
    roomId: zRoomId,
    reason: z.enum(REPORT_REASONS),
    note: z.string().max(500).optional(),
    /** base64 JPEG captured client-side. Bounded hard — this is the only
     *  user-supplied blob that ever reaches our disk. */
    evidence: z.string().max(200_000).optional(),
  }),

  /**
   * Session telemetry, sent once when a call ends. Tiny, and it is the only way
   * to learn our real TURN relay ratio and ICE failure rate.
   */
  z.object({
    t: z.literal("session.stats"),
    roomId: zRoomId,
    setupMs: z.number().int().min(0).max(120_000),
    candidateType: z.enum(["host", "srflx", "prflx", "relay", "unknown"]),
    durationMs: z.number().int().min(0),
    endReason: z.enum(END_REASONS),
    packetsLostPct: z.number().min(0).max(100).optional(),
  }),

  z.object({ t: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof zClientMessage>;
export type ClientMessageOf<K extends ClientMessage["t"]> = Extract<
  ClientMessage,
  { t: K }
>;

/* -------------------------------------------------------------------------- */
/* Server -> Client                                                            */
/* -------------------------------------------------------------------------- */

export const zServerMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello.ok"),
    userId: zUserId,
    displayName: z.string().max(32),
    isGuest: z.boolean(),
    trustScore: z.number().int(),
    /** Freshly minted, HMAC-signed, time-limited TURN credentials. */
    iceServers: z.array(zIceServer),
    iceTtlSec: z.number().int().positive(),
  }),

  z.object({
    t: z.literal("queue.waiting"),
    tier: z.enum(TIERS),
    queuedMs: z.number().int().min(0),
    /** Rough population signal so the UI can say "142 people online". */
    poolSize: z.number().int().min(0).optional(),
  }),

  z.object({
    t: z.literal("match.proposed"),
    roomId: zRoomId,
    peer: zPeerProfile,
    /**
     * Perfect-negotiation role. Exactly one side of every pair is polite;
     * derived server-side from the two ids so both peers always agree.
     */
    polite: z.boolean(),
    ackTimeoutMs: z.number().int().positive(),
  }),

  /** Both sides ACKed. Only now does the impolite peer create its offer. */
  z.object({
    t: z.literal("match.ready"),
    roomId: zRoomId,
  }),

  z.object({
    t: z.literal("match.cancelled"),
    roomId: zRoomId,
    reason: z.enum(["ack_timeout", "peer_left", "banned"]),
  }),

  z.object({
    t: z.literal("signal"),
    roomId: zRoomId,
    payload: zSignalPayload,
  }),

  z.object({
    t: z.literal("peer.left"),
    roomId: zRoomId,
    reason: z.enum(END_REASONS),
  }),

  /** Sent on ban so the client can tear down immediately, mid-call if needed. */
  z.object({
    t: z.literal("banned"),
    until: z.number().int().nullable(),
    reason: z.string().max(200),
  }),

  z.object({
    t: z.literal("error"),
    code: z.enum(ERROR_CODES),
    message: z.string().max(200),
    /** Present on rate_limited: when the client may retry. */
    retryAfterMs: z.number().int().optional(),
  }),

  z.object({ t: z.literal("pong") }),
]);
export type ServerMessage = z.infer<typeof zServerMessage>;
export type ServerMessageOf<K extends ServerMessage["t"]> = Extract<
  ServerMessage,
  { t: K }
>;

/* -------------------------------------------------------------------------- */
/* DataChannel messages (peer <-> peer, never touches our servers)             */
/* -------------------------------------------------------------------------- */

/**
 * Everything below travels over RTCDataChannel directly between browsers. It is
 * the reason a matched pair costs us zero bytes. Validated just as strictly as
 * the wire protocol — the peer is an untrusted stranger by definition.
 */
export const zChatMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("msg"),
    id: z.string().max(32),
    body: z.string().min(1).max(2_000),
    at: z.number().int(),
  }),
  z.object({ t: z.literal("typing"), on: z.boolean() }),
  z.object({ t: z.literal("reaction"), emoji: z.string().max(8) }),
  /** Courtesy notice so the peer sees "Stranger left" instantly. */
  z.object({ t: z.literal("bye"), reason: z.enum(END_REASONS) }),
]);
export type ChatMessage = z.infer<typeof zChatMessage>;

/* -------------------------------------------------------------------------- */
/* Codec helpers                                                               */
/* -------------------------------------------------------------------------- */

export function encode(msg: ClientMessage | ServerMessage | ChatMessage): string {
  return JSON.stringify(msg);
}

export type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Generic over the schema rather than over a bare `T`: constraining to
 * `z.ZodType<T>` makes TypeScript resolve `T` against the schema's *input*
 * type, which silently strips the effect of `.default()` and leaves callers
 * handling `undefined` for fields zod guarantees are populated.
 */
function decodeWith<S extends z.ZodTypeAny>(
  schema: S,
  raw: string,
): DecodeResult<z.infer<S>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "malformed json" };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "invalid" };
  }
  return { ok: true, value: result.data };
}

export const decodeClientMessage = (raw: string) =>
  decodeWith(zClientMessage, raw);
export const decodeServerMessage = (raw: string) =>
  decodeWith(zServerMessage, raw);
export const decodeChatMessage = (raw: string) => decodeWith(zChatMessage, raw);

/**
 * Perfect negotiation needs a stable, symmetric role assignment that both peers
 * compute identically. Lexicographic comparison of the two ids gives us that
 * for free, with no extra round trip.
 */
export function isPolite(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}
