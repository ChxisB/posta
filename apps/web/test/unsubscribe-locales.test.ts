import { describe, expect, it } from "vitest";
import { pickUnsubscribeLocale, UNSUBSCRIBE_LOCALES } from "@/lib/unsubscribe-locales";

// English is the only language the page speaks, so every header resolves to it.
// The ranking still runs, so a second catalog is picked up by adding it to the map.
describe("pickUnsubscribeLocale", () => {
  it("takes English from a browser asking for it, with or without a region", () => {
    expect(pickUnsubscribeLocale("en-US,en;q=0.9")).toBe("en");
    expect(pickUnsubscribeLocale("EN-gb")).toBe("en");
    expect(pickUnsubscribeLocale("en;q=0.5,fr;q=0.9")).toBe("en");
  });

  it("falls back to English for languages the page does not speak", () => {
    expect(pickUnsubscribeLocale("pt-BR,pt;q=0.9,en;q=0.8")).toBe("en");
    expect(pickUnsubscribeLocale("xx-YY,de;q=0.7")).toBe("en");
    expect(pickUnsubscribeLocale("pt-BR;q=0,en")).toBe("en");
    expect(pickUnsubscribeLocale("*")).toBe("en");
    expect(pickUnsubscribeLocale("")).toBe("en");
    expect(pickUnsubscribeLocale(null)).toBe("en");
  });

  it("names every language in itself", () => {
    expect(Object.keys(UNSUBSCRIBE_LOCALES)).toEqual(["en"]);
    for (const [locale, { name }] of Object.entries(UNSUBSCRIBE_LOCALES)) {
      expect(name, locale).not.toBe("");
    }
  });
});
