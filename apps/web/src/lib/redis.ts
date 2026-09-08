import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __callme_redis: Redis | undefined;
}

/**
 * Connection-error logging, deduplicated.
 *
 * ioredis emits an `error` on every reconnect attempt, and its retry strategy
 * runs indefinitely — so a Redis container being restarted underneath a running
 * dev server produces an unbounded flood. Worse, `err.message` is empty for
 * several connection failures (ECONNREFUSED among them), so the naive handler
 * prints thousands of blank lines and tells you nothing.
 *
 * This logs the first occurrence of each distinct failure with its actual code,
 * counts the rest, and reports the total once the connection recovers.
 */
function attachLogging(client: Redis): void {
  let lastCode: string | null = null;
  let suppressed = 0;

  client.on("error", (err: NodeJS.ErrnoException) => {
    // Fall back through the fields that are actually populated — `message` is
    // frequently empty on socket-level failures.
    const code = err.code ?? err.name ?? "UNKNOWN";
    const detail = err.message || err.code || String(err);

    if (code === lastCode) {
      suppressed++;
      return;
    }

    if (suppressed > 0) {
      console.error(`[redis] …and ${suppressed} more ${lastCode} errors`);
      suppressed = 0;
    }

    lastCode = code;
    console.error(
      `[redis] ${code}: ${detail}` +
        (code === "ECONNREFUSED"
          ? ` — is Redis running? Try \`pnpm infra:up\`.`
          : ""),
    );
  });

  client.on("ready", () => {
    if (suppressed > 0) {
      console.error(`[redis] recovered after ${suppressed + 1} ${lastCode} errors`);
    }
    lastCode = null;
    suppressed = 0;
  });
}

/**
 * Cached on globalThis: Next's dev server re-evaluates modules on every edit,
 * and a fresh connection per reload exhausts Redis' client limit within a few
 * minutes of editing.
 */
export function getRedis(): Redis {
  if (globalThis.__callme_redis) return globalThis.__callme_redis;

  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    noDelay: true,
    // Backs off to 3s and keeps trying, so the app reconnects on its own after
    // a container restart instead of needing the dev server bounced.
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });

  attachLogging(client);

  globalThis.__callme_redis = client;
  return client;
}
