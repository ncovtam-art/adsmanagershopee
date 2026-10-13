CREATE TABLE "api_rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"run_id" text NOT NULL,
	"object_id" text NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "care_pauses" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"account_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"level" text NOT NULL,
	"object_id" text NOT NULL,
	"state" text NOT NULL,
	"error_code" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"config_hash" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"auto_enabled" boolean DEFAULT false NOT NULL,
	"dry_run_id" text,
	"next_run_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"config_hash" text NOT NULL,
	"dry_run" boolean NOT NULL,
	"state" text NOT NULL,
	"result" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"event" text NOT NULL,
	"resource_id" text NOT NULL,
	"text" text NOT NULL,
	"config_version" integer NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"message_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"encrypted_token" text NOT NULL,
	"chat_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"events" jsonb NOT NULL,
	"cooldown_minutes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care_alerts" ADD CONSTRAINT "care_alerts_rule_id_care_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."care_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_alerts" ADD CONSTRAINT "care_alerts_run_id_care_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."care_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_alerts" ADD CONSTRAINT "care_alerts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_pauses" ADD CONSTRAINT "care_pauses_rule_id_care_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."care_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_pauses" ADD CONSTRAINT "care_pauses_alert_id_care_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."care_alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_pauses" ADD CONSTRAINT "care_pauses_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_pauses" ADD CONSTRAINT "care_pauses_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_rules" ADD CONSTRAINT "care_rules_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_rules" ADD CONSTRAINT "care_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_runs" ADD CONSTRAINT "care_runs_rule_id_care_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."care_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_runs" ADD CONSTRAINT "care_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_settings" ADD CONSTRAINT "telegram_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_rate_expiry" ON "api_rate_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "care_alert_rule_object_date" ON "care_alerts" USING btree ("rule_id","object_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "care_pause_object_once" ON "care_pauses" USING btree ("account_id","source","level","object_id");--> statement-breakpoint
CREATE INDEX "care_rule_due" ON "care_rules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "care_rule_account" ON "care_rules" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "care_run_rule_date" ON "care_runs" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_key_unique" ON "notification_jobs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "notification_due" ON "notification_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "notification_event_resource_date" ON "notification_jobs" USING btree ("event","resource_id","created_at");