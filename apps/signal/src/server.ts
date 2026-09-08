import { createHash } from "node:crypto";
import uWS from "uWebSockets.js";
import { addBlock, callLogs, getDb, newId } from "@callme/db";
import {
  decodeClientMessage,
  HEARTBEAT_TIMEOUT_S,
  MAX_FRAME_BYTES,
  type ClientMessage,
  type Mode,
} from "@callme/protocol";
import { env } from "./env";
import { logger } from "./logger";
import { closeRedis, keys, redis } from "./redis";
import { metrics, renderPrometheus } from "./metrics";
import { mintTurnCredentials } from "./turn";
import {
  close as closeConn,
  drain,
  heartbeat,
  localCount,
  register,
  sendTo,
  setControlHandler,
  startInbox,
  unregister,
  type Conn,
  type SocketData,
} from "./hub";
import {
  ackMatch,
  endRoom,
  handleControl,
  joinQueue,
  leaveQueue,
  relaySignal,
} from "./matchmaker";
import { assertNotBanned, creditSession, handleReport } from "./moderation";

const decoder = new TextDecoder();

/** Ticket payload minted by the Next.js app; see apps/web/src/lib/ticket.ts. */
interface TicketPayload {
  userId: string;
  displayName: string;
  isGuest: boolean;
  trustScore: number;
  lang: string;
  country: string | null;
  fingerprintHash: string | null;
  ipHash: string;
  blocked: string[];
}

/* -------------------------------------------------------------------------- */
/* Rate limits                                                                 */
/* -------------------------------------------------------------------------- */

const LIMITS: Record<string, { limit: number; windowMs: number }> = {
  // Generous enough for aggressive "next"-mashing, tight enough that a script
  // can't churn the queue looking for a specific person.
  "queue.join": { limit: 30, windowMs: 60_000 },
  "peer.report": { limit: 10, windowMs: 60 * 60_000 },
  signal: { limit: 400, windowMs: 60_000 },
};

