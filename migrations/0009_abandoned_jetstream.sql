ALTER TABLE "care_rules" ADD CONSTRAINT "care_rules_dry_run_id_care_runs_id_fk" FOREIGN KEY ("dry_run_id") REFERENCES "public"."care_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_pause_state_time" ON "care_pauses" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX "care_rule_creator" ON "care_rules" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "commission_import_recent" ON "commission_imports" USING btree ("source","affiliate_account","created_at");--> statement-breakpoint
CREATE INDEX "commission_tracking_order" ON "commission_rows" USING btree ("tracking_id","ordered_at");--> statement-breakpoint
CREATE INDEX "commission_namespace_order" ON "commission_rows" USING btree ("source","affiliate_account","ordered_at");--> statement-breakpoint
CREATE INDEX "insight_day_campaign_page" ON "insight_ads" USING btree ("day_id","campaign_id","page_meta_id");
--> statement-breakpoint
ALTER TABLE care_rules ADD CONSTRAINT care_auto_enabled_check CHECK (NOT auto_enabled OR (enabled AND dry_run_id IS NOT NULL));
--> statement-breakpoint
ALTER TABLE care_alerts ADD CONSTRAINT care_alert_state_check CHECK (state IN ('OPEN','REVIEWED'));
--> statement-breakpoint
ALTER TABLE care_pauses ADD CONSTRAINT care_pause_state_check CHECK (state IN ('CHECKING','SENDING','VERIFIED','BLOCKED','UNKNOWN'));
--> statement-breakpoint
ALTER TABLE care_pauses ADD CONSTRAINT care_pause_level_check CHECK (level IN ('campaign','adset','ad'));
--> statement-breakpoint
ALTER TABLE notification_jobs ADD CONSTRAINT notification_state_check CHECK (state IN ('QUEUED','SENDING','SENT','FAILED','UNKNOWN','CANCELLED'));
--> statement-breakpoint
ALTER TABLE telegram_settings ADD CONSTRAINT telegram_cooldown_check CHECK (cooldown_minutes BETWEEN 5 AND 10080 AND version>=1);
--> statement-breakpoint
ALTER TABLE api_rate_buckets ADD CONSTRAINT api_rate_hits_check CHECK (hits>0);
--> statement-breakpoint
CREATE TRIGGER care_runs_append_only BEFORE UPDATE OR DELETE ON care_runs FOR EACH ROW EXECUTE FUNCTION prevent_donor_version_mutation();
