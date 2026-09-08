CREATE TYPE "public"."ban_subject" AS ENUM('user', 'device', 'ip');--> statement-breakpoint
CREATE TYPE "public"."candidate_type" AS ENUM('host', 'srflx', 'prflx', 'relay', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."chat_mode" AS ENUM('video', 'text');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('nudity', 'minor', 'harassment', 'violence', 'spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TABLE "bans" (
	"id" char(21) PRIMARY KEY NOT NULL,
	"subject_type" "ban_subject" NOT NULL,
	"subject_hash" varchar(64) NOT NULL,
	"reason" varchar(200) NOT NULL,
	"note" text,
	"issued_by" char(21),
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" char(21) NOT NULL,
	"blocked_id" char(21) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" char(21) PRIMARY KEY NOT NULL,
	"room_id" char(21) NOT NULL,
	"a_user_id" char(21) NOT NULL,
	"b_user_id" char(21) NOT NULL,
	"mode" "chat_mode" NOT NULL,
	"matched_tier" varchar(16),
	"setup_ms" integer,
	"duration_ms" integer,
	"candidate_type" "candidate_type",
	"was_relayed" boolean,
	"end_reason" varchar(24),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" char(21) PRIMARY KEY NOT NULL,
	"user_id" char(21) NOT NULL,
	"fingerprint_hash" char(64) NOT NULL,
	"ip_hash" char(64),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"label" varchar(48) NOT NULL,
	"category" varchar(24) NOT NULL,
	"emoji" varchar(8),
	"blurb" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" char(21) PRIMARY KEY NOT NULL,
	"reporter_id" char(21) NOT NULL,
	"reported_id" char(21) NOT NULL,
	"room_id" char(21) NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" varchar(500),
	"evidence_key" varchar(200),
	"auto_flagged" boolean DEFAULT false NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" char(21),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" char(64) PRIMARY KEY NOT NULL,
	"user_id" char(21) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" char(64),
	"ua_hash" char(64)
);
--> statement-breakpoint
CREATE TABLE "user_interests" (
	"user_id" char(21) NOT NULL,
	"interest_id" varchar(24) NOT NULL,
	CONSTRAINT "user_interests_user_id_interest_id_pk" PRIMARY KEY("user_id","interest_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(21) PRIMARY KEY NOT NULL,
	"username" varchar(24),
	"display_name" varchar(32) NOT NULL,
	"password_hash" text,
	"email" varchar(255),
	"email_verified_at" timestamp with time zone,
	"recovery_code_hash" text,
	"recovery_code_used_at" timestamp with time zone,
	"is_guest" boolean DEFAULT true NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"strikes" smallint DEFAULT 0 NOT NULL,
	"lang" varchar(5) DEFAULT 'en' NOT NULL,
	"country" char(2),
	"age_confirmed_at" timestamp with time zone,
	"tos_version" smallint,
	"total_call_seconds" integer DEFAULT 0 NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_users_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bans_subject_idx" ON "bans" USING btree ("subject_type","subject_hash");--> statement-breakpoint
CREATE INDEX "bans_expires_idx" ON "bans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_logs_room_uq" ON "call_logs" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "call_logs_started_idx" ON "call_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "call_logs_a_idx" ON "call_logs" USING btree ("a_user_id");--> statement-breakpoint
CREATE INDEX "call_logs_relay_idx" ON "call_logs" USING btree ("was_relayed","started_at");--> statement-breakpoint
CREATE INDEX "devices_fingerprint_idx" ON "devices" USING btree ("fingerprint_hash");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_fp_uq" ON "devices" USING btree ("user_id","fingerprint_hash");--> statement-breakpoint
CREATE INDEX "interests_category_idx" ON "interests" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reported_idx" ON "reports" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_last_seen_idx" ON "users" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "users_guest_idx" ON "users" USING btree ("is_guest");