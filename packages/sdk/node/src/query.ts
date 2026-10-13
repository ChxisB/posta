import type { ListOptions } from "./types.js";

/** Flatten keyset list options into the query map (undefined values are dropped). */
export function listQuery(
  options?: ListOptions,
): Record<string, string | number | undefined> | undefined {
  if (!options) return undefined;
  return { limit: options.limit, after: options.after, before: options.before };
}
