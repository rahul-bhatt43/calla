import { NextResponse } from "next/server";
import { z } from "zod";
import { brand } from "@callme/ui/brand";
import { getOrCreateGuest, getRequestContext } from "@/lib/auth";
import { issueTicket } from "@/lib/ticket";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolves the signalling URL from the perspective of *this* client.
 *
 * The configured value is `ws://localhost:3001/ws`, which is correct for the
 * machine running the dev server and completely wrong for anything else:
 * to a phone on the same wifi, `localhost` means the phone. Rather than making
 * every developer edit .env to test on a real device, a loopback host is
 * rewritten to whatever host the browser actually used to reach us.
 *
 * Only loopback is rewritten — a properly configured production URL is left
 * exactly as it is, so this can't leak an internal hostname to the client.
 */
function resolveSignalUrl(requestHost: string): string {
  const configured =
    process.env.NEXT_PUBLIC_SIGNAL_URL ?? "ws://localhost:3001/ws";

  try {
    const url = new URL(configured);
    const isLoopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLoopback) return configured;

    // host header may include a port; we want only the hostname.
    const clientHost = requestHost.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (!clientHost || clientHost === "localhost" || clientHost === "127.0.0.1") {
      return configured;
    }

    url.hostname = clientHost;
    return url.toString();
  } catch {
    return configured;
  }
}

const bodySchema = z.object({
  // Opaque client-computed device signal. Bounded because it is attacker-
  // controlled and ends up hashed into a ban subject.
  fingerprint: z.string().max(512).nullable().optional(),
});

/**
 * Exchanges the session cookie for a short-lived, single-use WebSocket ticket.
 *
 * The signaling server can't read cookies — it's a separate process behind a
 * different path and, in production, potentially a different host. Rather than
 * teaching it about session tables, it gets a ticket that already encodes the
 * answer to "who is this and are they allowed in".
 */
export async function POST(request: Request) {
  let fingerprint: string | null = null;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (parsed.success) fingerprint = parsed.data.fingerprint ?? null;
  } catch {
    // Body is optional; a client that can't fingerprint still gets a ticket.
  }

  // Creating a guest here is what makes the product usable in one click: the
  // first visit to /chat mints an identity without a signup wall.
  const user = await getOrCreateGuest();

  if (!user.ageConfirmedAt) {
    return NextResponse.json(
      { error: "age_not_confirmed", minimumAge: brand.minimumAge },
      { status: 403 },
    );
  }

  const result = await issueTicket(user, fingerprint);

  if (!result.ok) {
    return NextResponse.json(
      { error: "banned", until: result.until, message: result.message },
      { status: 403 },
    );
  }

  const ctx = await getRequestContext();

  return NextResponse.json(
    {
      ticket: result.ticket,
      url: resolveSignalUrl(ctx.host),
      expiresInSec: result.expiresInSec,
      user: {
        id: user.id,
        displayName: user.displayName,
        isGuest: user.isGuest,
        trustScore: user.trustScore,
      },
    },
    // A ticket is a credential; it must never sit in a CDN or browser cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
