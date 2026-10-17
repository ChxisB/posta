CREATE TYPE "public"."monitor_sample_kind" AS ENUM('first_sends', 'ramp', 'tier', 'anomaly', 'override', 'broadcast_skeleton', 'broadcast_copy');--> statement-breakpoint
CREATE TYPE "public"."monitor_sample_status" AS ENUM('pending', 'judged', 'unjudged');--> statement-breakpoint
CREATE TABLE "monitor_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email_id" uuid,
	"broadcast_id" uuid,
	"kind" "monitor_sample_kind" NOT NULL,
	"status" "monitor_sample_status" DEFAULT 'pending' NOT NULL,
	"score" smallint,
	"verdict" text,
	"categories" jsonb,
	"reasons" jsonb,
	"impersonated_brand" text,
	"language" text,
	"error_class" text,
	"model" text,
	"latency_ms" integer,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_monitor" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"sent_total" integer DEFAULT 0 NOT NULL,
	"first_send_at" timestamp with time zone,
	"risk" double precision,
	"risk_num" double precision DEFAULT 0 NOT NULL,
	"risk_den" double precision DEFAULT 0 NOT NULL,
	"risk_updated_at" timestamp with time zone,
	"last_sample_at" timestamp with time zone,
	"override_rate" double precision,
	"override_until" timestamp with time zone,
	"broadcasts_paused_at" timestamp with time zone,
	"broadcasts_resumed_at" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_first_sends" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_first_hours" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_ramp_sends" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_ramp_rate" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_ramp_days" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_probation_rate" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_established_rate" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_trusted_rate" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_broadcast_copies" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_broadcast_copies_new" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_anomaly_multiplier" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_team_daily_cap" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_instance_daily_cap" integer;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_flag_risk" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_alert_risk" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_pause_risk" double precision;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_auto_pause" boolean;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "monitor_flag_score" smallint;--> statement-breakpoint
ALTER TABLE "team_standings" ADD COLUMN "monitor_risk" double precision;--> statement-breakpoint
ALTER TABLE "monitor_samples" ADD CONSTRAINT "monitor_samples_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_samples" ADD CONSTRAINT "monitor_samples_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_samples" ADD CONSTRAINT "monitor_samples_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_monitor" ADD CONSTRAINT "team_monitor_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_samples_team_created_idx" ON "monitor_samples" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "monitor_samples_created_idx" ON "monitor_samples" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "monitor_samples_email_idx" ON "monitor_samples" USING btree ("email_id") WHERE "monitor_samples"."email_id" is not null;--> statement-breakpoint
CREATE INDEX "monitor_samples_broadcast_idx" ON "monitor_samples" USING btree ("broadcast_id") WHERE "monitor_samples"."broadcast_id" is not null;