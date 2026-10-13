CREATE TYPE "public"."meta_source" AS ENUM('LIVE', 'MOCK');--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donor_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"donor_id" text NOT NULL,
	"version" integer NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_set_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"raw" jsonb NOT NULL,
	"normalized" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"account_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"meta_user_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"encrypted_inventory" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"checked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"filename" text NOT NULL,
	"rows" jsonb NOT NULL,
	"count" integer NOT NULL,
	"total" numeric(30, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"hash" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"previous_account_id" text,
	"account_id" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"source" "meta_source" NOT NULL,
	"meta_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"niche" text DEFAULT '' NOT NULL,
	"primary_account_id" text,
	"encrypted_token" text NOT NULL,
	"tasks" jsonb NOT NULL,
	"publish_settings" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"page_id" text,
	"account_id" text
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_versions" ADD CONSTRAINT "donor_versions_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_versions" ADD CONSTRAINT "donor_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_imports" ADD CONSTRAINT "meta_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_mappings" ADD CONSTRAINT "page_mappings_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_mappings" ADD CONSTRAINT "page_mappings_previous_account_id_ad_accounts_id_fk" FOREIGN KEY ("previous_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_mappings" ADD CONSTRAINT "page_mappings_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_mappings" ADD CONSTRAINT "page_mappings_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_connection_id_meta_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."meta_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_primary_account_id_ad_accounts_id_fk" FOREIGN KEY ("primary_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_account_id_ad_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_account_source_id" ON "ad_accounts" USING btree ("source","meta_id");--> statement-breakpoint
CREATE INDEX "accounts_connection" ON "ad_accounts" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "donor_version_unique" ON "donor_versions" USING btree ("donor_id","version");--> statement-breakpoint
CREATE INDEX "donor_account" ON "donors" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_connection_identity" ON "meta_connections" USING btree ("actor_id","source","meta_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_fingerprint" ON "meta_imports" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "oauth_states_expiry" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mapping_page_date" ON "page_mappings" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_source_id" ON "pages" USING btree ("source","meta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_code_unique" ON "pages" USING btree ("code");--> statement-breakpoint
CREATE INDEX "page_account" ON "pages" USING btree ("primary_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_user_page" ON "resource_grants" USING btree ("user_id","page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_user_account" ON "resource_grants" USING btree ("user_id","account_id");
--> statement-breakpoint
ALTER TABLE resource_grants ADD CONSTRAINT resource_grant_one_target CHECK ((page_id IS NULL) <> (account_id IS NULL));
--> statement-breakpoint
ALTER TABLE donor_versions ADD CONSTRAINT donor_positive_version CHECK (version > 0);
--> statement-breakpoint
CREATE FUNCTION prevent_donor_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Donor versions are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER donor_versions_append_only BEFORE UPDATE OR DELETE ON donor_versions FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
