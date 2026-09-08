import "server-only";

import { randomBytes } from "node:crypto";
import { findActiveBan, getDb } from "@callme/db";
import { getBlockedIds, getRequestContext, hashIp, recordDevice } from "./auth";
import { getRedis } from "./redis";
import type { CurrentUser } from "./auth";

const TICKET_TTL_SEC = 60;

/**
 * Everything the signaling server needs to know about a connection, resolved
 * once here and handed over as a single-use ticket.
 *
 * The point is that apps/signal never touches Postgres on connect. Auth,
 * blocks and the ban check all happen in this process, where the session
 * cookie lives; the signaling process just reads one Redis key. That keeps the
 * hot path — thousands of sockets opening and closing as people click "next" —
 * off the database entirely.
 */
export interface TicketPayload {
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

export type TicketResult =
  | { ok: true; ticket: string; expiresInSec: number }
  | { ok: false; reason: "banned"; until: number | null; message: string };

export async function issueTicket(
  user: CurrentUser,
  fingerprint: string | null,
): Promise<TicketResult> {
  const db = getDb();
  const ctx = await getRequestContext();
  const ipHash = hashIp(ctx.ip);

  const fingerprintHash = fingerprint
    ? await recordDevice(user.id, fingerprint, ctx.ip)
    : null;

  // Full cold check across account, device and IP. This is the expensive
  // version and it runs once per socket, not once per match — the signaling
  // server re-checks against a Redis flag on every queue-join.
  const ban = await findActiveBan(db, {
    userId: user.id,
    fingerprintHash,
    ipHash,
  });
  if (ban) {
    return {
      ok: false,
      reason: "banned",
      until: ban.expiresAt ? ban.expiresAt.getTime() : null,
      message: ban.reason,
    };
  }

  const blocked = await getBlockedIds(user.id);

  const payload: TicketPayload = {
    userId: user.id,
    displayName: user.displayName,
    isGuest: user.isGuest,
    trustScore: user.trustScore,
    lang: user.lang,
    country: user.country,
    fingerprintHash,
    ipHash,
    blocked,
  };

  const ticket = randomBytes(24).toString("base64url");
  await getRedis().set(
    `ticket:${ticket}`,
    JSON.stringify(payload),
    "EX",
    TICKET_TTL_SEC,
  );

  return { ok: true, ticket, expiresInSec: TICKET_TTL_SEC };
}
