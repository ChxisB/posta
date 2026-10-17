import { isCloudDeployment } from "@posta/config";
import { DEMO_TEAM_ID, removeDemoTeam, seedDemoTeam } from "@posta/core";
import { schema } from "@posta/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getKeyring } from "../keyring";
import { operatorProcedure, router } from "../trpc";

/**
 * Sample data for looking around: the instance operator's, and only on a
 * self-hosted deployment. The Demo team is one shared team for the whole
 * instance, so letting any member replace it would be wrong, and a hosted
 * service has no use for a second copy per visitor. Everything else a demo
 * team may not do is refused where it would act (core assertNotDemo, demoGuard).
 */
const selfHostOperator = operatorProcedure.use(({ next }) => {
  if (isCloudDeployment()) throw new TRPCError({ code: "NOT_FOUND" });
  return next();
});

export const demoRouter = router({
  status: selfHostOperator.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.isDemo, true))
      .limit(1);
    return { loaded: row !== undefined };
  }),

  /** Loads the Demo team, or replaces it, and makes it the caller's active team. */
  load: selfHostOperator.mutation(async ({ ctx }) => {
    await seedDemoTeam(ctx.db, { keyring: getKeyring(), ownerUserId: ctx.session.user.id });
    ctx.setActiveTeamCookie?.(DEMO_TEAM_ID);
    return { teamId: DEMO_TEAM_ID };
  }),

  remove: selfHostOperator.mutation(async ({ ctx }) => {
    await removeDemoTeam(ctx.db);
    return { removed: true };
  }),
});
