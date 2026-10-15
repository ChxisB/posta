CREATE TABLE "template_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"preview_text" text,
	"html" text NOT NULL,
	"text" text,
	"document" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "latest_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "template_tags_template_name_idx" ON "template_tags" USING btree ("template_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_version_idx" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
INSERT INTO "template_versions" ("template_id", "version", "name", "subject", "preview_text", "html", "text", "document", "created_at")
SELECT "id", 1, "name", "subject", "preview_text", "html", "text", "document", "created_at" FROM "templates";--> statement-breakpoint
UPDATE "templates" SET "latest_version" = 1;--> statement-breakpoint
ALTER TABLE "template_tags" ADD CONSTRAINT "template_tags_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_tags" ADD CONSTRAINT "template_tags_version_fk" FOREIGN KEY ("template_id","version") REFERENCES "public"."template_versions"("template_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;
