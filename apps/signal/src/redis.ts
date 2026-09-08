import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const here = dirname(fileURLToPath(import.meta.url));
const matchmakeLua = readFileSync(join(here, "lua", "matchmake.lua"), "utf8");

/** Raw reply shape of matchmake.lua — a flat string array, tagged at [0]. */
export type MatchmakeReply = string[];

interface Commands {
  matchmake(...args: (string | number)[]): Promise<MatchmakeReply>;
  /** Sliding-window rate limiter. Returns [allowed, retryAfterMs]. */
  ratelimit(...args: (string | number)[]): Promise<[number, number]>;
}

export type RedisClient = Redis & Commands;

function connect(role: string): Redis {
  const client = new Redis(env.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    // Signaling is latency-critical and every message is small; disabling
    // Nagle removes up to 40ms of coalescing delay per hop.
    noDelay: true,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on("error", (err) => logger.error({ err, role }, "redis error"));
  client.on("connect", () => logger.info({ role }, "redis connected"));
  return client;
}

function withCommands(client: Redis): RedisClient {
  client.defineCommand("matchmake", { numberOfKeys: 0, lua: matchmakeLua });

  client.defineCommand("ratelimit", {
    numberOfKeys: 1,
    lua: `
      -- KEYS[1] bucket, ARGV[1] limit, ARGV[2] windowMs, ARGV[3] nowMs
      local limit  = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now    = tonumber(ARGV[3])

      redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
      local used = redis.call('ZCARD', KEYS[1])
      if used >= limit then
        local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
        local retry = window - (now - tonumber(oldest[2]))
        return { 0, math.max(retry, 0) }
      end

      redis.call('ZADD', KEYS[1], now, now .. ':' .. math.random())
      redis.call('PEXPIRE', KEYS[1], window)
      return { 1, 0 }
    `,
  });

  return client as RedisClient;
}

/** Command connection. */
export const redis = withCommands(connect("cmd"));

/**
 * Pub/sub needs its own connection: a Redis client in subscriber mode refuses
 * ordinary commands, so sharing one would deadlock the matchmaker.
 */
export const sub = connect("sub");
export const pub = connect("pub");

export const keys = {
  queue: (mode: string) => `q:${mode}`,
  profile: (userId: string) => `u:${userId}`,
  alive: (userId: string) => `alive:${userId}`,
  recent: (userId: string) => `recent:${userId}`,
  room: (roomId: string) => `room:${roomId}`,
  presence: "presence",
  nodeChannel: (nodeId: string) => `node:${nodeId}`,
  ticket: (token: string) => `ticket:${token}`,
  rate: (scope: string, id: string) => `rl:${scope}:${id}`,
} as const;

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), sub.quit(), pub.quit()]);
}
