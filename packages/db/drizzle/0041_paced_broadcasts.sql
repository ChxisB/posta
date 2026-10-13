DROP INDEX "emails_quota_parked_created_idx";--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "fan_out_cursor" uuid;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "ses_transactional_reserve" smallint;--> statement-breakpoint
CREATE INDEX "emails_parked_broadcast_idx" ON "emails" USING btree ("broadcast_id","created_at","id") WHERE "emails"."latest_status" = 'queued_quota';