import { describe, expect, it } from "vitest";
import {
  parseRailPrefs,
  RAIL_PREFS_KEY,
  RAIL_TIER_MIN,
  RAILS_INITIAL,
  type RailStorage,
  type RailsState,
  type RailTier,
  railDrawer,
  railMode,
  railShown,
  railsReduce,
  railTier,
  readRailPrefs,
  writeRailPrefs,
} from "./template-rails";

function memory(initial: Record<string, string> = {}): RailStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const throwing: RailStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("quota");
  },
};

describe("railTier", () => {
  it("is wide from the width both rails and a 640px email need", () => {
    expect(railTier(RAIL_TIER_MIN.wide)).toBe("wide");
    expect(railTier(1600)).toBe("wide");
    expect(railTier(RAIL_TIER_MIN.wide - 1)).toBe("medium");
  });

  it("is medium from the width one rail and a squeezed email need", () => {
    expect(railTier(RAIL_TIER_MIN.medium)).toBe("medium");
    expect(railTier(960)).toBe("medium");
    expect(railTier(RAIL_TIER_MIN.medium - 1)).toBe("narrow");
  });

  it("is narrow below that, and before anything has been measured", () => {
    expect(railTier(390)).toBe("narrow");
    expect(railTier(0)).toBe("narrow");
  });

  it("steps up with the width, never back down", () => {
    const order: RailTier[] = ["narrow", "medium", "wide"];
    let last = 0;
    for (let width = 0; width <= 2000; width += 8) {
      const at = order.indexOf(railTier(width));
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });

  it("puts a 1280px laptop (960px of column) in the medium tier, with the settings docked", () => {
    expect(railTier(1280 - 240 - 80)).toBe("medium");
  });

  it("goes wide from a 1520px window: the sidebar and padding leave 1200px of column", () => {
    expect(railTier(1520 - 240 - 80)).toBe("wide");
    expect(railTier(1440 - 240 - 80)).toBe("medium");
  });
});

describe("railMode", () => {
  it("docks both rails when wide", () => {
    expect(railMode("wide", "left")).toBe("docked");
    expect(railMode("wide", "right")).toBe("docked");
  });

  it("docks the settings and drawers the components when medium", () => {
    expect(railMode("medium", "left")).toBe("drawer");
    expect(railMode("medium", "right")).toBe("docked");
  });

  it("drawers both when narrow", () => {
    expect(railMode("narrow", "left")).toBe("drawer");
    expect(railMode("narrow", "right")).toBe("drawer");
  });
});

describe("railsReduce", () => {
  it("starts with both rails unfolded and no drawer", () => {
    expect(RAILS_INITIAL).toEqual({ collapsed: { left: false, right: false }, open: null });
  });

  it("loads stored flags without touching the drawer", () => {
    const next = railsReduce(
      { ...RAILS_INITIAL, open: "left" },
      { type: "load", collapsed: { left: true, right: false } },
    );
    expect(next).toEqual({ collapsed: { left: true, right: false }, open: "left" });
  });

  it("folds and unfolds one rail at a time", () => {
    const folded = railsReduce(RAILS_INITIAL, { type: "toggle-collapsed", side: "right" });
    expect(folded.collapsed).toEqual({ left: false, right: true });
    const back = railsReduce(folded, { type: "toggle-collapsed", side: "right" });
    expect(back.collapsed).toEqual({ left: false, right: false });
  });

  it("opens one drawer at a time and closes it", () => {
    const left = railsReduce(RAILS_INITIAL, { type: "open", side: "left" });
    expect(left.open).toBe("left");
    const right = railsReduce(left, { type: "open", side: "right" });
    expect(right.open).toBe("right");
    expect(railsReduce(right, { type: "close" }).open).toBeNull();
  });

  it("returns the same state when nothing changes, so React skips the render", () => {
    expect(railsReduce(RAILS_INITIAL, { type: "close" })).toBe(RAILS_INITIAL);
    const open = railsReduce(RAILS_INITIAL, { type: "open", side: "left" });
    expect(railsReduce(open, { type: "open", side: "left" })).toBe(open);
    expect(railsReduce(RAILS_INITIAL, { type: "tier", tier: "wide" })).toBe(RAILS_INITIAL);
    expect(railsReduce(RAILS_INITIAL, { type: "show", side: "right", tier: "wide" })).toBe(
      RAILS_INITIAL,
    );
  });

  it("drops a drawer whose rail the new tier docks, and keeps one that is still a drawer", () => {
    const left = railsReduce(RAILS_INITIAL, { type: "open", side: "left" });
    expect(railsReduce(left, { type: "tier", tier: "wide" }).open).toBeNull();
    expect(railsReduce(left, { type: "tier", tier: "medium" })).toBe(left);
    const right = railsReduce(RAILS_INITIAL, { type: "open", side: "right" });
    expect(railsReduce(right, { type: "tier", tier: "medium" }).open).toBeNull();
    expect(railsReduce(right, { type: "tier", tier: "narrow" })).toBe(right);
  });

  it("shows a folded docked rail by unfolding it", () => {
    const folded: RailsState = { collapsed: { left: false, right: true }, open: null };
    expect(
      railsReduce(folded, { type: "show", side: "right", tier: "medium" }).collapsed.right,
    ).toBe(false);
  });

  it("shows a drawer rail by opening it", () => {
    const next = railsReduce(RAILS_INITIAL, { type: "show", side: "right", tier: "narrow" });
    expect(next.open).toBe("right");
    expect(next.collapsed).toEqual({ left: false, right: false });
  });

  it("keeps a fold the person made while the rail is a drawer", () => {
    const folded: RailsState = { collapsed: { left: false, right: true }, open: null };
    const next = railsReduce(folded, { type: "show", side: "right", tier: "narrow" });
    expect(next.open).toBe("right");
    expect(next.collapsed.right).toBe(true);
  });
});

describe("railShown and railDrawer", () => {
  const folded: RailsState = { collapsed: { left: true, right: false }, open: null };

  it("shows a docked rail unless it is folded", () => {
    expect(railShown(folded, "wide", "left")).toBe(false);
    expect(railShown(folded, "wide", "right")).toBe(true);
  });

  it("shows a drawer rail only while its drawer is open", () => {
    expect(railShown(RAILS_INITIAL, "narrow", "right")).toBe(false);
    expect(railShown({ ...RAILS_INITIAL, open: "right" }, "narrow", "right")).toBe(true);
    expect(railShown({ ...RAILS_INITIAL, open: "left" }, "narrow", "right")).toBe(false);
  });

  it("ignores a fold while the rail is a drawer", () => {
    expect(railShown({ ...folded, open: "left" }, "narrow", "left")).toBe(true);
  });

  it("names the drawer showing, and none for a rail that is docked at this tier", () => {
    expect(railDrawer({ ...RAILS_INITIAL, open: "left" }, "medium")).toBe("left");
    expect(railDrawer({ ...RAILS_INITIAL, open: "left" }, "wide")).toBeNull();
    expect(railDrawer({ ...RAILS_INITIAL, open: "right" }, "medium")).toBeNull();
    expect(railDrawer(RAILS_INITIAL, "narrow")).toBeNull();
  });
});

describe("parseRailPrefs", () => {
  it("reads both flags", () => {
    expect(parseRailPrefs('{"left":true,"right":false}')).toEqual({ left: true, right: false });
    expect(parseRailPrefs('{"left":false,"right":true}')).toEqual({ left: false, right: true });
  });

  it("treats nothing stored as unfolded", () => {
    expect(parseRailPrefs(null)).toEqual({ left: false, right: false });
    expect(parseRailPrefs(undefined)).toEqual({ left: false, right: false });
    expect(parseRailPrefs("")).toEqual({ left: false, right: false });
  });

  it("treats bad JSON as unfolded", () => {
    expect(parseRailPrefs("{")).toEqual({ left: false, right: false });
    expect(parseRailPrefs("not json")).toEqual({ left: false, right: false });
  });

  it("ignores anything that is not a flag", () => {
    expect(parseRailPrefs('{"left":"yes","right":1}')).toEqual({ left: false, right: false });
    expect(parseRailPrefs("null")).toEqual({ left: false, right: false });
    expect(parseRailPrefs("[true,true]")).toEqual({ left: false, right: false });
    expect(parseRailPrefs('"left"')).toEqual({ left: false, right: false });
    expect(parseRailPrefs("42")).toEqual({ left: false, right: false });
  });

  it("keeps one flag when the other is junk", () => {
    expect(parseRailPrefs('{"left":true,"right":"x"}')).toEqual({ left: true, right: false });
  });
});

describe("readRailPrefs and writeRailPrefs", () => {
  it("round-trips through storage under the one key", () => {
    const storage = memory();
    expect(writeRailPrefs(storage, { left: true, right: false })).toBe(true);
    expect([...storage.data.keys()]).toEqual([RAIL_PREFS_KEY]);
    expect(RAIL_PREFS_KEY).toBe("po-template-rails");
    expect(readRailPrefs(storage)).toEqual({ left: true, right: false });
  });

  it("stores the two flags and nothing else", () => {
    const storage = memory();
    writeRailPrefs(storage, { left: false, right: true });
    expect(JSON.parse(storage.data.get(RAIL_PREFS_KEY) ?? "null")).toEqual({
      left: false,
      right: true,
    });
  });

  it("reads unfolded when nothing is stored, or the stored text is bad", () => {
    expect(readRailPrefs(memory())).toEqual({ left: false, right: false });
    expect(readRailPrefs(memory({ [RAIL_PREFS_KEY]: "{oops" }))).toEqual({
      left: false,
      right: false,
    });
  });

  it("copes with storage that throws, and with none", () => {
    expect(readRailPrefs(throwing)).toEqual({ left: false, right: false });
    expect(writeRailPrefs(throwing, { left: true, right: true })).toBe(false);
    expect(readRailPrefs(null)).toEqual({ left: false, right: false });
    expect(writeRailPrefs(null, { left: true, right: true })).toBe(false);
  });
});
