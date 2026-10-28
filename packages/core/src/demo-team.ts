import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import { eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const DEMO_TEAM_MESSAGE =
  "This is a demo workspace, so nothing is sent from it. Switch to your own team to send.";

/** Raised where a demo team is asked to do something real: send, invite, pay. */
export class DemoTeamError extends Error {
  readonly code = "demo_team";
  constructor(message = DEMO_TEAM_MESSAGE) {
    super(message);
    this.name = "DemoTeamError";
  }
}

/** Throws DemoTeamError when the team is the seeded demo workspace. */
export async function assertNotDemo(db: Db, teamId: string): Promise<void> {
  const [row] = await db
    .select({ isDemo: schema.teams.isDemo })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId));
  if (row?.isDemo) throw new DemoTeamError();
}

/**
 * SQL for a worker job or cross-team reader to AND into its where: the row's
 * team is not the demo workspace. The demo team is fake, so no job may verify
 * its domains, retry its webhooks, send its scheduled mail, mail its owner, or
 * count its traffic as the instance's. The alias keeps it safe beside a query
 * that already joins teams.
 */
export function notDemoTeam(teamId: AnyPgColumn | SQL): SQL {
  return sql`not exists (select 1 from ${schema.teams} as demo_t where demo_t.id = ${teamId} and demo_t.is_demo)`;
}
