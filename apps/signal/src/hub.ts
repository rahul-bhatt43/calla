import type { WebSocket } from "uWebSockets.js";
import { encode, type ServerMessage } from "@callme/protocol";
import { env } from "./env";
import { logger } from "./logger";
import { keys, pub, redis, sub } from "./redis";
import { metrics } from "./metrics";

export interface SocketData {
  conn?: Conn;
}

export interface QueueState {
  mode: "video" | "text";
  interests: string[];
  tier: "interest" | "language" | "global";
  joinedAt: number;
  widenTimer?: NodeJS.Timeout;
}

export interface Conn {
  ws: WebSocket<SocketData>;
  userId: string;
  displayName: string;
  isGuest: boolean;
  trustScore: number;
  lang: string;
  country: string | null;
  ipHash: string;
  fingerprintHash: string | null;
  /** Populated once authenticated; blocks matching until then. */
  authed: boolean;
  roomId: string | null;
  /** Cached at match time so signaling doesn't hit Redis per message. */
  peerNode: string | null;
  peerId: string | null;
  queue: QueueState | null;
  blocked: string[];
  matchedAt: number | null;
  closed: boolean;
}

/** Locally-connected users, keyed by id. */
const local = new Map<string, Conn>();

export function getLocal(userId: string): Conn | undefined {
  return local.get(userId);
}

export function localCount(): number {
  return local.size;
}

export async function register(conn: Conn): Promise<void> {
  // A second tab for the same account replaces the first. Two live sockets for
  // one user would let them queue twice and, eventually, match with themselves.
  const existing = local.get(conn.userId);
  if (existing && existing !== conn) {
    sendTo(existing, {
      t: "error",
      code: "internal",
      message: "Connected from another tab",
    });
    close(existing);
  }

  local.set(conn.userId, conn);
  await Promise.all([
    redis.hset(keys.presence, conn.userId, env.nodeId),
    redis.set(keys.alive(conn.userId), "1", "EX", 60),
  ]);
  metrics.gauge("connections", local.size);
}

export async function unregister(conn: Conn): Promise<void> {
  if (local.get(conn.userId) === conn) {
    local.delete(conn.userId);
    await Promise.all([
      redis.hdel(keys.presence, conn.userId),
      redis.del(keys.alive(conn.userId)),
      redis.zrem(keys.queue("video"), conn.userId),
      redis.zrem(keys.queue("text"), conn.userId),
      redis.del(keys.profile(conn.userId)),
    ]);
  }
  metrics.gauge("connections", local.size);
}

