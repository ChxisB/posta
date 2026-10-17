import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrationsFolder } from "../src/migrate.js";

let client: PGlite;

const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string }[];
};

beforeAll(async () => {
  client = new PGlite();
  for (const entry of journal.entries) {
    await client.exec(readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8"));
  }
});

afterAll(() => client.close());

it("replaces the parked index with one led by broadcast_id and adds the two nullable columns", async () => {
  const { rows } = await client.query<{ indexname: string; indexdef: string }>(
    "select indexname, indexdef from pg_indexes where tablename = 'emails' and indexname like '%parked%'",
  );
  expect(rows.map((r) => r.indexname).sort()).toEqual([
    "emails_parked_broadcast_idx",
    "emails_team_quota_parked_idx",
  ]);
  expect(rows.find((r) => r.indexname === "emails_parked_broadcast_idx")?.indexdef).toMatch(
    /\(broadcast_id, created_at, id\) WHERE \(latest_status = 'queued_quota'::email_status\)/,
  );
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    "select table_name, column_name, data_type from information_schema.columns where (table_name, column_name) in (('broadcasts', 'fan_out_cursor'), ('instance_settings', 'ses_transactional_reserve'))",
  );
  expect(columns.rows.map((r) => `${r.table_name}.${r.column_name}:${r.data_type}`).sort()).toEqual(
    ["broadcasts.fan_out_cursor:uuid", "instance_settings.ses_transactional_reserve:smallint"],
  );
});
