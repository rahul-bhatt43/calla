/**
 * End-to-end smoke test for the matchmaking path.
 *
 * Drives two independent clients through the exact sequence a browser follows:
 *   guest session -> ws ticket -> websocket -> hello -> queue.join
 *   -> match.proposed -> match.ack -> match.ready -> signal relay -> skip
 *
 * It cannot verify the media itself (that needs two real browsers with
 * cameras), but it covers everything our servers are actually responsible for —
 * and critically, it exercises the atomic Lua matchmaker with two clients
 * racing, which is the part most likely to be subtly wrong.
 *
 * Run with both dev servers up:  pnpm --filter @callme/signal run smoke
 */

import { createHash } from "node:crypto";
import { connect } from "node:net";
import { eq } from "drizzle-orm";
import { getDb, sessions, users } from "@callme/db";
import {
  MATCH_ACK_TIMEOUT_MS,
  type ClientMessage,
  type ServerMessage,
} from "@callme/protocol";
import { loadRootEnv } from "@callme/db";

loadRootEnv();

const WEB = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const WS_URL = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:3001/ws";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* -------------------------------------------------------------------------- */

/**
 * Mints a guest identity.
 *
 * Goes through /api/ws-ticket rather than /chat because Next only permits
 * writing cookies from a Route Handler or Server Action, never during a Server
 * Component render. The first call is expected to come back 403
 * age_not_confirmed — the identity is still created and the cookie still set,
 * which is precisely what a real first-time visitor experiences before they
 * pass the age gate.
 */
async function createGuest(label: string) {
  const res = await fetch(`${WEB}/api/ws-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fingerprint: `smoke-${label}` }),
  });
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookies.includes("callme_session")) {
    throw new Error(`${label}: no session cookie issued (HTTP ${res.status})`);
  }

  const token = cookies.split("callme_session=")[1]!.split(";")[0]!;
  const sessionId = createHash("sha256").update(token).digest("hex");

  const rows = await getDb()
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const userId = rows[0]?.userId;
  if (!userId) throw new Error(`${label}: session not found in database`);

  // The age gate is a UI flow; the harness sets the flag directly so the test
  // stays focused on matchmaking rather than re-implementing a form post.
  await getDb()
    .update(users)
    .set({ ageConfirmedAt: new Date(), tosVersion: 1 })
    .where(eq(users.id, userId));

  return { label, cookies, userId };
}

async function getTicket(guest: { label: string; cookies: string }) {
  const res = await fetch(`${WEB}/api/ws-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: guest.cookies },
    body: JSON.stringify({ fingerprint: `smoke-${guest.label}` }),
  });
  if (!res.ok) {
    throw new Error(`${guest.label}: ticket failed HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { ticket: string; url: string };
}

/* -------------------------------------------------------------------------- */

/**
 * Sends a WebSocket upgrade request by hand and returns the HTTP status the
 * server answers with: 101 for an accepted handshake, 403 for a rejected
 * origin. Raw TCP because no HTTP client will let us set these headers.
 */
function handshake(origin: string): Promise<number> {
  const url = new URL(WS_URL);
  const port = Number(url.port) || 80;
  const host = url.hostname;

  return new Promise((resolve) => {
    const socket = connect(port, host, () => {
      socket.write(
        [
          `GET ${url.pathname} HTTP/1.1`,
          `Host: ${host}:${port}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          "Sec-WebSocket-Version: 13",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          `Origin: ${origin}`,
          "",
          "",
        ].join("\r\n"),
      );
    });

    let buf = "";
    const finish = (code: number) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(code);
    };
    const timer = setTimeout(() => finish(0), 4000);

    socket.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      const match = buf.match(/^HTTP\/1\.1 (\d{3})/);
      if (match) finish(Number(match[1]));
    });
    socket.on("error", () => finish(0));
    socket.on("close", () => finish(0));
  });
}

