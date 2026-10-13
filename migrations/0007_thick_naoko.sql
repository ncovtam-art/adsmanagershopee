CREATE TABLE "ads_batch_history" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'RUNNING' NOT NULL,
	"source" "meta_source" NOT NULL,
	"structure" text NOT NULL,
	"counts" jsonb NOT NULL,
	"budgets" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_preparations" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_by" text NOT NULL,
	"rows" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"donor_version_id" text NOT NULL,
	"structure" text NOT NULL,
	"overrides" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "bulk_batch_id" text;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "bulk_index" integer;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "campaign_ref_id" text;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "ad_set_ref_id" text;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "clone_source_id" text;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "clone_level" text;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD COLUMN "enqueued_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ads_batch_history" ADD CONSTRAINT "ads_batch_history_batch_id_ads_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ads_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_batch_history" ADD CONSTRAINT "ads_batch_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_batches" ADD CONSTRAINT "ads_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_preparations" ADD CONSTRAINT "ads_preparations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_presets" ADD CONSTRAINT "ads_presets_donor_version_id_donor_versions_id_fk" FOREIGN KEY ("donor_version_id") REFERENCES "public"."donor_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_presets" ADD CONSTRAINT "ads_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ads_batch_history_date" ON "ads_batch_history" USING btree ("batch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_batch_actor_key" ON "ads_batches" USING btree ("created_by","request_key");--> statement-breakpoint
CREATE INDEX "ads_batches_state" ON "ads_batches" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_prepare_actor_key" ON "ads_preparations" USING btree ("created_by","request_key");--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_bulk_batch_id_ads_batches_id_fk" FOREIGN KEY ("bulk_batch_id") REFERENCES "public"."ads_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_campaign_ref_id_ads_requests_id_fk" FOREIGN KEY ("campaign_ref_id") REFERENCES "public"."ads_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_ad_set_ref_id_ads_requests_id_fk" FOREIGN KEY ("ad_set_ref_id") REFERENCES "public"."ads_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_requests" ADD CONSTRAINT "ads_requests_clone_source_id_ads_requests_id_fk" FOREIGN KEY ("clone_source_id") REFERENCES "public"."ads_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE ads_requests DROP CONSTRAINT ads_request_state_check;
--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_state_check CHECK (state IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN','CANCELLED','WAITING'));
--> statement-breakpoint
ALTER TABLE ads_requests ADD CONSTRAINT ads_request_generation_check CHECK (generation>=0);
--> statement-breakpoint
ALTER TABLE ads_batches ADD CONSTRAINT ads_batch_state_check CHECK (state IN ('RUNNING','PAUSED','COMPLETED','NEEDS_ACTION'));
--> statement-breakpoint
CREATE TRIGGER ads_batch_history_append_only BEFORE UPDATE OR DELETE ON ads_batch_history FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
