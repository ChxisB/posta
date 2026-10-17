import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { teams } from "./teams.js";

// Reusable email content only: broadcasts copy a template's content at
// compose time and keep no FK back, so editing a template never rewrites
// anything already sent or drafted. The row itself is the working draft;
// publishing freezes it as a numbered row of `template_versions`.
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Public-API handle (resend templates.alias): case-sensitive, unique per
    // team, null for dashboard-only templates.
    alias: text("alias"),
    subject: text("subject"),
    // Inbox preview (preheader) text. Never stored in `html`: it is injected
    // where the template's content is used, like a broadcast's previewText.
    previewText: text("preview_text"),
    html: text("html").notNull(),
    text: text("text"),
    // Block-editor source of truth (BlockDoc). Null → legacy raw-HTML row whose
    // `html` was hand-authored; the app renders those in CODE mode.
    document: jsonb("document").$type<unknown>(),
    // Highest version number ever handed out; 0 while the template has never
    // been published. A counter rather than max(version) so a deleted version
    // never has its number reused.
    latestVersion: integer("latest_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("templates_team_idx").on(t.teamId),
    uniqueIndex("templates_team_alias_idx").on(t.teamId, t.alias),
  ],
);

// One immutable snapshot per publish. Never updated after insert; the only
// way a row goes away is its own delete or the template's.
export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    previewText: text("preview_text"),
    html: text("html").notNull(),
    text: text("text"),
    document: jsonb("document").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("template_versions_template_version_idx").on(t.templateId, t.version)],
);

// A movable name ("production", "staging") pointing at one version of one
// template. Moving a tag is an update of `version`; the sends that name the
// tag pick up the new content on their next request.
export const templateTags = pgTable(
  "template_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_tags_template_name_idx").on(t.templateId, t.name),
    // Default NO ACTION: deleting a template cascades to both tables in one
    // statement, and the check runs after the cascade, so it never blocks.
    foreignKey({
      name: "template_tags_version_fk",
      columns: [t.templateId, t.version],
      foreignColumns: [templateVersions.templateId, templateVersions.version],
    }),
  ],
);
