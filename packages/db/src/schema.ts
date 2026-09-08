import {
  boolean,
  char,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const banSubjectEnum = pgEnum("ban_subject", ["user", "device", "ip"]);
export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "actioned",
  "dismissed",
]);
export const reportReasonEnum = pgEnum("report_reason", [
  "nudity",
  "minor",
  "harassment",
  "violence",
  "spam",
  "other",
]);
export const modeEnum = pgEnum("chat_mode", ["video", "text"]);
export const candidateTypeEnum = pgEnum("candidate_type", [
  "host",
  "srflx",
  "prflx",
  "relay",
  "unknown",
]);
export const roleEnum = pgEnum("user_role", ["user", "moderator", "admin"]);

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One row for everybody, guests included. A guest that signs up is UPDATED in
 * place rather than replaced, so trust score, strikes and ban history survive
 * the upgrade. If we created a fresh row instead, "make an account" would be a
 * free way to launder a bad reputation.
 */
export const users = pgTable(
  "users",
  {
    id: char("id", { length: 21 }).primaryKey(),

    /** Canonical lowercase handle. Null for guests. */
    username: varchar("username", { length: 24 }),
    /** What we actually render. Guests get a generated one like "swift-otter". */
    displayName: varchar("display_name", { length: 32 }).notNull(),

    passwordHash: text("password_hash"),

    /** Optional by design — we have no reliable outbound mail. */
    email: varchar("email", { length: 255 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    /** Primary account-recovery path. Shown once at signup, never again. */
    recoveryCodeHash: text("recovery_code_hash"),
    recoveryCodeUsedAt: timestamp("recovery_code_used_at", {
      withTimezone: true,
    }),

    isGuest: boolean("is_guest").notNull().default(true),
    role: roleEnum("role").notNull().default("user"),

    /**
     * Rises with clean session-minutes, falls on upheld reports. Gates interest
     * filters and match priority, so a churned throwaway account starts at a
     * disadvantage without being outright blocked.
     */
    trustScore: integer("trust_score").notNull().default(0),
    strikes: smallint("strikes").notNull().default(0),

    lang: varchar("lang", { length: 5 }).notNull().default("en"),
    country: char("country", { length: 2 }),

    ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
    tosVersion: smallint("tos_version"),

    totalCallSeconds: integer("total_call_seconds").notNull().default(0),
    totalCalls: integer("total_calls").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_uq").on(t.username),
    uniqueIndex("users_email_uq").on(t.email),
    index("users_last_seen_idx").on(t.lastSeenAt),
    index("users_guest_idx").on(t.isGuest),
  ],
);

/* -------------------------------------------------------------------------- */
/* Auth sessions (browser cookie sessions)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Opaque tokens, not JWTs. A ban has to kill an active session instantly, and
 * you cannot revoke a stateless JWT without building a denylist — at which
 * point you have rebuilt this table with extra steps.
 */
export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie value. The raw token is never stored. */
    id: char("id", { length: 64 }).primaryKey(),
    userId: char("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipHash: char("ip_hash", { length: 64 }),
    uaHash: char("ua_hash", { length: 64 }),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Devices                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Ban evasion is the default behaviour of a banned user, so an account ban that
 * doesn't also pin a device is barely a speed bump. Fingerprints are stored
 * hashed and are a signal, not proof — several users legitimately share one.
 */
export const devices = pgTable(
  "devices",
  {
    id: char("id", { length: 21 }).primaryKey(),
    userId: char("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprintHash: char("fingerprint_hash", { length: 64 }).notNull(),
    ipHash: char("ip_hash", { length: 64 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("devices_fingerprint_idx").on(t.fingerprintHash),
    index("devices_user_idx").on(t.userId),
    uniqueIndex("devices_user_fp_uq").on(t.userId, t.fingerprintHash),
  ],
);

/* -------------------------------------------------------------------------- */
/* Bans                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Polymorphic so one table covers account, device and IP bans and the
 * enforcement check is a single indexed query over all three subjects.
 * `expiresAt` null means permanent.
 */
export const bans = pgTable(
  "bans",
  {
    id: char("id", { length: 21 }).primaryKey(),
    subjectType: banSubjectEnum("subject_type").notNull(),
    /** user id, device fingerprint hash, or IP hash depending on subjectType. */
    subjectHash: varchar("subject_hash", { length: 64 }).notNull(),
    reason: varchar("reason", { length: 200 }).notNull(),
    note: text("note"),
    issuedBy: char("issued_by", { length: 21 }).references(() => users.id, {
      onDelete: "set null",
    }),
    /** Null = permanent. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bans_subject_idx").on(t.subjectType, t.subjectHash),
    index("bans_expires_idx").on(t.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export const reports = pgTable(
  "reports",
  {
    id: char("id", { length: 21 }).primaryKey(),
    reporterId: char("reporter_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedId: char("reported_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: char("room_id", { length: 21 }).notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: varchar("note", { length: 500 }),
    /** Relative path of the captured frame on disk. Null if none was attached. */
    evidenceKey: varchar("evidence_key", { length: 200 }),
    /** True when the client's NSFW classifier flagged it, not just the human. */
    autoFlagged: boolean("auto_flagged").notNull().default(false),
    status: reportStatusEnum("status").notNull().default("pending"),
    reviewedBy: char("reviewed_by", { length: 21 }).references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_reported_idx").on(t.reportedId),
    index("reports_reporter_idx").on(t.reporterId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

/** Consulted by the matchmaker so a blocked pair can never be re-matched. */
export const blocks = pgTable(
  "blocks",
  {
    blockerId: char("blocker_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: char("blocked_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("blocks_blocked_idx").on(t.blockedId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Interests                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Doubles as the source of truth for the /interests/[topic] SEO pages, so the
 * matchmaking taxonomy and the indexable page set can never drift apart.
 */
export const interests = pgTable(
  "interests",
  {
    id: varchar("id", { length: 24 }).primaryKey(),
    label: varchar("label", { length: 48 }).notNull(),
    category: varchar("category", { length: 24 }).notNull(),
    emoji: varchar("emoji", { length: 8 }),
    /** Longer copy used only by the SEO landing page for this interest. */
    blurb: text("blurb"),
    sortOrder: smallint("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("interests_category_idx").on(t.category, t.sortOrder)],
);

export const userInterests = pgTable(
  "user_interests",
  {
    userId: char("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interestId: varchar("interest_id", { length: 24 })
      .notNull()
      .references(() => interests.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.interestId] })],
);

/* -------------------------------------------------------------------------- */
/* Call logs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Metadata only. Message content is *architecturally* absent: chat rides the
 * peer-to-peer DataChannel and never passes through us, so there is nothing to
 * store even if we wanted it. `candidateType` is what tells us our real TURN
 * relay ratio, which is the single number that drives bandwidth cost.
 */
export const callLogs = pgTable(
  "call_logs",
  {
    id: char("id", { length: 21 }).primaryKey(),
    roomId: char("room_id", { length: 21 }).notNull(),
    aUserId: char("a_user_id", { length: 21 }).notNull(),
    bUserId: char("b_user_id", { length: 21 }).notNull(),
    mode: modeEnum("mode").notNull(),
    matchedTier: varchar("matched_tier", { length: 16 }),
    setupMs: integer("setup_ms"),
    durationMs: integer("duration_ms"),
    candidateType: candidateTypeEnum("candidate_type"),
    wasRelayed: boolean("was_relayed"),
    endReason: varchar("end_reason", { length: 24 }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    // Unique, not just indexed: both peers report the same call when it ends,
    // and this is what makes the second report an idempotent no-op instead of a
    // duplicate row that would double every aggregate we compute.
    uniqueIndex("call_logs_room_uq").on(t.roomId),
    index("call_logs_started_idx").on(t.startedAt),
    index("call_logs_a_idx").on(t.aUserId),
    index("call_logs_relay_idx").on(t.wasRelayed, t.startedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Ban = typeof bans.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Interest = typeof interests.$inferSelect;
export type CallLog = typeof callLogs.$inferSelect;
