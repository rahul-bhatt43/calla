import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { customAlphabet } from "nanoid";
import * as schema from "./schema";
import { loadRootEnv } from "./load-env";

export * from "./schema";
export { schema };
export * from "./queries";
export { loadRootEnv };

/**
 * URL-safe, no lookalike characters. 21 chars at this alphabet is ~125 bits of
 * entropy — ids appear in room URLs, so they double as unguessable capabilities.
 */
const ALPHABET = "0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const newId = customAlphabet(ALPHABET, 21);

export type Database = ReturnType<typeof createDb>;

function createDb(url: string) {
  const client = postgres(url, {
    // Next.js dev spins up many module instances; a small pool per instance
    // keeps us well under Postgres' default max_connections.
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzle(client, { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __callme_db: Database | undefined;
}

/**
 * Cached on globalThis so Next.js hot reloads don't leak a new pool per edit.
 */
export function getDb(): Database {
  if (globalThis.__callme_db) return globalThis.__callme_db;

  if (!process.env.DATABASE_URL) loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run `pnpm infra:up`.",
    );
  }

  const db = createDb(url);
  globalThis.__callme_db = db;
  return db;
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    return Reflect.get(getDb() as object, prop);
  },
});
