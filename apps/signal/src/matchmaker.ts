import { nanoid } from "nanoid";
import {
  isPolite,
  MATCH_ACK_TIMEOUT_MS,
  RECENT_PARTNERS_LIMIT,
  RECENT_PARTNERS_TTL_S,
  TIERS,
  TIER_WIDEN_MS,
  type EndReason,
  type Mode,
  type Tier,
} from "@callme/protocol";
import { env } from "./env";
import { logger } from "./logger";
import { keys, redis } from "./redis";
import { metrics } from "./metrics";
import {
  sendControl,
  sendTo,
  sendToUser,
  type Conn,
  type ControlMessage,
} from "./hub";

/**
 * Rooms this node is a participant in, awaiting the second ACK. Purely local:
 * the authoritative ack count lives in Redis so the two nodes agree, but each
 * node runs its own timer for its own peer.
 */
const pending = new Map<string, NodeJS.Timeout>();

/** Re-attempt backoff while queued. */
const RETRY_SCHEDULE_MS = [1_000, 2_000, 4_000, 5_000];

/* -------------------------------------------------------------------------- */
/* Queue                                                                       */
/* -------------------------------------------------------------------------- */

export async function joinQueue(
  conn: Conn,
  opts: {
    mode: Mode;
    lang: string;
    interests: string[];
    preferCountry?: string | null;
  },
): Promise<void> {
  if (conn.roomId) {
    await endRoom(conn, "skipped", false);
  }
  clearQueue(conn);

  conn.queue = {
    mode: opts.mode,
    interests: opts.interests,
    // Someone who picked no interests has nothing to match on, so starting them
    // at the `interest` tier would just waste their first eight seconds.
    tier: opts.interests.length > 0 ? "interest" : "language",
    joinedAt: Date.now(),
  };
  conn.country = opts.preferCountry ?? conn.country;
  conn.lang = opts.lang;

  await attempt(conn, 0);
}

export function clearQueue(conn: Conn): void {
  if (conn.queue?.widenTimer) clearTimeout(conn.queue.widenTimer);
  conn.queue = null;
}

export async function leaveQueue(conn: Conn): Promise<void> {
  clearQueue(conn);
  await Promise.all([
    redis.zrem(keys.queue("video"), conn.userId),
    redis.zrem(keys.queue("text"), conn.userId),
    redis.del(keys.profile(conn.userId)),
  ]);
}

/**
 * One Lua round trip that either commits a pair or enqueues the caller. See
 * lua/matchmake.lua for why this can't be split into read-then-write.
 */
async function attempt(conn: Conn, retryIndex: number): Promise<void> {
  const q = conn.queue;
  if (!q || conn.closed) return;

  const startedAt = Date.now();
  const roomId = nanoid(21);

  let reply: string[];
  try {
    reply = await redis.matchmake(
      q.mode,
      conn.userId,
      Date.now(),
      env.matchScanLimit,
      roomId,
      conn.lang,
      conn.country ?? "",
      q.interests.join(","),
      q.tier,
      conn.blocked.join(","),
      env.nodeId,
      conn.displayName,
      conn.isGuest ? "1" : "0",
      RECENT_PARTNERS_TTL_S,
      RECENT_PARTNERS_LIMIT,
      q.joinedAt,
    );
  } catch (err) {
    logger.error({ err, userId: conn.userId }, "matchmake failed");
    sendTo(conn, { t: "error", code: "internal", message: "Try again" });
    return;
  }

  metrics.observe("matchmake_ms", Date.now() - startedAt);

  if (reply[0] === "matched") {
    const [, rid, peerId, peerNode, peerName, peerGuest, peerCountry, peerLang, peerInterestCsv] =
      reply as [string, string, string, string, string, string, string, string, string];

    metrics.inc("matches");
    metrics.observe("time_to_match_ms", Date.now() - q.joinedAt);

    clearQueue(conn);

    // Bind our own side first so a signal arriving before the peer's ACK isn't
    // rejected as "not_in_room".
    bindRoom(conn, rid, peerId, peerNode || env.nodeId, {
      name: peerName,
      isGuest: peerGuest === "1",
      country: peerCountry || null,
      lang: peerLang || null,
      interests: peerInterestCsv ? peerInterestCsv.split(",") : [],
    });

    // Tell the peer's node to do the same. If they're local, sendControl
    // dispatches in-process without touching Redis.
    await sendControl(
      peerId,
      {
        c: "match",
        roomId: rid,
        peerId: conn.userId,
        peerNode: env.nodeId,
        peerName: conn.displayName,
        peerIsGuest: conn.isGuest,
        peerCountry: conn.country,
        peerLang: conn.lang,
        peerInterests: q.interests,
        tier: q.tier,
      },
      peerNode,
    );
    return;
  }

  // Queued. Report position and schedule both the widen and the retry.
  const poolSize = Number(reply[1] ?? 0);
  sendTo(conn, {
    t: "queue.waiting",
    tier: q.tier,
    queuedMs: Date.now() - q.joinedAt,
    poolSize,
  });

  const elapsed = Date.now() - q.joinedAt;
  const widenAfter = TIER_WIDEN_MS[q.tier];
  const nextRetry =
    RETRY_SCHEDULE_MS[Math.min(retryIndex, RETRY_SCHEDULE_MS.length - 1)] ?? 5000;

  const shouldWiden = Number.isFinite(widenAfter) && elapsed >= widenAfter;
  const delay = shouldWiden ? 0 : nextRetry;

  q.widenTimer = setTimeout(() => {
    if (conn.closed || conn.queue !== q) return;
    if (shouldWiden) {
      const next = TIERS[TIERS.indexOf(q.tier) + 1];
      if (next) {
        q.tier = next as Tier;
        logger.debug({ userId: conn.userId, tier: next }, "widened match tier");
      }
      void attempt(conn, 0);
    } else {
      void attempt(conn, retryIndex + 1);
    }
  }, delay);
}

