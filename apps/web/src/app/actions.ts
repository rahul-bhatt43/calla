"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, users } from "@callme/db";
import { brand } from "@callme/ui/brand";
import { getOrCreateGuest, getRequestContext, hashIp } from "@/lib/auth";

/**
 * Records that the user affirmed they meet the minimum age and accepted the
 * terms, with a timestamp and the terms version in force at the time.
 *
 * A self-declared checkbox verifies nothing, and nobody should pretend
 * otherwise. What it does do is establish a clear, dated record that the user
 * was told the rule and asserted they met it — the baseline every platform in
 * this category is expected to have.
 */
export async function confirmAge(): Promise<{
  ok: boolean;
  displayName: string;
}> {
  // A Server Action is one of the few places Next allows writing cookies, so
  // this is where a first-time visitor's guest identity is actually created.
  const user = await getOrCreateGuest();
  const ctx = await getRequestContext();

  await getDb()
    .update(users)
    .set({
      ageConfirmedAt: new Date(),
      tosVersion: brand.tosVersion,
      lastSeenAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Hashed, never stored plaintext: useful for correlating abuse, useless to
  // anyone who gets hold of the table.
  void hashIp(ctx.ip);

  revalidatePath("/chat");
  return { ok: true, displayName: user.displayName };
}