export function heartbeat(conn: Conn): void {
  // Refreshed rather than recreated so a burst of pings is one cheap command.
  void redis.expire(keys.alive(conn.userId), 60);
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

export function sendTo(conn: Conn, msg: ServerMessage): boolean {
  if (conn.closed) return false;
  try {
    const ok = conn.ws.send(encode(msg), false, false);
    // uWS reports failure when the socket's write buffer is full, i.e. the peer
    // has stopped draining. Dropping is the right call: every frame we send is
    // either tiny or already stale by the time that buffer clears.
    if (!ok) {
      metrics.inc("send_backpressure");
      logger.warn({ userId: conn.userId }, "socket backpressure, dropped frame");
      return false;
    }
    metrics.inc("sent");
    return true;
  } catch {
    return false;
  }
}

/**
 * Delivers to a user wherever they are. Local delivery is the fast path and the
 * common one: local-first matchmaking deliberately pairs people on the same
 * node when it can, precisely so this stays in-process.
 */
export async function sendToUser(
  userId: string,
  msg: ServerMessage,
  knownNode?: string | null,
): Promise<boolean> {
  const conn = local.get(userId);
  if (conn) return sendTo(conn, msg);

  const node = knownNode || (await redis.hget(keys.presence, userId));
  if (!node || node === env.nodeId) return false;

  await pub.publish(
    keys.nodeChannel(node),
    JSON.stringify({ kind: "client", to: userId, msg } satisfies Envelope),
  );
  metrics.inc("forwarded");
  return true;
}

/* -------------------------------------------------------------------------- */
/* Control plane                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Some cross-node messages are not just bytes to relay: when a match is made on
 * node A but one peer lives on node B, B has to bind the room to that socket
 * and start its own ACK timer. Forwarding only the client-facing frame would
 * leave B's connection unaware it is in a call, and it would reject the very
 * first `signal` message that followed.
 */
export type ControlMessage =
  | {
      c: "match";
      roomId: string;
      peerId: string;
      peerNode: string;
      peerName: string;
      peerIsGuest: boolean;
      peerCountry: string | null;
      peerLang: string | null;
      peerInterests: string[];
      tier: string;
    }
  | { c: "ready"; roomId: string }
  | { c: "cancel"; roomId: string; reason: "ack_timeout" | "peer_left" | "banned" }
  | { c: "end"; roomId: string; reason: string };

type Envelope =
  | { kind: "client"; to: string; msg: ServerMessage }
  | { kind: "control"; to: string; ctrl: ControlMessage };

type ControlHandler = (conn: Conn, ctrl: ControlMessage) => void;
let controlHandler: ControlHandler | null = null;

export function setControlHandler(fn: ControlHandler): void {
  controlHandler = fn;
}

export async function sendControl(
  userId: string,
  ctrl: ControlMessage,
  knownNode?: string | null,
): Promise<boolean> {
  const conn = local.get(userId);
  if (conn) {
    controlHandler?.(conn, ctrl);
    return true;
  }

  const node = knownNode || (await redis.hget(keys.presence, userId));
  if (!node || node === env.nodeId) return false;

  await pub.publish(
    keys.nodeChannel(node),
    JSON.stringify({ kind: "control", to: userId, ctrl } satisfies Envelope),
  );
  metrics.inc("forwarded");
  return true;
}

export function close(conn: Conn): void {
  if (conn.closed) return;
  conn.closed = true;
  try {
    conn.ws.end(1000, "closing");
  } catch {
    /* socket already gone */
  }
}

/* -------------------------------------------------------------------------- */
/* Cross-node inbox                                                            */
/* -------------------------------------------------------------------------- */

export async function startInbox(): Promise<void> {
  const channel = keys.nodeChannel(env.nodeId);

  /**
   * Retry forever rather than throwing.
   *
   * This runs under a top-level await at boot, so an unhandled rejection here
   * kills the process outright. Redis being momentarily unavailable at startup
   * is completely routine — a compose stack coming up, a container restart, a
   * dev machine bouncing the datastores — and none of those should permanently
   * take down a signalling node that would work fine seconds later.
   */
  for (let attempt = 1; ; attempt++) {
    try {
      await sub.subscribe(channel);
      break;
    } catch (err) {
      const delay = Math.min(attempt * 500, 5000);
      logger.warn(
        { err, attempt, retryInMs: delay },
        "inbox subscribe failed; is Redis up? retrying",
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  sub.on("message", (channel, raw) => {
    if (channel !== keys.nodeChannel(env.nodeId)) return;
    try {
      const env_ = JSON.parse(raw) as Envelope;
      const conn = local.get(env_.to);
      // The user may have disconnected while the message was in flight; the
      // sender's teardown path will clean up after them, so dropping is safe.
      if (!conn) return;

      if (env_.kind === "client") sendTo(conn, env_.msg);
      else controlHandler?.(conn, env_.ctrl);
    } catch (err) {
      logger.error({ err }, "bad inbox payload");
    }
  });
  logger.info({ channel: keys.nodeChannel(env.nodeId) }, "inbox subscribed");
}

/**
 * Tells every connected client to reconnect before we stop accepting frames.
 * Without this, a deploy drops calls mid-sentence; with it, clients reconnect
 * to a sibling node and re-queue on their own.
 */
export function drain(): Conn[] {
  const conns = [...local.values()];
  for (const conn of conns) {
    sendTo(conn, {
      t: "error",
      code: "server_shutting_down",
      message: "Reconnecting…",
    });
  }
  return conns;
}
