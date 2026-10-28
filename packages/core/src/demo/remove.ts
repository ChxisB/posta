import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { eq, inArray, like } from "drizzle-orm";
import { DEMO_USER_PREFIX } from "./context.js";

/**
 * Every demo team and what hangs off it. Keys and broadcasts go first: their
 * restrict foreign keys (domain, inbox, topic, segment) would stop the team's
 * cascade. The audit log keeps its rows: it is append-only by design.
 */
export async function removeDemoTeam(db: Db): Promise<void> {
  const demo = db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.isDemo, true));
  await db.delete(schema.apiKeys).where(inArray(schema.apiKeys.teamId, demo));
  await db.delete(schema.broadcasts).where(inArray(schema.broadcasts.teamId, demo));
  await db.delete(schema.teams).where(inArray(schema.teams.id, demo));
  await db.delete(schema.user).where(like(schema.user.id, `${DEMO_USER_PREFIX}%`));
}
