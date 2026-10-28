import type { Db } from "@posta/db";
import { schema } from "@posta/db";
import type { Keyring } from "../crypto/keyring.js";
import { DAY_MS, DEMO_TEAM_ID, DEMO_TEAM_SLUG, type DemoCtx, HOUR_MS } from "./context.js";
import { seedInbound } from "./inbound.js";
import { createRng } from "./prng.js";
import { removeDemoTeam } from "./remove.js";
import { seedSettings } from "./settings.js";
import { seedTraffic } from "./traffic.js";
import { DemoUsage } from "./usage.js";
import { seedWorkspace } from "./workspace.js";

const SEED = 20_261_016;

export interface SeedDemoOptions {
  keyring: Keyring;
  /** An existing user, made the demo team's owner. */
  ownerUserId: string;
  now?: Date;
}

/**
 * Replaces the demo team with a freshly seeded one. The same seed gives the
 * same people and traffic shape; times are relative to `now`. A failure
 * removes what was written, so there is never a half-seeded team.
 */
export async function seedDemoTeam(db: Db, opts: SeedDemoOptions): Promise<{ teamId: string }> {
  const now = opts.now ?? new Date();
  await removeDemoTeam(db);
  const ctx: DemoCtx = {
    db,
    rng: createRng(SEED),
    keyring: opts.keyring,
    now,
    cap: new Date(now.getTime() - HOUR_MS),
    teamId: DEMO_TEAM_ID,
    ownerUserId: opts.ownerUserId,
  };
  try {
    const createdAt = new Date(now.getTime() - 45 * DAY_MS);
    await db.insert(schema.teams).values({
      id: DEMO_TEAM_ID,
      name: "Demo",
      slug: DEMO_TEAM_SLUG,
      isDemo: true,
      warmupTrustedAt: createdAt,
      createdAt,
    });
    // Newest membership: the oldest is the default team, and the sample one must never be that.
    await db
      .insert(schema.teamMembers)
      .values({ teamId: DEMO_TEAM_ID, userId: opts.ownerUserId, role: "owner", createdAt: now });
    const usage = new DemoUsage();
    const ws = await seedWorkspace(ctx);
    await seedTraffic(ctx, ws, usage);
    await seedInbound(ctx, ws, usage);
    await seedSettings(ctx, ws);
    await usage.flush(ctx);
  } catch (err) {
    await removeDemoTeam(db);
    throw err;
  }
  return { teamId: DEMO_TEAM_ID };
}
