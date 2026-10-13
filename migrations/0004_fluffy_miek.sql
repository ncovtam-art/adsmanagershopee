CREATE TYPE "public"."publisher_job_state" AS ENUM('QUEUED', 'SCHEDULED', 'PROCESSING', 'PROCESSING_META', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'PAUSED', 'CANCELLED', 'DEAD_LETTER', 'UNSUPPORTED');--> statement-breakpoint
CREATE TABLE "caption_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"page_id" text,
	"niche" text,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_history" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"kind" text NOT NULL,
	"parent_job_id" text,
	"asset_id" text NOT NULL,
	"page_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"tracking_id" text,
	"link_version_id" text,
	"caption" text NOT NULL,
	"comment_body" text,
	"comment_policy" jsonb NOT NULL,
	"state" "publisher_job_state" NOT NULL,
	"phase" text DEFAULT 'CREATED' NOT NULL,
	"available_at" timestamp (3) with time zone NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_until" timestamp (3) with time zone,
	"enqueued_at" timestamp (3) with time zone,
	"meta_video_id" text,
	"encrypted_session" text,
	"offset" integer DEFAULT 0 NOT NULL,
	"post_id" text,
	"comment_id" text,
	"provenance" text,
	"error_code" text,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_controls" (
	"id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_page_settings" (
	"page_id" text PRIMARY KEY NOT NULL,
	"auto_comment" boolean DEFAULT false NOT NULL,
	"delay_seconds" integer DEFAULT 60 NOT NULL,
	"comment_template_id" text,
	"remove_preview" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text,
	"storage_key" text NOT NULL,
	"state" text DEFAULT 'NEW' NOT NULL,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"aspect_ratio" text,
	"niche" text DEFAULT '' NOT NULL,
	"product_id" text,
	"duplicate_of" text,
	"error_code" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracking_records" ADD COLUMN "content_id" text;--> statement-breakpoint
ALTER TABLE "caption_templates" ADD CONSTRAINT "caption_templates_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_templates" ADD CONSTRAINT "caption_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_batches" ADD CONSTRAINT "publish_batches_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_history" ADD CONSTRAINT "publish_history_job_id_publish_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."publish_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_history" ADD CONSTRAINT "publish_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_batch_id_publish_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."publish_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_parent_job_id_publish_jobs_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."publish_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_asset_id_video_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."video_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_tracking_id_tracking_records_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."tracking_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_link_version_id_tracking_link_versions_id_fk" FOREIGN KEY ("link_version_id") REFERENCES "public"."tracking_link_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_controls" ADD CONSTRAINT "publisher_controls_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_page_settings" ADD CONSTRAINT "publisher_page_settings_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_page_settings" ADD CONSTRAINT "publisher_page_settings_comment_template_id_caption_templates_id_fk" FOREIGN KEY ("comment_template_id") REFERENCES "public"."caption_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_page_settings" ADD CONSTRAINT "publisher_page_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_duplicate_of_video_assets_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."video_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publish_batch_actor_request" ON "publish_batches" USING btree ("actor_id","request_key");--> statement-breakpoint
CREATE INDEX "publish_history_job_date" ON "publish_history" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_batch_asset_kind" ON "publish_jobs" USING btree ("batch_id","asset_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_comment_parent" ON "publish_jobs" USING btree ("parent_job_id");--> statement-breakpoint
CREATE INDEX "publish_due" ON "publish_jobs" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "publish_page_created" ON "publish_jobs" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "publish_post_idx" ON "publish_jobs" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "videos_page_created" ON "video_assets" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "videos_page_hash" ON "video_assets" USING btree ("page_id","sha256");--> statement-breakpoint
ALTER TABLE "tracking_records" ADD CONSTRAINT "tracking_records_content_id_video_assets_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."video_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE video_assets ADD CONSTRAINT video_asset_integrity CHECK (size > 0 AND size <= 314572800 AND state IN ('NEW','UPLOADING','READY','FAILED') AND (state <> 'READY' OR (sha256 IS NOT NULL AND duration_ms > 0 AND width > 0 AND height > 0)));
--> statement-breakpoint
ALTER TABLE caption_templates ADD CONSTRAINT publisher_template_scope CHECK (kind IN ('CAPTION','COMMENT') AND NOT (page_id IS NOT NULL AND niche IS NOT NULL));
--> statement-breakpoint
ALTER TABLE publisher_page_settings ADD CONSTRAINT publisher_comment_delay CHECK (delay_seconds >= 0 AND delay_seconds <= 86400);
--> statement-breakpoint
ALTER TABLE publish_jobs ADD CONSTRAINT publisher_job_kind CHECK (kind IN ('VIDEO','COMMENT') AND ((kind='VIDEO' AND parent_job_id IS NULL) OR (kind='COMMENT' AND parent_job_id IS NOT NULL)) AND progress BETWEEN 0 AND 100 AND attempts >= 0 AND generation >= 0 AND "offset" >= 0);
--> statement-breakpoint
CREATE TRIGGER publish_history_immutable BEFORE UPDATE OR DELETE ON publish_history FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
