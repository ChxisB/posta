import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../messages", import.meta.url));

function keysOf(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

// English is the only language shipped. These checks hold any language added
// later to English's shape, so a new folder starts out complete.
describe("i18n catalog parity", () => {
  const files = readdirSync(join(root, "en"));
  const others = readdirSync(root).filter((dir) => dir !== "en" && dir !== "unsubscribe");

  it("has English namespaces to check the rest against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const locale of others) {
    it(`${locale} carries the same namespace files as en`, () => {
      expect(readdirSync(join(root, locale)).sort()).toEqual([...files].sort());
    });

    for (const file of files) {
      it(`${locale}/${file}: carries the same keys as en`, () => {
        const load = (dir: string): unknown =>
          JSON.parse(readFileSync(join(root, dir, file), "utf8"));
        expect(keysOf(load(locale)).sort()).toEqual(keysOf(load("en")).sort());
      });
    }
  }
});

describe("hosted unsubscribe catalogs", () => {
  const dir = join(root, "unsubscribe");
  const load = (file: string): Record<string, string> =>
    JSON.parse(readFileSync(join(dir, file), "utf8"));
  const en = load("en.json");

  it("has the English catalog the others are checked against", () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
  });

  for (const file of readdirSync(dir).filter((f) => f !== "en.json")) {
    it(`${file}: carries the English keys, slots included`, () => {
      const catalog = load(file);
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(en)) {
        for (const slot of value.match(/\{\w+\}/g) ?? []) expect(catalog[key], key).toContain(slot);
      }
    });
  }
});
