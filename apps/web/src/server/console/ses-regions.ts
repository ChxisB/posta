import { env, servedRegions } from "@millionsend/config";
import {
  createRegionAccountCache,
  createSesAccountClient,
  type RegionAccount,
  type RegionAccountCache,
  type RegionAccountDeps,
  regionAccountWithin,
} from "@millionsend/ses";

export type { RegionAccount, RegionAccountDeps };

export const defaultRegionAccountDeps: RegionAccountDeps = {
  accountClient: (region) =>
    createSesAccountClient({
      region,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }),
};

/** How long the send planner waits for a cold GetAccount before answering without an estimate. */
export const PLANNER_ACCOUNT_TIMEOUT_MS = 2_000;

let cache: RegionAccountCache = createRegionAccountCache(defaultRegionAccountDeps);

/** Tests: swap the SES client factory (and clear the cache) instead of stubbing the AWS SDK. */
export function setRegionAccountDeps(deps: RegionAccountDeps | null): void {
  cache = createRegionAccountCache(deps ?? defaultRegionAccountDeps);
}

/** GetAccount for one region, reused for a minute; `fresh` re-reads now. */
export function regionAccount(
  region: string,
  opts: { fresh?: boolean; deps?: RegionAccountDeps } = {},
): Promise<RegionAccount> {
  if (opts.deps) return createRegionAccountCache(opts.deps).get(region, opts);
  return cache.get(region, opts);
}

/** Every served region's account, in served order. */
export function servedRegionAccounts(
  opts: { fresh?: boolean; deps?: RegionAccountDeps } = {},
): Promise<RegionAccount[]> {
  if (opts.deps) return createRegionAccountCache(opts.deps).all(servedRegions(), opts);
  return cache.all(servedRegions(), opts);
}

/** The region's account within the planner's patience, or null when SES has not answered yet. */
export function plannerRegionAccount(region: string): Promise<RegionAccount | null> {
  return regionAccountWithin(cache, region, PLANNER_ACCOUNT_TIMEOUT_MS);
}

/** Tests: forget every cached answer. */
export function resetRegionAccountCache(): void {
  cache.reset();
}
