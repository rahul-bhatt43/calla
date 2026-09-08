/**
 * Shared tuning constants. These are protocol-level agreements: changing one
 * here without changing the other side will produce subtle timing bugs, so they
 * live in the shared package rather than in either app.
 */

/** Chat mode. `text` skips getUserMedia entirely (low-bandwidth / no-camera users). */
export const MODES = ["video", "text"] as const;
export type Mode = (typeof MODES)[number];

/**
 * Matching tiers, in the order the queue relaxes through them. A user starts at
 * `interest` and widens outward the longer they wait, so a niche interest never
 * means an infinite wait — it just means a few extra seconds of trying.
 */
export const TIERS = ["interest", "language", "global"] as const;
export type Tier = (typeof TIERS)[number];

/** Milliseconds spent in each tier before widening to the next one. */
export const TIER_WIDEN_MS: Record<Tier, number> = {
  interest: 8_000,
  language: 15_000,
  global: Infinity,
};

/** How long a node tries to match within its own process before using Redis. */
export const LOCAL_MATCH_WINDOW_MS = 300;

/**
 * Both peers must ACK a proposed match within this window. Covers the dead-tab
 * case: a socket can be open while the browser is frozen or backgrounded.
 */
export const MATCH_ACK_TIMEOUT_MS = 5_000;

/** Client ping interval. The server's idle timeout is set to ~2.5x this. */
export const HEARTBEAT_INTERVAL_MS = 20_000;
export const HEARTBEAT_TIMEOUT_S = 50;

/** How many recent partners to remember, to avoid immediately re-matching. */
export const RECENT_PARTNERS_LIMIT = 20;
export const RECENT_PARTNERS_TTL_S = 60 * 30;

/** Max bytes for a single inbound WS frame. SDP is the largest legitimate payload. */
export const MAX_FRAME_BYTES = 64 * 1024;

/** Bitrate ceiling applied once we detect the connection is going through TURN. */
export const RELAY_MAX_BITRATE_BPS = 500_000;
export const DIRECT_MAX_BITRATE_BPS = 1_800_000;

/** Reasons a peer session can end. Used for analytics and for the UI copy. */
export const END_REASONS = [
  "skipped",
  "peer_skipped",
  "disconnected",
  "peer_disconnected",
  "reported",
  "banned",
  "ice_failed",
  "ack_timeout",
] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Report categories. Ordered by severity — the admin queue sorts on this. */
export const REPORT_REASONS = [
  "nudity",
  "minor",
  "harassment",
  "violence",
  "spam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Error codes the client is expected to branch on. */
export const ERROR_CODES = [
  "bad_ticket",
  "banned",
  "rate_limited",
  "invalid_message",
  "not_in_room",
  "already_queued",
  "server_shutting_down",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
