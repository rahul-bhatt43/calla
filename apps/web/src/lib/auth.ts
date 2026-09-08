import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import {
  devices,
  getBlockedUserIds,
  getDb,
  newId,
  sessions,
  users,
  type User,
} from "@callme/db";

export const SESSION_COOKIE = "callme_session";
const SESSION_TTL_DAYS = 60;
const GUEST_TTL_DAYS = 14;

/* -------------------------------------------------------------------------- */
/* Hashing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * OWASP-recommended Argon2id parameters. Deliberately expensive: this is the
 * only thing standing between a leaked database and every user's password.
 */
const ARGON_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string) => argonHash(plain, ARGON_OPTS);

export async function verifyPassword(
  storedHash: string | null,
  plain: string,
): Promise<boolean> {
  // Still run a verification against a dummy hash when the account has no
  // password, so "no such user" and "wrong password" take the same time and
  // can't be distinguished by an attacker enumerating usernames.
  if (!storedHash) {
    await argonVerify(DUMMY_HASH, plain).catch(() => false);
    return false;
  }
  try {
    return await argonVerify(storedHash, plain);
  } catch {
    return false;
  }
}

// Precomputed once at module load; the value is irrelevant, only the cost is.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$SXQgZG9lc250IG1hdHRlciB3aGF0IHRoaXMgaXM";

/** SHA-256, not Argon2: session tokens are already 256 bits of CSPRNG output,
 *  so there is nothing to brute-force and the lookup must stay fast. */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function hashIp(ip: string): string {
  const salt = process.env.SESSION_SECRET ?? "dev";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Recovery codes                                                              */
/* -------------------------------------------------------------------------- */

// Crockford-ish: no I, L, O, U — the characters people misread when copying a
// code off a screen by hand, which is exactly how this will be used.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  const bytes = randomBytes(15);
  let out = "";
  for (let i = 0; i < 15; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out; // e.g. K3M7Q-8XZ2R-VN4TP
}

export const hashRecoveryCode = (code: string) =>
  argonHash(code.toUpperCase().replace(/[^A-Z0-9]/g, ""), ARGON_OPTS);

export async function verifyRecoveryCode(
  storedHash: string | null,
  code: string,
): Promise<boolean> {
  if (!storedHash) return false;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  try {
    return await argonVerify(storedHash, normalized);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Guest identities                                                            */
/* -------------------------------------------------------------------------- */

const ADJECTIVES = [
  "swift", "quiet", "bright", "clever", "gentle", "brave", "lucky", "sunny",
  "calm", "keen", "witty", "bold", "warm", "eager", "merry", "noble",
  "amber", "cosmic", "velvet", "golden", "silver", "crimson", "azure", "jade",
];
const ANIMALS = [
  "otter", "falcon", "heron", "lynx", "panda", "koala", "raven", "fox",
  "bison", "ibex", "tapir", "gecko", "puffin", "marten", "osprey", "wren",
  "badger", "cormorant", "meerkat", "narwhal", "pangolin", "quokka",
];

export function generateDisplayName(): string {
  const a = ADJECTIVES[randomBytes(1)[0]! % ADJECTIVES.length]!;
  const b = ANIMALS[randomBytes(1)[0]! % ANIMALS.length]!;
  const n = (randomBytes(1)[0]! % 90) + 10;
  return `${a}-${b}-${n}`;
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export interface RequestContext {
  ip: string;
  userAgent: string;
  /** True only when the browser's connection is actually HTTPS. */
  isHttps: boolean;
  /** Host as the client addressed it, e.g. "192.168.0.160:3100". */
  host: string;
}

export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ??
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    "0.0.0.0";

  return {
    ip,
    userAgent: h.get("user-agent") ?? "",
    isHttps: isSecureRequest(h),
    host: h.get("x-forwarded-host") ?? h.get("host") ?? "",
  };
}

/**
 * Whether the browser reached us over HTTPS.
 *
 * Node never terminates TLS here — `next start` serves plain HTTP and TLS is
 * always terminated upstream by Caddy or Cloudflare, both of which set
 * `x-forwarded-proto`. So the header is the only honest signal, and its absence
 * genuinely means the connection was plain HTTP.
 */
function isSecureRequest(h: Headers): boolean {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}

export async function createSession(
  userId: string,
  isGuest: boolean,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ctx = await getRequestContext();
  const ttlDays = isGuest ? GUEST_TTL_DAYS : SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);

  await getDb().insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ipHash: hashIp(ctx.ip),
    uaHash: sha256(ctx.userAgent),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    /**
     * Keyed to the actual transport, not to NODE_ENV.
     *
     * A `Secure` cookie sent over plain HTTP is silently discarded by the
     * browser — no error, no warning, the session simply never persists. Tying
     * this to the build mode meant a production build served over HTTP on a LAN
     * set a flag that guaranteed its own cookie would be thrown away. It looked
     * fine on the developer's machine only because browsers treat `localhost`
     * as a secure context and accept `Secure` cookies there over HTTP.
     *
     * In real deployments TLS terminates at Caddy, which sets
     * `x-forwarded-proto: https`, so this is still set wherever it matters.
     */
    secure: ctx.isHttps,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export interface CurrentUser extends User {
  sessionId: string;
}

/**
 * Resolves the session cookie to a user. Opaque token, looked up every request:
 * that is the whole reason this isn't a JWT — a ban has to take effect on the
 * user's very next action, not whenever their token happens to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const id = sha256(token);

  const rows = await db
    .select({ user: users, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return { ...row.user, sessionId: row.sessionId };
}

/**
 * Returns the current user, creating a guest identity if there isn't one.
 *
 * Guests are ordinary rows, not a parallel concept. That is what lets the
 * eventual sign-up be an UPDATE rather than an INSERT, so trust score and
 * strike history survive the upgrade instead of resetting to zero — which
 * would make "create an account" a one-click reputation wash.
 */
export async function getOrCreateGuest(): Promise<CurrentUser> {
  const existing = await getCurrentUser();
  if (existing) return existing;

  const db = getDb();
  const id = newId();
  const displayName = generateDisplayName();

  const [user] = await db
    .insert(users)
    .values({ id, displayName, isGuest: true, trustScore: 0 })
    .returning();

  await createSession(id, true);
  return { ...user!, sessionId: "" };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user. Used on password change and on ban. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/* -------------------------------------------------------------------------- */
/* Devices                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Records a device fingerprint against a user so device-level bans have
 * something to bite on. A fingerprint is a weak signal, not an identity —
 * families share machines and browsers actively fight fingerprinting — so it
 * feeds moderation decisions rather than making them.
 */
export async function recordDevice(
  userId: string,
  fingerprint: string,
  ip: string,
): Promise<string> {
  const fingerprintHash = sha256(fingerprint);
  const db = getDb();

  await db
    .insert(devices)
    .values({
      id: newId(),
      userId,
      fingerprintHash,
      ipHash: hashIp(ip),
    })
    .onConflictDoUpdate({
      target: [devices.userId, devices.fingerprintHash],
      set: { lastSeenAt: new Date() },
    });

  return fingerprintHash;
}

export async function getBlockedIds(userId: string): Promise<string[]> {
  return getBlockedUserIds(getDb(), userId);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
