import type { Db } from "@millionsend/db";
import { schema } from "@millionsend/db";
import type { MonitorSettingsRow } from "./monitor-settings.js";

export interface InstanceSettings extends MonitorSettingsRow {
  sesMaxSendRate: number | null;
  /** Percent of each region's SES 24-hour quota kept for transactional mail. */
  sesTransactionalReserve: number | null;
  emailRetentionDays: number | null;
}

/**
 * Single-row operator overrides (Settings → Instance and the console's
 * monitoring settings). null = unset: the caller falls back to the env var,
 * which already carries the built-in default — precedence is db > env >
 * default.
 */
export async function getInstanceSettings(db: Db): Promise<InstanceSettings> {
  const [row] = await db.select().from(schema.instanceSettings);
  const monitor = Object.fromEntries(
    Object.keys(schema.monitorSettingColumns).map((k) => [
      k,
      row?.[k as keyof typeof schema.monitorSettingColumns] ?? null,
    ]),
  ) as MonitorSettingsRow;
  return {
    ...monitor,
    sesMaxSendRate: row?.sesMaxSendRate ?? null,
    sesTransactionalReserve: row?.sesTransactionalReserve ?? null,
    emailRetentionDays: row?.emailRetentionDays ?? null,
  };
}
