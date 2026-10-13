CREATE TABLE "analytics_policies" (
	"account_id" text PRIMARY KEY NOT NULL,
	"estimated_statuses" jsonb DEFAULT '["PENDING","APPROVED","PAID"]'::jsonb NOT NULL,
	"mapping_acknowledged" boolean DEFAULT false NOT NULL,
	"other_cost_per_day" numeric(30, 6) DEFAULT '0' NOT NULL,
	"auto_sync" boolean DEFAULT false NOT NULL,
	"next_sync_at" timestamp (3) with time zone,
	"lifetime_start" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_ads" (
	"id" text PRIMARY KEY NOT NULL,
	"day_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"ad_set_id" text NOT NULL,
	"ad_set_name" text NOT NULL,
	"ad_name" text NOT NULL,
	"page_meta_id" text,
	"post_id" text,
	"campaign_status" text NOT NULL,
	"ad_set_status" text NOT NULL,
	"ad_status" text NOT NULL,
	"spend" numeric(30, 6) NOT NULL,
	"impressions" numeric(30, 0) NOT NULL,
	"clicks" numeric(30, 0) NOT NULL,
	"link_clicks" numeric(30, 0),
	"lpv" numeric(30, 0),
	"reach" numeric(30, 0)
);
--> statement-breakpoint
CREATE TABLE "insight_days" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"day" text NOT NULL,
	"provider" text NOT NULL,
	"fingerprint" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"synced_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider" text NOT NULL,
	"since" text NOT NULL,
	"until" text NOT NULL,
	"state" text NOT NULL,
	"error_code" text,
	"fingerprint" text,
	"encrypted_raw" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_policies" ADD CONSTRAINT "analytics_policies_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_policies" ADD CONSTRAINT "analytics_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_ads" ADD CONSTRAINT "insight_ads_day_id_insight_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."insight_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_ads" ADD CONSTRAINT "insight_ads_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_days" ADD CONSTRAINT "insight_days_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_days" ADD CONSTRAINT "insight_days_run_id_insight_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."insight_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_runs" ADD CONSTRAINT "insight_runs_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_runs" ADD CONSTRAINT "insight_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insight_ad_day_unique" ON "insight_ads" USING btree ("day_id","ad_id");--> statement-breakpoint
CREATE INDEX "insight_ad_account" ON "insight_ads" USING btree ("account_id","ad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_day_account_unique" ON "insight_days" USING btree ("account_id","day");--> statement-breakpoint
CREATE INDEX "insight_run_account_date" ON "insight_runs" USING btree ("account_id","created_at");--> statement-breakpoint
ALTER TABLE insight_days ADD CONSTRAINT insight_day_provider CHECK (provider IN ('API','CSV'));
--> statement-breakpoint
ALTER TABLE insight_runs ADD CONSTRAINT insight_run_provider CHECK (provider IN ('API','CSV'));
--> statement-breakpoint
ALTER TABLE insight_runs ADD CONSTRAINT insight_run_state CHECK (state IN ('APPLIED','FAILED'));
--> statement-breakpoint
ALTER TABLE insight_runs ADD CONSTRAINT insight_run_period CHECK (since <= until);
--> statement-breakpoint
ALTER TABLE insight_ads ADD CONSTRAINT insight_metrics_nonnegative CHECK (spend >= 0 AND impressions >= 0 AND clicks >= 0 AND (link_clicks IS NULL OR link_clicks >= 0) AND (lpv IS NULL OR lpv >= 0) AND (reach IS NULL OR reach >= 0));
--> statement-breakpoint
ALTER TABLE analytics_policies ADD CONSTRAINT analytics_cost_nonnegative CHECK (other_cost_per_day >= 0);
