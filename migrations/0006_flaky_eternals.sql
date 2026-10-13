CREATE TABLE "ads_history" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"publish_job_id" text NOT NULL,
	"donor_version_id" text NOT NULL,
	"page_id" text NOT NULL,
	"account_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"mode" text NOT NULL,
	"tracking_id" text,
	"link_version_id" text,
	"snapshot" jsonb NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"phase" text DEFAULT 'NONE' NOT NULL,
	"campaign_id" text,
	"ad_set_id" text,
	"creative_id" text,
	"ad_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_until" timestamp (3) with time zone,
	"error_code" text,
	"verified_at" timestamp (3) with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads_history" ADD CONSTRAINT "ads_history_request_id_ads_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ads_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_history" ADD CONSTRAINT "ads_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_publish_job_id_publish_jobs_id_fk" FOREIGN KEY ("publish_job_id") REFERENCES "public"."publish_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_donor_version_id_donor_versions_id_fk" FOREIGN KEY ("donor_version_id") REFERENCES "public"."donor_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_tracking_id_tracking_records_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."tracking_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_link_version_id_tracking_link_versions_id_fk" FOREIGN KEY ("link_version_id") REFERENCES "public"."tracking_link_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ads_history_request_date" ON "ads_history" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_actor_request_key" ON "ads_requests" USING btree ("created_by","request_key");--> statement-breakpoint
CREATE INDEX "ads_request_due" ON "ads_requests" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "ads_request_page_account" ON "ads_requests" USING btree ("page_id","account_id");--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_state_check CHECK (state IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'));
--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_mode_check CHECK (mode IN ('EXISTING_POST','NEW_CREATIVE'));
--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_phase_check CHECK (phase IN ('NONE','campaign','adSet','creative','ad','DONE'));
--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_attempts_check CHECK (attempts>=0);
--> statement-breakpoint
CREATE UNIQUE INDEX ads_new_tracking_once ON ads_requests(tracking_id) WHERE mode='NEW_CREATIVE' AND state<>'CANCELLED';
--> statement-breakpoint
CREATE TRIGGER ads_history_append_only BEFORE UPDATE OR DELETE ON ads_history FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
