import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrationsFolder } from "../src/migrate.js";

let client: PGlite;
let teamId: string;

const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string }[];
};

beforeAll(async () => {
  client = new PGlite();
  for (const entry of journal.entries) {
    await client.exec(readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8"));
  }
  await client.query(
    "insert into \"user\" (id, name, email) values ('op', 'Operator', 'op@example.com')",
  );
  const { rows } = await client.query<{ id: string }>(
    "insert into teams (name, slug) values ('t', 't') returning id",
  );
  teamId = rows[0]?.id ?? "";
});

afterAll(() => client.close());

it("keeps one live support view per operator and an empty procedures map by default", async () => {
  const insert = () =>
    client.query<{ procedures: Record<string, number> }>(
      "insert into support_view_grants (team_id, operator_user_id, reason, reference, expires_at) values ($1, 'op', 'support_ticket', '#1', now() + interval '30 minutes') returning procedures",
      [teamId],
    );
  const first = await insert();
  expect(first.rows[0]?.procedures).toEqual({});
  await expect(insert()).rejects.toThrow(/support_view_grants_live_operator_idx/);
  await client.query(
    "update support_view_grants set ended_at = now(), ended_by = 'operator' where operator_user_id = 'op'",
  );
  await insert();
  const { rows } = await client.query<{ n: number }>(
    "select count(*)::int as n from support_view_grants where operator_user_id = 'op'",
  );
  expect(rows[0]?.n).toBe(2);
});
