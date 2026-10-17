import { describe, expect, it } from "vitest";
import { formatSavedAt, type SaveState, saveState } from "./save-state";

const AT = new Date(2026, 9, 14, 14, 32).getTime();
const base = { saving: false, failed: false, dirty: false, preparing: false, savedAt: null };

/** The states a run of inputs passes through. */
const run = (...steps: Partial<Parameters<typeof saveState>[0]>[]): SaveState["kind"][] =>
  steps.map((step) => saveState({ ...base, ...step }).kind);

describe("saveState", () => {
  it("is new for an untouched new template, and saved for an untouched stored one", () => {
    expect(saveState(base)).toEqual({ kind: "new" });
    expect(saveState({ ...base, savedAt: AT })).toEqual({ kind: "saved", at: AT });
  });

  it("goes dirty → saving → saved", () => {
    expect(
      run(
        { savedAt: AT, dirty: true },
        { savedAt: AT, dirty: true, saving: true },
        { savedAt: AT + 1 },
      ),
    ).toEqual(["dirty", "saving", "saved"]);
  });

  it("shows a failed save until a save succeeds, through further edits", () => {
    expect(
      run(
        { dirty: true, saving: true },
        { dirty: true, failed: true },
        { dirty: true, failed: true },
        { dirty: true, failed: true, saving: true },
        { savedAt: AT },
      ),
    ).toEqual(["saving", "error", "error", "saving", "saved"]);
  });

  it("is dirty again when edits were made while the save was in flight", () => {
    expect(run({ dirty: true, saving: true }, { dirty: true, savedAt: AT })).toEqual([
      "saving",
      "dirty",
    ]);
  });

  it("says preparing only while there is something to save", () => {
    expect(run({ dirty: true, preparing: true }, { preparing: true })).toEqual([
      "preparing",
      "new",
    ]);
  });
});

describe("formatSavedAt", () => {
  // Some ICU versions put a narrow no-break space before "PM".
  const label = (now: Date, locale: string) => formatSavedAt(AT, locale, now).replace(/\s/g, " ");

  it("shows only the time for a save today", () => {
    const now = new Date(2026, 9, 14, 18, 0);
    expect(label(now, "en")).toBe("2:32 PM");
  });

  it("adds the day for an earlier save", () => {
    const now = new Date(2026, 9, 16, 9, 0);
    expect(label(now, "en")).toBe("Oct 14, 2:32 PM");
  });
});
