import { describe, expect, it } from "vitest";
import { SAVED_FADE, SAVED_FADE_ANIMATION, SAVED_FLASH_MS } from "./saved-flash";

describe("saved flash", () => {
  it("finishes fading out before the status unmounts", () => {
    expect(SAVED_FADE.delayMs + SAVED_FADE.ms).toBeLessThan(SAVED_FLASH_MS);
  });

  it("plays the shared fade backwards, held until the delay", () => {
    expect(SAVED_FADE_ANIMATION).toBe("po-fade 240ms var(--po-ease) 1800ms reverse both");
  });
});