class TestClient {
  ws!: WebSocket;
  received: ServerMessage[] = [];
  private waiters: Array<{
    match: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(public label: string) {}

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error(`${this.label}: websocket error`));
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        this.received.push(msg);
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          const w = this.waiters[i]!;
          if (w.match(msg)) {
            clearTimeout(w.timer);
            this.waiters.splice(i, 1);
            w.resolve(msg);
          }
        }
      };
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Resolves on the next message matching `t`, or rejects after `timeoutMs`. */
  expect<K extends ServerMessage["t"]>(
    t: K,
    timeoutMs = 8000,
  ): Promise<Extract<ServerMessage, { t: K }>> {
    const existing = this.received.find((m) => m.t === t);
    if (existing) return Promise.resolve(existing as Extract<ServerMessage, { t: K }>);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `${this.label}: timed out waiting for "${t}". Got: ${this.received.map((m) => m.t).join(", ") || "nothing"}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({
        match: (m) => m.t === t,
        resolve: (m) => resolve(m as Extract<ServerMessage, { t: K }>),
        timer,
      });
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`\nSmoke test — web ${WEB}, signal ${WS_URL}\n`);

  console.log("1. Guest sessions");
  const [guestA, guestB] = await Promise.all([
    createGuest("A"),
    createGuest("B"),
  ]);
  check("two distinct guest identities", guestA.userId !== guestB.userId);

  console.log("\n2. WebSocket tickets");
  const [ticketA, ticketB] = await Promise.all([
    getTicket(guestA),
    getTicket(guestB),
  ]);
  check("tickets issued", Boolean(ticketA.ticket && ticketB.ticket));

  console.log("\n3. Connect and authenticate");
  const a = new TestClient("A");
  const b = new TestClient("B");
  await Promise.all([a.connect(ticketA.url), b.connect(ticketB.url)]);

  a.send({ t: "hello", ticket: ticketA.ticket });
  b.send({ t: "hello", ticket: ticketB.ticket });

  const [helloA, helloB] = await Promise.all([
    a.expect("hello.ok"),
    b.expect("hello.ok"),
  ]);
  check("both authenticated", helloA.userId === guestA.userId && helloB.userId === guestB.userId);

  const turn = helloA.iceServers.find((s) =>
    String(s.urls).includes("turn:"),
  );
  check(
    "TURN credentials minted",
    Boolean(turn?.username && turn?.credential),
    turn?.username ? `username expires ${turn.username.split(":")[0]}` : "missing",
  );
  // Replay attack: the ticket A just spent must be dead. GETDEL makes
  // consumption atomic, so a ticket leaked into a log or a shared URL is
  // useless to anyone who finds it afterwards.
  const replay = new TestClient("replay");
  await replay.connect(ticketA.url);
  replay.send({ t: "hello", ticket: ticketA.ticket });
  const replayErr = await replay.expect("error", 5000).catch(() => null);
  check(
    "spent ticket cannot be replayed",
    replayErr?.code === "bad_ticket",
    replayErr ? `rejected: ${replayErr.code}` : "no rejection received",
  );
  replay.close();

  console.log("\n4. Queue and match");
  // Joined at the same instant on purpose: this is the race the Lua script
  // exists to make safe.
  a.send({ t: "queue.join", mode: "video", lang: "en", interests: ["music"] });
  b.send({ t: "queue.join", mode: "video", lang: "en", interests: ["music"] });

  const [proposedA, proposedB] = await Promise.all([
    a.expect("match.proposed"),
    b.expect("match.proposed"),
  ]);

  check("both matched", true);
  check("same room id", proposedA.roomId === proposedB.roomId, proposedA.roomId);
  check(
    "matched with each other",
    proposedA.peer.id === guestB.userId && proposedB.peer.id === guestA.userId,
  );
  check(
    "exactly one polite peer",
    proposedA.polite !== proposedB.polite,
    `A=${proposedA.polite} B=${proposedB.polite}`,
  );
  check(
    "interest matched at strictest tier",
    proposedA.peer.interests.includes("music"),
  );

  console.log("\n5. Two-phase ACK");
  a.send({ t: "match.ack", roomId: proposedA.roomId });
  b.send({ t: "match.ack", roomId: proposedB.roomId });

  await Promise.all([a.expect("match.ready"), b.expect("match.ready")]);
  check("both received ready after both ACKed", true);

  /**
   * Regression guard: an ACKed match must STAY alive.
   *
   * This test previously stopped at `match.ready` and moved on within a second,
   * so it never observed what happened at the ACK deadline — and a duplicate,
   * orphaned timer was cancelling every connected call five seconds in. From
   * the test's point of view everything passed; from a user's point of view the
   * app never connected to anyone. Waiting past the deadline is the whole
   * point of this check, so the sleep is not padding.
   */
  console.log(
    `     waiting ${MATCH_ACK_TIMEOUT_MS + 1500}ms past the ACK deadline…`,
  );
  await new Promise((r) => setTimeout(r, MATCH_ACK_TIMEOUT_MS + 1500));

  const cancelled = [...a.received, ...b.received].filter(
    (m) => m.t === "match.cancelled",
  );
  check(
    "match survives past the ACK deadline",
    cancelled.length === 0,
    cancelled.length > 0
      ? `got ${cancelled.length} spurious match.cancelled`
      : "no spurious cancellation",
  );

  console.log("\n6. Signal relay");
  a.send({
    t: "signal",
    roomId: proposedA.roomId,
    payload: { kind: "offer", sdp: "v=0\r\no=- smoke 0 IN IP4 127.0.0.1\r\n" },
  });
  const relayed = await b.expect("signal");
  check(
    "offer relayed A -> B",
    relayed.payload.kind === "offer" && relayed.roomId === proposedA.roomId,
  );

  console.log("\n7. Origin policy");
  // Regression guard for LAN access: a phone on the same wifi must be able to
  // connect in dev, while a foreign origin must not.
  //
  // Done over a raw socket rather than fetch(): Connection, Upgrade and
  // Sec-WebSocket-* are forbidden header names in undici, so fetch silently
  // refuses to send them and every request fails identically — which makes the
  // "accepted" assertion pass for the wrong reason.
  const foreign = await handshake("http://evil.example.com");
  check("foreign origin rejected", foreign === 403, `HTTP ${foreign}`);

  const lan = await handshake("http://192.168.1.50:3100");
  check(
    "private LAN origin accepted in dev",
    lan === 101,
    `HTTP ${lan} — lets a phone on the same wifi connect`,
  );

  console.log("\n8. Skip and re-queue");
  a.send({ t: "peer.skip", roomId: proposedA.roomId, requeue: true });
  const left = await b.expect("peer.left");
  check("peer.left delivered to B", left.reason === "peer_skipped", left.reason);

  a.close();
  b.close();

  console.log(
    failures === 0
      ? "\n\x1b[32mAll checks passed.\x1b[0m\n"
      : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mSmoke test error:\x1b[0m ${err.message}\n`);
  process.exit(1);
});
