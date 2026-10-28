import type { Db } from "@posta/db";
import type { Keyring } from "../crypto/keyring.js";
import type { Rng } from "./prng.js";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Fixed, so a reset keeps the one id the append-only audit log already holds rows for. */
export const DEMO_TEAM_ID = "d3a0d3a0-0d3a-4d3a-8d3a-d3a0d3a0d3a0";
export const DEMO_TEAM_SLUG = "demo-workspace";
/** Stable prefix of the demo teammates' user ids, so removal finds exactly them. */
export const DEMO_USER_PREFIX = "demo-user-";

export interface DemoCtx {
  db: Db;
  rng: Rng;
  keyring: Keyring;
  now: Date;
  /** The newest timestamp any seeded row carries: an hour old, so no job treats it as live. */
  cap: Date;
  teamId: string;
  ownerUserId: string;
}

export const clampToCap = (ctx: DemoCtx, at: number): Date =>
  new Date(Math.min(at, ctx.cap.getTime()));
