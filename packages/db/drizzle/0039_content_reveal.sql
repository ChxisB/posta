CREATE TYPE "public"."content_access_reason" AS ENUM('phishing_or_malware', 'complaint_spike', 'provider_report', 'legal_request', 'owner_support_request');--> statement-breakpoint
CREATE TYPE "public"."content_access_scope" AS ENUM('email', 'flagged_window');--> statement-breakpoint
CREATE TABLE "content_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"operator_user_id" text NOT NULL,
	"reason" "content_access_reason" NOT NULL,
	"justification" text NOT NULL,
	"scope" "content_access_scope" NOT NULL,
	"email_ids" jsonb NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"notice_sent_at" timestamp with time zone,
	"team_visible_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "content_access_grants" ADD CONSTRAINT "content_access_grants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_access_grants_team_idx" ON "content_access_grants" USING btree ("team_id","created_at" DESC NULLS LAST);