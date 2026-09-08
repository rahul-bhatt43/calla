import { createHmac } from "node:crypto";
import type { IceServer } from "@callme/protocol";
import { env } from "./env";

/**
 * coturn's REST-API credential scheme (`use-auth-secret`).
 *
 * The username is `<unix-expiry>:<userId>` and the password is the HMAC-SHA1 of
 * that username under a secret shared with coturn. coturn recomputes the HMAC
 * itself, so no credential is ever stored on either side and nothing has to be
 * revoked when it lapses — it simply stops verifying.
 *
 * This matters more than it looks. A TURN server with static credentials gets
 * scraped within days and turned into somebody's free proxy, and TURN bandwidth
 * is the one cost in this architecture we actually pay per byte.
 */
export function mintTurnCredentials(userId: string): {
  iceServers: IceServer[];
  ttlSec: number;
} {
  const ttlSec = env.turnCredentialTtlSec;
  const expiry = Math.floor(Date.now() / 1000) + ttlSec;
  const username = `${expiry}:${userId}`;
  const credential = createHmac("sha1", env.turnSecret)
    .update(username)
    .digest("base64");

  const { turnHost, turnPort, turnTlsPort } = env;

  return {
    ttlSec,
    iceServers: [
      // STUN first and unauthenticated: it only reports the caller's public
      // address, costs us a single UDP round trip, and resolves the large
      // majority of peers without ever touching the relay.
      { urls: [`stun:${turnHost}:${turnPort}`] },
      {
        urls: [
          `turn:${turnHost}:${turnPort}?transport=udp`,
          `turn:${turnHost}:${turnPort}?transport=tcp`,
        ],
        username,
        credential,
      },
      // TLS on 5349 is the fallback that gets through corporate firewalls which
      // block everything that isn't port-443-shaped traffic.
      {
        urls: [`turns:${turnHost}:${turnTlsPort}?transport=tcp`],
        username,
        credential,
      },
    ],
  };
}
