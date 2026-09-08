import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  addBlock,
  bans,
  creditCallTime,
  devices,
  findActiveBan,
  getDb,
  newId,
  penalizeUser,
  reports,
} from "@callme/db";
import type { ReportReason } from "@callme/protocol";
import { env } from "./env";
import { logger } from "./logger";
import { metrics } from "./metrics";
import { redis } from "./redis";
import { sendTo, type Conn } from "./hub";

/**
 * Distinct reporters needed within the window before we act without a human.
 * Set above 1 deliberately: a single report is trivially weaponised against
 * someone the reporter simply disliked, and the false-positive cost here is
 * banning an innocent user.
 */
const AUTO_BAN_DISTINCT_REPORTERS = 3;
const AUTO_BAN_WINDOW_HOURS = 24;

/** Reports we act on immediately, before any human review. */
const ZERO_TOLERANCE: ReportReason[] = ["minor"];

function banDurationForStrikes(strikes: number): number | null {
  if (strikes <= 1) return 60 * 60 * 1000; // 1 hour
  if (strikes === 2) return 24 * 60 * 60 * 1000; // 1 day
  if (strikes === 3) return 7 * 24 * 60 * 60 * 1000; // 1 week
  return null; // permanent
}

async function saveEvidence(
  reportId: string,
  base64: string,
): Promise<string | null> {
  try {
    // Strip an optional data-URL prefix; the client sends a raw canvas export.
    const payload = base64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(payload, "base64");
    if (buf.byteLength === 0 || buf.byteLength > 200_000) return null;

    const dir = join(env.evidenceDir, new Date().toISOString().slice(0, 10));
    await mkdir(dir, { recursive: true });
    const key = join(new Date().toISOString().slice(0, 10), `${reportId}.jpg`);
    await writeFile(join(env.evidenceDir, key), buf);
    return key;
  } catch (err) {
    // Losing the frame must never lose the report itself.
    logger.error({ err, reportId }, "failed to persist evidence");
    return null;
  }
}

export async function handleReport(
  conn: Conn,
  input: {
    roomId: string;
    reason: ReportReason;
    note?: string;
    evidence?: string;
    autoFlagged?: boolean;
  },
): Promise<void> {
  const db = getDb();
  const reportedId = conn.peerId;

  if (!reportedId || conn.roomId !== input.roomId) {
    sendTo(conn, { t: "error", code: "not_in_room", message: "Unknown room" });
    return;
  }

  const reportId = newId();
  const evidenceKey = input.evidence
    ? await saveEvidence(reportId, input.evidence)
    : null;

  await db.insert(reports).values({
    id: reportId,
    reporterId: conn.userId,
    reportedId,
    roomId: input.roomId,
    reason: input.reason,
    note: input.note,
    evidenceKey,
    autoFlagged: input.autoFlagged ?? false,
  });

  // Reporting implies never wanting to see them again — making the user perform
  // a second, separate "block" action after reporting is a pointless step.
  await addBlock(db, conn.userId, reportedId);
  conn.blocked.push(reportedId);

  metrics.inc("reports");
  metrics.inc(`reports_${input.reason}`);
  logger.info(
    { reportId, reason: input.reason, reportedId, autoFlagged: input.autoFlagged },
    "report filed",
  );

  await maybeAutoBan(reportedId, input.reason);
}

async function maybeAutoBan(
  reportedId: string,
  reason: ReportReason,
): Promise<void> {
  const db = getDb();
  const since = new Date(Date.now() - AUTO_BAN_WINDOW_HOURS * 3600_000);

  const rows = await db
    .select({ distinctReporters: sql<number>`count(distinct ${reports.reporterId})` })
    .from(reports)
    .where(and(eq(reports.reportedId, reportedId), gte(reports.createdAt, since)));

  const distinct = Number(rows[0]?.distinctReporters ?? 0);
  const immediate = ZERO_TOLERANCE.includes(reason);

  if (!immediate && distinct < AUTO_BAN_DISTINCT_REPORTERS) return;

  const strikes = await penalizeUser(db, reportedId, 1, 50);
  const durationMs = immediate ? null : banDurationForStrikes(strikes);

  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
  const banReason = immediate
    ? `auto: ${reason} (zero tolerance)`
    : `auto: ${distinct} reports in ${AUTO_BAN_WINDOW_HOURS}h`;

  await db.insert(bans).values({
    id: newId(),
    subjectType: "user",
    subjectHash: reportedId,
    reason: banReason,
    expiresAt,
  });
  await applyBanFlag(reportedId, banReason, expiresAt);

  // Pin the device too. An account-only ban is defeated by clicking "sign up"
  // again, which takes about four seconds.
  const devs = await db
    .select({ fingerprintHash: devices.fingerprintHash })
    .from(devices)
    .where(eq(devices.userId, reportedId));

  if (devs.length > 0) {
    await db.insert(bans).values(
      devs.map((d) => ({
        id: newId(),
        subjectType: "device" as const,
        subjectHash: d.fingerprintHash,
        reason: "auto: linked to banned account",
        expiresAt,
      })),
    );
  }

  metrics.inc("auto_bans");
  logger.warn({ reportedId, strikes, permanent: durationMs === null }, "auto-ban applied");
}

/**
 * Mirrors a ban into Redis as an enforcement cache.
 *
 * Postgres stays the source of truth, but the check runs on every queue-join —
 * which at peak is the hottest path in the system — and paying a Postgres round
 * trip there to answer "no" for 99.9% of users would be the single most wasteful
 * query we make. Every write path that issues a ban must call this.
 */
export async function applyBanFlag(
  userId: string,
  reason: string,
  expiresAt: Date | null,
): Promise<void> {
  const payload = JSON.stringify({
    reason,
    until: expiresAt ? expiresAt.getTime() : null,
  });
  const key = `banned:${userId}`;
  if (expiresAt) {
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await redis.set(key, payload, "EX", ttl);
  } else {
    await redis.set(key, payload);
  }
}

/**
 * Re-checked at queue-join rather than only at connect. A ban issued while
 * someone is mid-session has to stop their *next* match, not wait for their
 * cookie to lapse.
 */
export async function assertNotBanned(conn: Conn): Promise<boolean> {
  const cached = await redis.get(`banned:${conn.userId}`);
  if (cached) {
    const { reason, until } = JSON.parse(cached) as {
      reason: string;
      until: number | null;
    };
    sendTo(conn, { t: "banned", until, reason });
    return false;
  }
  return true;
}

/** Full Postgres check across account, device and IP. Used at connect only. */
export async function checkBanCold(subjects: {
  userId: string;
  fingerprintHash: string | null;
  ipHash: string;
}) {
  return findActiveBan(getDb(), subjects);
}

export async function creditSession(
  userId: string,
  durationMs: number,
): Promise<void> {
  const seconds = Math.floor(durationMs / 1000);
  // Sub-minute calls earn nothing: otherwise a bot farms trust by matching and
  // hanging up in a loop.
  if (seconds < 60) return;
  await creditCallTime(getDb(), userId, seconds);
}