async function rateLimited(conn: Conn, scope: string): Promise<boolean> {
  const rule = LIMITS[scope];
  if (!rule) return false;

  const [allowed, retryAfterMs] = await redis.ratelimit(
    keys.rate(scope, conn.userId),
    rule.limit,
    rule.windowMs,
    Date.now(),
  );
  if (allowed === 1) return false;

  metrics.inc("rate_limited");
  sendTo(conn, {
    t: "error",
    code: "rate_limited",
    message: "Slow down a moment",
    retryAfterMs,
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/* Message dispatch                                                            */
/* -------------------------------------------------------------------------- */

async function onHello(conn: Conn, ticket: string): Promise<void> {
  if (conn.authed) return;

  // GETDEL makes the ticket single-use atomically: a leaked ticket in a log or
  // a shared URL cannot be replayed by a second connection.
  const raw = await redis.getdel(keys.ticket(ticket));
  if (!raw) {
    sendTo(conn, {
      t: "error",
      code: "bad_ticket",
      message: "Session expired, refresh the page",
    });
    closeConn(conn);
    return;
  }

  const payload = JSON.parse(raw) as TicketPayload;

  conn.userId = payload.userId;
  conn.displayName = payload.displayName;
  conn.isGuest = payload.isGuest;
  conn.trustScore = payload.trustScore;
  conn.lang = payload.lang;
  conn.country = payload.country;
  conn.fingerprintHash = payload.fingerprintHash;
  conn.blocked = payload.blocked ?? [];
  conn.authed = true;

  await register(conn);

  const { iceServers, ttlSec } = mintTurnCredentials(conn.userId);
  sendTo(conn, {
    t: "hello.ok",
    userId: conn.userId,
    displayName: conn.displayName,
    isGuest: conn.isGuest,
    trustScore: conn.trustScore,
    iceServers,
    iceTtlSec: ttlSec,
  });

  metrics.inc("hello");
}

async function onMessage(conn: Conn, msg: ClientMessage): Promise<void> {
  if (msg.t === "hello") {
    await onHello(conn, msg.ticket);
    return;
  }

  if (!conn.authed) {
    sendTo(conn, { t: "error", code: "bad_ticket", message: "Say hello first" });
    return;
  }

  switch (msg.t) {
    case "ping": {
      heartbeat(conn);
      sendTo(conn, { t: "pong" });
      break;
    }

    case "queue.join": {
      if (await rateLimited(conn, "queue.join")) return;
      if (!(await assertNotBanned(conn))) return;
      await joinQueue(conn, {
        mode: msg.mode,
        lang: msg.lang,
        interests: msg.interests,
        preferCountry: msg.preferCountry ?? null,
      });
      break;
    }

    case "queue.leave": {
      await leaveQueue(conn);
      break;
    }

    case "match.ack": {
      await ackMatch(conn, msg.roomId);
      break;
    }

    case "signal": {
      if (await rateLimited(conn, "signal")) return;
      await relaySignal(conn, msg.roomId, msg.payload);
      break;
    }

    case "peer.skip": {
      const previous = conn.queue
        ? null
        : { mode: lastMode(conn), lang: conn.lang, interests: lastInterests(conn) };
      await endRoom(conn, "skipped", msg.requeue, previous);
      break;
    }

    case "peer.block": {
      if (conn.peerId) {
        await addBlock(getDb(), conn.userId, conn.peerId);
        conn.blocked.push(conn.peerId);
      }
      await endRoom(conn, "skipped", false);
      break;
    }

    case "peer.report": {
      if (await rateLimited(conn, "peer.report")) return;
      await handleReport(conn, {
        roomId: msg.roomId,
        reason: msg.reason,
        note: msg.note,
        evidence: msg.evidence,
      });
      await endRoom(conn, "reported", false);
      break;
    }

    case "session.stats": {
      await recordCall(conn, msg);
      break;
    }
  }
}

/**
 * The client's last queue preferences, remembered so "Next" can re-queue with
 * the same filters instead of dumping the user back to the lobby to re-pick.
 */
const lastPrefs = new WeakMap<Conn, { mode: Mode; interests: string[] }>();
const lastMode = (c: Conn): Mode => lastPrefs.get(c)?.mode ?? "video";
const lastInterests = (c: Conn): string[] => lastPrefs.get(c)?.interests ?? [];

async function recordCall(
  conn: Conn,
  msg: Extract<ClientMessage, { t: "session.stats" }>,
): Promise<void> {
  const relayed = msg.candidateType === "relay";
  metrics.inc("calls_completed");
  if (relayed) metrics.inc("calls_relayed");
  metrics.observe("setup_ms", msg.setupMs);
  metrics.observe("call_duration_ms", msg.durationMs);

  try {
    // Both peers report the same call. `call_logs_room_uq` turns the second
    // insert into a no-op rather than a duplicate that would double every
    // aggregate downstream.
    await getDb()
      .insert(callLogs)
      .values({
        id: newId(),
        roomId: msg.roomId,
        aUserId: conn.userId,
        bUserId: conn.peerId ?? conn.userId,
        mode: lastMode(conn),
        setupMs: msg.setupMs,
        durationMs: msg.durationMs,
        candidateType: msg.candidateType,
        wasRelayed: relayed,
        endReason: msg.endReason,
        endedAt: new Date(),
      })
      .onConflictDoNothing();

    await creditSession(conn.userId, msg.durationMs);
  } catch (err) {
    logger.error({ err }, "failed to record call log");
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP + WebSocket server                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Origin check for the websocket upgrade.
 *
 * In production this is a strict allowlist — nothing else may open a socket.
 *
 * In development it additionally accepts private-network origins, so a phone on
 * the same wifi can connect without every developer having to edit
 * ALLOWED_ORIGINS to their current DHCP address. Testing on a real device is
 * the only way to catch camera and permission bugs that simply do not reproduce
 * on a desktop, so the friction is worth removing. Gated hard on `!isProd`.
 */
const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$/;

function originAllowed(origin: string): boolean {
  if (env.allowedOrigins.includes(origin)) return true;
  if (env.isProd) return false;

  try {
    return PRIVATE_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

const app = uWS.App();

app.get("/health", (res) => {
  res
    .writeHeader("Content-Type", "application/json")
    .end(JSON.stringify({ ok: true, node: env.nodeId, connections: localCount() }));
});

app.get("/metrics", (res) => {
  res.writeHeader("Content-Type", "text/plain; version=0.0.4").end(renderPrometheus());
});

app.ws<SocketData>("/ws", {
  maxPayloadLength: MAX_FRAME_BYTES,
  idleTimeout: HEARTBEAT_TIMEOUT_S,
  // 1 MB. Signaling frames are small; anything approaching this ceiling means
  // the peer has stopped reading and we should drop them rather than buffer.
  maxBackpressure: 1024 * 1024,
  compression: uWS.SHARED_COMPRESSOR,

  upgrade(res, req, context) {
    // uWS invalidates `req` the moment this handler yields, so every header has
    // to be copied out synchronously, before anything async happens.
    const origin = req.getHeader("origin") || null;
    const forwarded = req.getHeader("x-forwarded-for");
    const key = req.getHeader("sec-websocket-key");
    const protocol = req.getHeader("sec-websocket-protocol");
    const extensions = req.getHeader("sec-websocket-extensions");

    if (origin && !originAllowed(origin)) {
      logger.warn({ origin }, "rejected websocket upgrade: origin not allowed");
      res.writeStatus("403 Forbidden").end("origin not allowed");
      return;
    }

    const remote = Buffer.from(res.getRemoteAddressAsText()).toString();
    const ip = forwarded ? (forwarded.split(",")[0] ?? "").trim() : remote;

    res.upgrade<SocketData>({ ip } as never, key, protocol, extensions, context);
  },

  open(ws) {
    const data = ws.getUserData() as SocketData & { ip?: string };
    const conn: Conn = {
      ws,
      userId: "",
      displayName: "",
      isGuest: true,
      trustScore: 0,
      lang: "en",
      country: null,
      ipHash: hashIp(data.ip ?? ""),
      fingerprintHash: null,
      authed: false,
      roomId: null,
      peerId: null,
      peerNode: null,
      queue: null,
      blocked: [],
      matchedAt: null,
      closed: false,
    };
    data.conn = conn;
    metrics.inc("connections_opened");
  },

  message(ws, message) {
    const { conn } = ws.getUserData();
    if (!conn) return;

    const raw = decoder.decode(message);
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) {
      metrics.inc("invalid_messages");
      sendTo(conn, {
        t: "error",
        code: "invalid_message",
        message: decoded.error,
      });
      return;
    }

    if (decoded.value.t === "queue.join") {
      lastPrefs.set(conn, {
        mode: decoded.value.mode,
        interests: decoded.value.interests,
      });
    }

    // uWS handlers are synchronous; errors escaping this promise would be an
    // unhandled rejection and, in Node 22, would take the process down.
    onMessage(conn, decoded.value).catch((err) => {
      logger.error({ err, t: decoded.value.t }, "handler failed");
      sendTo(conn, { t: "error", code: "internal", message: "Something broke" });
    });
  },

  close(ws) {
    const { conn } = ws.getUserData();
    if (!conn) return;
    conn.closed = true;
    metrics.inc("connections_closed");

    void (async () => {
      try {
        if (conn.roomId) await endRoom(conn, "disconnected", false);
        if (conn.authed) await unregister(conn);
      } catch (err) {
        logger.error({ err }, "cleanup failed");
      }
    })();
  },
});

function hashIp(ip: string): string {
  // Salted so the stored value can't be reversed with a rainbow table of the
  // IPv4 space, which is small enough to enumerate exhaustively.
  return createHash("sha256").update(`${env.turnSecret}:${ip}`).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

setControlHandler(handleControl);

await startInbox();

app.listen(env.host, env.port, (token) => {
  if (!token) {
    logger.fatal({ port: env.port }, "failed to bind");
    process.exit(1);
  }
  logger.info(
    { port: env.port, node: env.nodeId, origins: env.allowedOrigins },
    "signal server listening",
  );
});

/* -------------------------------------------------------------------------- */
/* Graceful shutdown                                                           */
/* -------------------------------------------------------------------------- */

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "draining");

  // Tell clients to reconnect *before* we stop serving, so they land on a
  // sibling node instead of discovering the socket is gone mid-call.
  const conns = drain();
  await new Promise((r) => setTimeout(r, 500));

  await Promise.allSettled(conns.map((c) => unregister(c)));
  await closeRedis();
  logger.info("bye");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) =>
  logger.error({ err }, "unhandled rejection"),
);