/* -------------------------------------------------------------------------- */
/* Match lifecycle                                                             */
/* -------------------------------------------------------------------------- */

function bindRoom(
  conn: Conn,
  roomId: string,
  peerId: string,
  peerNode: string,
  peer: {
    name: string;
    isGuest: boolean;
    country: string | null;
    lang: string | null;
    interests: string[];
  },
): void {
  conn.roomId = roomId;
  conn.peerId = peerId;
  conn.peerNode = peerNode;
  conn.matchedAt = Date.now();

  sendTo(conn, {
    t: "match.proposed",
    roomId,
    peer: {
      id: peerId,
      displayName: peer.name,
      isGuest: peer.isGuest,
      country: peer.country as never,
      lang: peer.lang as never,
      interests: peer.interests as never,
    },
    // Both peers derive this identically from the two ids, so exactly one is
    // polite and glare during renegotiation is impossible by construction.
    polite: isPolite(conn.userId, peerId),
    ackTimeoutMs: MATCH_ACK_TIMEOUT_MS,
  });

  /**
   * One ACK timer per room per node — not one per participant.
   *
   * When both peers are local (the single-node case, i.e. most deployments)
   * bindRoom runs twice for the same roomId: once for the caller in attempt(),
   * once for the partner via the 'match' control message. Without this clear,
   * the second setTimeout overwrote the map entry and orphaned the first timer,
   * which no longer had any way to be cancelled. ackMatch would clear the one
   * it could see, and five seconds later the orphan fired and cancelled a call
   * that was already connected and working — forever, for every match.
   */
  clearPending(roomId);
  pending.set(
    roomId,
    setTimeout(() => void cancelRoom(roomId, "ack_timeout"), MATCH_ACK_TIMEOUT_MS),
  );
}

/**
 * Second half of the two-phase commit. An open socket does not prove a live
 * browser — backgrounded and frozen tabs keep their connection but never
 * respond — so a pair is only real once both sides have spoken.
 */
export async function ackMatch(conn: Conn, roomId: string): Promise<void> {
  if (conn.roomId !== roomId) {
    sendTo(conn, { t: "error", code: "not_in_room", message: "Unknown room" });
    return;
  }

  const acks = await redis.hincrby(keys.room(roomId), "acks", 1);
  if (acks < 2) return;

  // Whichever node observes the second ACK announces readiness to both sides.
  await redis.hset(keys.room(roomId), "state", "ready");
  clearPending(roomId);

  await Promise.all([
    sendControl(conn.userId, { c: "ready", roomId }),
    sendControl(conn.peerId!, { c: "ready", roomId }, conn.peerNode),
  ]);
}

