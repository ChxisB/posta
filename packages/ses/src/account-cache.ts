import { getAccountOverview, type SesAccountClient, type SesAccountOverview } from "./account.js";

/** The non-send SES API is throttled at one request a second per region; a minute of reuse keeps every read under it. */
export const ACCOUNT_CACHE_MS = 60_000;

export type RegionAccount =
  | { region: string; ok: true; overview: SesAccountOverview; probedAt: Date; latencyMs: number }
  | { region: string; ok: false; message: string; probedAt: Date };

export interface RegionAccountDeps {
  accountClient(region: string): SesAccountClient;
  now?(): Date;
}

export interface RegionAccountCache {
  /** GetAccount for one region, reused for a minute; `fresh` re-reads now. */
  get(region: string, opts?: { fresh?: boolean }): Promise<RegionAccount>;
  /** Every region's account, in the order given. */
  all(regions: readonly string[], opts?: { fresh?: boolean }): Promise<RegionAccount[]>;
  /** The cached answer, or null: never probes, so a cold cache stays cold. */
  peek(region: string): Promise<RegionAccount> | null;
  /** Forget every cached answer. */
  reset(): void;
}

async function probe(region: string, deps: RegionAccountDeps): Promise<RegionAccount> {
  const now = deps.now?.() ?? new Date();
  const started = Date.now();
  try {
    const overview = await getAccountOverview(deps.accountClient(region));
    return { region, ok: true, overview, probedAt: now, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      region,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      probedAt: now,
    };
  }
}

/**
 * A per-process GetAccount cache shared by every surface that prints a
 * region's quota (the console, the send planner, the API). One instance per
 * process; the caller supplies the client factory, so the package stays free
 * of the deployment's env.
 */
export function createRegionAccountCache(
  deps: RegionAccountDeps,
  ttlMs: number = ACCOUNT_CACHE_MS,
): RegionAccountCache {
  const cache = new Map<string, { at: number; value: Promise<RegionAccount> }>();
  const get: RegionAccountCache["get"] = (region, opts = {}) => {
    const hit = cache.get(region);
    if (!opts.fresh && hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = probe(region, deps);
    cache.set(region, { at: Date.now(), value });
    return value;
  };
  return {
    get,
    all: (regions, opts) => Promise.all(regions.map((region) => get(region, opts))),
    peek: (region) => {
      const hit = cache.get(region);
      return hit && Date.now() - hit.at < ttlMs ? hit.value : null;
    },
    reset: () => cache.clear(),
  };
}

/**
 * The cached account, waiting at most `timeoutMs` for a cold probe: a
 * surface that must answer now (the send dialog on the first request after
 * a deploy) gets the number when SES answers in time and null otherwise,
 * while the probe keeps running to warm the cache for the next read.
 */
export async function regionAccountWithin(
  cache: RegionAccountCache,
  region: string,
  timeoutMs: number,
): Promise<RegionAccount | null> {
  const pending = cache.get(region);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
