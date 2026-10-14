import { describe, expect, it } from "vitest";
import { SAVED_FADE_MS, SAVED_FLASH_MS } from "./saved-flash";

describe("saved flash", () => {
  it("holds the highlight long enough to read before fading", () => {
    expect(SAVED_FLASH_MS).toBe(2100);
    expect(SAVED_FADE_MS).toBeLessThan(SAVED_FLASH_MS);
  });
});
