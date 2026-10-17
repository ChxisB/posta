import { parseArgs } from "node:util";
import { env } from "@posta/config";
import { DEMO_TEAM_ID, removeDemoTeam, seedDemoTeam } from "@posta/core";
import { getDb, schema } from "@posta/db";
import { createKeyringFromEnv } from "@posta/ses";
import { and, eq, sql } from "drizzle-orm";

/**
 * Loads, refreshes or removes the sample "Demo" team, in the database the
 * environment points at. Nothing is sent from it and nothing real is touched.
 *
 *   pnpm demo:seed --email you@example.com   # you own the Demo team
 *   pnpm demo:reset                          # re-seed it for the same owner
 *   pnpm demo:remove
 *
 * In the production image (no pnpm): run this file with the worker's own tsx,
 * as replay-media.ts does.
 */

const USAGE = "usage: demo <seed|reset|remove> [--email <account email>]";

const { values, positionals } = parseArgs({
  options: { email: { type: "string" } },
  allowPositionals: true,
});
const command = positionals[0];
if (command !== "seed" && command !== "reset" && command !== "remove") {
  console.error(USAGE);
  process.exit(2);
}
if (command === "seed" && !values.email) {
  console.error(`${USAGE}\nseed needs --email: the account that will own the Demo team.`);
  process.exit(2);
}

const db = getDb();
try {
  if (command === "remove") {
    await removeDemoTeam(db);
    console.log("Demo team removed.");
  } else {
    // A reset without --email keeps whoever owned the Demo team before.
    const [owner] = values.email
      ? await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(sql`lower(${schema.user.email})`, values.email.trim().toLowerCase()))
          .limit(1)
      : await db
          .select({ id: schema.teamMembers.userId })
          .from(schema.teamMembers)
          .where(
            and(eq(schema.teamMembers.teamId, DEMO_TEAM_ID), eq(schema.teamMembers.role, "owner")),
          )
          .limit(1);
    if (!owner) {
      console.error(
        values.email
          ? "No account with that email. Sign up first."
          : "No Demo team to reset. Run seed with --email first.",
      );
      process.exit(1);
    }
    await seedDemoTeam(db, { keyring: createKeyringFromEnv(env), ownerUserId: owner.id });
    console.log("Demo team loaded. Switch to it from the team menu, or open the dashboard.");
  }
} finally {
  await db.$client.end();
}
