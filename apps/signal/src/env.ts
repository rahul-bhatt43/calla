import { randomBytes } from "node:crypto";
import { loadRootEnv } from "@callme/db";

// Before anything below reads process.env. tsx and plain node both start with
// an empty environment; only Docker injects config directly.
loadRootEnv();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(
      `[signal] missing required env var ${name}. Copy .env.example to .env.`,
    );
    process.exit(1);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",

  port: int("SIGNAL_PORT", 3001),
  host: process.env.SIGNAL_HOST ?? "0.0.0.0",

  /**
   * Identifies this process in the presence map so peers on other nodes can be
   * reached. Random per boot: a restarted node must not inherit the stale
   * routing entries of its predecessor.
   */
  nodeId: process.env.SIGNAL_NODE_ID ?? `n_${randomBytes(4).toString("hex")}`,

  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://callme:callme@localhost:5432/callme",
  ),

  /** Must match `static-auth-secret` in turnserver.conf. */
  turnSecret: required("TURN_SECRET", "dev-turn-secret-change-me"),
  turnRealm: process.env.TURN_REALM ?? "localhost",
  turnHost: process.env.TURN_HOST ?? "localhost",
  turnPort: int("TURN_PORT", 3478),
  turnTlsPort: int("TURN_TLS_PORT", 5349),
  turnCredentialTtlSec: int("TURN_CREDENTIAL_TTL", 3600),

  /** Comma-separated origins allowed to open a websocket. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * How many queue entries the matchmaker inspects per attempt. Bounded because
   * the Lua script blocks Redis while it runs — and note the queue is *shortest*
   * exactly when traffic is highest, since everyone matches immediately.
   */
  matchScanLimit: int("MATCH_SCAN_LIMIT", 60),

  /** Directory for report evidence frames. */
  evidenceDir: process.env.EVIDENCE_DIR ?? "./data/evidence",

  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
} as const;
