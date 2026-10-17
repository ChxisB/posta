CREATE TYPE "public"."support_view_ended_by" AS ENUM('operator', 'owner', 'expiry');--> statement-breakpoint
CREATE TYPE "public"."support_view_reason" AS ENUM('support_ticket', 'billing_dispute', 'other');--> statement-breakpoint
CREATE TABLE "support_view_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"operator_user_id" text NOT NULL,
	"reason" "support_view_reason" NOT NULL,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" "support_view_ended_by",
	"procedures" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "support_view_grants" ADD CONSTRAINT "support_view_grants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_view_grants" ADD CONSTRAINT "support_view_grants_operator_user_id_user_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_view_grants_live_operator_idx" ON "support_view_grants" USING btree ("operator_user_id") WHERE "support_view_grants"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "support_view_grants_team_idx" ON "support_view_grants" USING btree ("team_id","created_at");