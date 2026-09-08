import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "./index";
import { bans, blocks, users, type Ban } from "./schema";

/* -------------------------------------------------------------------------- */
/* Ban enforcement                                                             */
/* -------------------------------------------------------------------------- */

export interface BanSubjects {
  userId?: string | null;
  fingerprintHash?: string | null;
  ipHash?: string | null;
}

/**
 * One indexed query across all three subject types. Checked at queue-join, not
 * just at login — otherwise a banned user with an already-open session keeps
 * matching until their cookie happens to expire.
 */
export async function findActiveBan(
  db: Database,
  subjects: BanSubjects,
): Promise<Ban | null> {
  const clauses = [];
  if (subjects.userId)
    clauses.push(
      and(eq(bans.subjectType, "user"), eq(bans.subjectHash, subjects.userId)),
    );
  if (subjects.fingerprintHash)
    clauses.push(
      and(
        eq(bans.subjectType, "device"),
        eq(bans.subjectHash, subjects.fingerprintHash),
      ),
    );
  if (subjects.ipHash)
    clauses.push(
      and(eq(bans.subjectType, "ip"), eq(bans.subjectHash, subjects.ipHash)),
    );

  if (clauses.length === 0) return null;

  const rows = await db
    .select()
    .from(bans)
    .where(
      and(
        or(...clauses),
        isNull(bans.liftedAt),
        or(isNull(bans.expiresAt), gt(bans.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(bans.expiresAt))
    .limit(1);

  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Symmetric: if either side blocked the other, they must never meet again.
 * Loaded into Redis on queue-join so the Lua matchmaker can filter without a
 * round trip to Postgres on every pop.
 */
export async function getBlockedUserIds(
  db: Database,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ a: blocks.blockerId, b: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));

  const out = new Set<string>();
  for (const r of rows) out.add(r.a === userId ? r.b : r.a);
  return [...out];
}

export async function addBlock(
  db: Database,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await db
    .insert(blocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing();
}

/* -------------------------------------------------------------------------- */
/* Trust                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Trust accrues from completed call time, which is expensive to fake at scale:
 * a bot farm has to hold real WebRTC sessions open to earn it. Capped so a
 * long-tenured account can't accumulate unlimited immunity.
 */
export async function creditCallTime(
  db: Database,
  userId: string,
  seconds: number,
): Promise<void> {
  const points = Math.floor(Math.min(seconds, 600) / 60);
  await db
    .update(users)
    .set({
      totalCallSeconds: sql`${users.totalCallSeconds} + ${seconds}`,
      totalCalls: sql`${users.totalCalls} + 1`,
      trustScore: sql`LEAST(${users.trustScore} + ${points}, 1000)`,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function penalizeUser(
  db: Database,
  userId: string,
  strikes: number,
  trustPenalty: number,
): Promise<number> {
  const rows = await db
    .update(users)
    .set({
      strikes: sql`${users.strikes} + ${strikes}`,
      trustScore: sql`GREATEST(${users.trustScore} - ${trustPenalty}, -1000)`,
    })
    .where(eq(users.id, userId))
    .returning({ strikes: users.strikes });
  return rows[0]?.strikes ?? 0;
}

export async function getUsersByIds(db: Database, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}
