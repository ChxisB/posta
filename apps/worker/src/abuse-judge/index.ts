import type { AbuseJudgeConfig } from "@millionsend/config";
import type { AbuseJudge } from "@millionsend/core";
import { createTypesafeJudge } from "./typesafe.js";

/** The judge the env names, or null when the monitor is off. */
export function createAbuseJudge(config: AbuseJudgeConfig | null): AbuseJudge | null {
  if (!config) return null;
  return createTypesafeJudge(config);
}
