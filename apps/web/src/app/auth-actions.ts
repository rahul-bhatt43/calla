"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, users } from "@callme/db";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  generateRecoveryCode,
  getCurrentUser,
  getOrCreateGuest,
  getRequestContext,
  hashPassword,
  hashRecoveryCode,
  hashIp,
  verifyPassword,
  verifyRecoveryCode,
} from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export type AuthResult =
  | { ok: true; recoveryCode?: string }
  | { ok: false; error: string; field?: "username" | "password" | "code" };

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be 24 characters or fewer")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Use letters, numbers, underscores and hyphens only",
  );

/**
 * Length over composition rules. Mandatory symbols and mixed case push people
 * toward `Password1!` — short, predictable, and weaker than a long passphrase.
 */
const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters — a short phrase works well")
  .max(200, "That's longer than we can store");

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Keyed on IP rather than username. Limiting per-username lets an attacker lock
 * a real user out of their own account simply by failing to log in as them.
 */
async function tooManyAttempts(scope: string, limit: number): Promise<boolean> {
  const ctx = await getRequestContext();
  const key = `authrl:${scope}:${hashIp(ctx.ip)}`;
  const redis = getRedis();

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 900); // 15 minutes
  return count > limit;
}

/* -------------------------------------------------------------------------- */
/* Sign up                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Upgrades the current guest in place rather than creating a new row.
 *
 * This is the whole point of the guest-first model: trust score, strike history
 * and any ban follow the person through sign-up. Inserting a fresh user here
 * would turn "create an account" into a one-click reputation wash, which is the
 * single most common way moderation gets defeated on platforms like this.
 */
export async function signUp(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (await tooManyAttempts("signup", 10)) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const parsedUsername = usernameSchema.safeParse(formData.get("username"));
  if (!parsedUsername.success) {
    return {
      ok: false,
      error: parsedUsername.error.issues[0]!.message,
      field: "username",
    };
  }

  const parsedPassword = passwordSchema.safeParse(formData.get("password"));
  if (!parsedPassword.success) {
    return {
      ok: false,
      error: parsedPassword.error.issues[0]!.message,
      field: "password",
    };
  }

  const username = parsedUsername.data.toLowerCase();
  const db = getDb();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "That username is taken", field: "username" };
  }

  const user = await getOrCreateGuest();
  const recoveryCode = generateRecoveryCode();

  await db
    .update(users)
    .set({
      username,
      displayName: parsedUsername.data,
      passwordHash: await hashPassword(parsedPassword.data),
      recoveryCodeHash: await hashRecoveryCode(recoveryCode),
      isGuest: false,
    })
    .where(eq(users.id, user.id));

  // Promote the guest session to a full-length one.
  await createSession(user.id, false);

  // Returned once and never again — only its hash is stored, so we genuinely
  // cannot show it a second time.
  return { ok: true, recoveryCode };
}

/* -------------------------------------------------------------------------- */
/* Log in                                                                      */
/* -------------------------------------------------------------------------- */

export async function logIn(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (await tooManyAttempts("login", 20)) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = rows[0];

  // verifyPassword runs an Argon2 verification even when there is no user, so
  // "no such account" and "wrong password" take the same time and can't be
  // told apart by an attacker enumerating usernames.
  const valid = await verifyPassword(user?.passwordHash ?? null, password);
  if (!user || !valid) {
    return { ok: false, error: "Incorrect username or password" };
  }

  await createSession(user.id, false);
  redirect("/chat");
}

/* -------------------------------------------------------------------------- */
/* Recovery                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Recovery code, not an emailed link.
 *
 * We have no reliable outbound mail — deliverability from a fresh VPS IP is
 * genuinely poor and an email provider is a third-party dependency this project
 * deliberately avoids. A code the user saves at sign-up keeps recovery entirely
 * self-contained, and it is strictly stronger than an emailed reset link, which
 * is only ever as secure as the mailbox it lands in.
 */
export async function recoverAccount(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  if (await tooManyAttempts("recover", 10)) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") ?? "");

  const parsedPassword = passwordSchema.safeParse(formData.get("password"));
  if (!parsedPassword.success) {
    return {
      ok: false,
      error: parsedPassword.error.issues[0]!.message,
      field: "password",
    };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const user = rows[0];

  const valid = await verifyRecoveryCode(user?.recoveryCodeHash ?? null, code);
  if (!user || !valid) {
    return { ok: false, error: "That code doesn't match", field: "code" };
  }

  const nextCode = generateRecoveryCode();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsedPassword.data),
      recoveryCodeHash: await hashRecoveryCode(nextCode),
      recoveryCodeUsedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Every existing session dies. If the account was taken over, this is what
  // actually evicts the attacker — changing the password alone would leave
  // their session cookie working.
  await destroyAllSessions(user.id);
  await createSession(user.id, false);

  return { ok: true, recoveryCode: nextCode };
}

/* -------------------------------------------------------------------------- */
/* Log out                                                                     */
/* -------------------------------------------------------------------------- */

export async function logOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function getSessionUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isGuest: user.isGuest,
    trustScore: user.trustScore,
  };
}