async function cancelRoom(
  roomId: string,
  reason: "ack_timeout" | "peer_left" | "banned",
): Promise<void> {
  clearPending(roomId);

  // Only the first node to claim the cancellation broadcasts it, so the two
  // participants can't each receive a duplicate teardown.
  const claimed = await redis.hsetnx(keys.room(roomId), "finished", reason);
  const room = await redis.hgetall(keys.room(roomId));
  if (!claimed || !room.a) return;

  metrics.inc(`cancel_${reason}`);

  await Promise.all([
    sendControl(room.a, { c: "cancel", roomId, reason }, room.aNode),
    sendControl(room.b!, { c: "cancel", roomId, reason }, room.bNode),
  ]);
  await redis.del(keys.room(roomId));
}

function clearPending(roomId: string): void {
  const timer = pending.get(roomId);
  if (timer) {
    clearTimeout(timer);
    pending.delete(roomId);
  }
}

/**
 * Ends a call from this side. `requeue` is what makes "Next" feel instant: the
 * user re-enters the queue in the same tick they leave the old room, rather
 * than bouncing through the lobby.
 */
export async function endRoom(
  conn: Conn,
  reason: EndReason,
  requeue: boolean,
  previousQueue?: { mode: Mode; lang: string; interests: string[] } | null,
): Promise<void> {
  const roomId = conn.roomId;
  if (!roomId) return;

  const peerId = conn.peerId;
  const peerNode = conn.peerNode;

  clearPending(roomId);
  conn.roomId = null;
  conn.peerId = null;
  conn.peerNode = null;
  conn.matchedAt = null;

  if (peerId) {
    // Mirror the reason for the other side: "they skipped" and "they dropped"
    // are different messages and the UI says different things about each.
    const peerReason: EndReason =
      reason === "skipped"
        ? "peer_skipped"
        : reason === "disconnected"
          ? "peer_disconnected"
          : reason;

    await sendControl(peerId, { c: "end", roomId, reason: peerReason }, peerNode);
  }
  await redis.del(keys.room(roomId));

  if (requeue && previousQueue && !conn.closed) {
    await joinQueue(conn, previousQueue);
  }
}

/* -------------------------------------------------------------------------- */
/* Control-plane handler                                                       */
/* -------------------------------------------------------------------------- */

export function handleControl(conn: Conn, ctrl: ControlMessage): void {
  switch (ctrl.c) {
    case "match": {
      clearQueue(conn);
      bindRoom(conn, ctrl.roomId, ctrl.peerId, ctrl.peerNode, {
        name: ctrl.peerName,
        isGuest: ctrl.peerIsGuest,
        country: ctrl.peerCountry,
        lang: ctrl.peerLang,
        interests: ctrl.peerInterests,
      });
      break;
    }

    case "ready": {
      if (conn.roomId !== ctrl.roomId) return;
      clearPending(ctrl.roomId);
      sendTo(conn, { t: "match.ready", roomId: ctrl.roomId });
      break;
    }

    case "cancel": {
      if (conn.roomId !== ctrl.roomId) return;
      conn.roomId = null;
      conn.peerId = null;
      conn.peerNode = null;
      sendTo(conn, {
        t: "match.cancelled",
        roomId: ctrl.roomId,
        reason: ctrl.reason,
      });
      break;
    }

    case "end": {
      if (conn.roomId !== ctrl.roomId) return;
      conn.roomId = null;
      conn.peerId = null;
      conn.peerNode = null;
      conn.matchedAt = null;
      sendTo(conn, {
        t: "peer.left",
        roomId: ctrl.roomId,
        reason: ctrl.reason as EndReason,
      });
      break;
    }
  }
}

/** Relays an SDP/ICE frame to the other half of a room. */
export async function relaySignal(
  conn: Conn,
  roomId: string,
  payload: unknown,
): Promise<void> {
  if (conn.roomId !== roomId || !conn.peerId) {
    sendTo(conn, { t: "error", code: "not_in_room", message: "Unknown room" });
    return;
  }
  metrics.inc("signals");
  await sendToUser(
    conn.peerId,
    { t: "signal", roomId, payload: payload as never },
    conn.peerNode,
  );
}
