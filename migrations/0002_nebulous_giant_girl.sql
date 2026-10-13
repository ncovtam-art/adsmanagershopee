CREATE TYPE "public"."commission_status" AS ENUM('PENDING', 'APPROVED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('WAITING', 'PROCESSING', 'READY', 'FAILED', 'MANUAL_ACTION_REQUIRED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."tracking_channel" AS ENUM('ORGANIC', 'ADS', 'SHARED');--> statement-breakpoint
CREATE TABLE "commission_history" (
	"id" text PRIMARY KEY NOT NULL,
	"row_id" text NOT NULL,
	"import_id" text,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "meta_source" NOT NULL,
	"affiliate_account" text NOT NULL,
	"fingerprint" text NOT NULL,
	"preview_fingerprint" text NOT NULL,
	"filename" text NOT NULL,
	"encoding" text NOT NULL,
	"encrypted_raw" text NOT NULL,
	"options" jsonb NOT NULL,
	"candidates" jsonb NOT NULL,
	"state" text DEFAULT 'PREVIEW' NOT NULL,
	"result" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"line" integer NOT NULL,
	"candidate" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"resolved_by" text,
	"reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "meta_source" NOT NULL,
	"affiliate_account" text NOT NULL,
	"external_key" text NOT NULL,
	"external_row_id" text,
	"order_id" text,
	"order_item_id" text,
	"sub_id" text NOT NULL,
	"tracking_id" text,
	"match_method" text NOT NULL,
	"amount" numeric(30, 6) NOT NULL,
	"currency" text NOT NULL,
	"status" "commission_status" NOT NULL,
	"ordered_at" timestamp (3) with time zone,
	"reported_at" timestamp (3) with time zone,
	"settled_at" timestamp (3) with time zone,
	"import_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"niche" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_link_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking_id" text NOT NULL,
	"version" integer NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"confirmation" text DEFAULT 'USER_DECLARED' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_records" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"account_id" text,
	"product_id" text NOT NULL,
	"product_url" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"affiliate_account" text NOT NULL,
	"sub_id" text NOT NULL,
	"channel" "tracking_channel" NOT NULL,
	"content_ref" text DEFAULT '' NOT NULL,
	"campaign_id" text,
	"ad_set_id" text,
	"ad_id" text,
	"status" "link_status" DEFAULT 'MANUAL_ACTION_REQUIRED' NOT NULL,
	"link_version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_history" ADD CONSTRAINT "commission_history_row_id_commission_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."commission_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_history" ADD CONSTRAINT "commission_history_import_id_commission_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."commission_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_history" ADD CONSTRAINT "commission_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_imports" ADD CONSTRAINT "commission_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_reviews" ADD CONSTRAINT "commission_reviews_import_id_commission_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."commission_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_reviews" ADD CONSTRAINT "commission_reviews_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rows" ADD CONSTRAINT "commission_rows_tracking_id_tracking_records_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."tracking_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rows" ADD CONSTRAINT "commission_rows_import_id_commission_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."commission_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_link_versions" ADD CONSTRAINT "tracking_link_versions_tracking_id_tracking_records_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."tracking_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_link_versions" ADD CONSTRAINT "tracking_link_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_records" ADD CONSTRAINT "tracking_records_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_records" ADD CONSTRAINT "tracking_records_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_records" ADD CONSTRAINT "tracking_records_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_records" ADD CONSTRAINT "tracking_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_history_row_date" ON "commission_history" USING btree ("row_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_import_file_unique" ON "commission_imports" USING btree ("source","affiliate_account","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_review_import_line" ON "commission_reviews" USING btree ("import_id","line");--> statement-breakpoint
CREATE INDEX "commission_review_state" ON "commission_reviews" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_row_identity" ON "commission_rows" USING btree ("source","affiliate_account","external_key");--> statement-breakpoint
CREATE INDEX "commission_tracking_idx" ON "commission_rows" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "commission_subid_idx" ON "commission_rows" USING btree ("sub_id");--> statement-breakpoint
CREATE INDEX "commission_order_idx" ON "commission_rows" USING btree ("order_id","order_item_id");--> statement-breakpoint
CREATE INDEX "commission_order_date" ON "commission_rows" USING btree ("ordered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_url_unique" ON "products" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_link_version_unique" ON "tracking_link_versions" USING btree ("tracking_id","version");--> statement-breakpoint
CREATE INDEX "tracking_link_hash" ON "tracking_link_versions" USING btree ("url_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tracking_subid_unique" ON "tracking_records" USING btree ("sub_id");--> statement-breakpoint
CREATE INDEX "tracking_page_created" ON "tracking_records" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE INDEX "tracking_ad_idx" ON "tracking_records" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "tracking_account_idx" ON "tracking_records" USING btree ("account_id");
--> statement-breakpoint
CREATE TRIGGER tracking_link_versions_append_only BEFORE UPDATE OR DELETE ON tracking_link_versions FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
--> statement-breakpoint
CREATE TRIGGER commission_history_append_only BEFORE UPDATE OR DELETE ON commission_history FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
--> statement-breakpoint
ALTER TABLE tracking_link_versions ADD CONSTRAINT tracking_link_positive_version CHECK (version > 0);
