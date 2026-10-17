/**
 * The template editor's two rails (components on the left, settings on the
 * right): which of them sit beside the email at the room there is, which
 * fold away behind a button, and what the person chose to keep folded.
 * Client-safe and free of React, so the rules can be tested without a browser.
 */

export type RailSide = "left" | "right";
/** How much room the layout has: both rails beside the email, one, or neither. */
export type RailTier = "wide" | "medium" | "narrow";
/** A rail beside the email ("docked"), or a panel over it, opened from a button ("drawer"). */
export type RailMode = "docked" | "drawer";

/**
 * The layout's own width (px) where each tier starts. It is the width of the
 * column the editor sits in, not of the window: the sidebar and the page
 * padding take 320px off it on a desktop, so these are not the dashboard's
 * 1199 and 899 breakpoints. Both rails and a 640px email need 1168; one rail
 * and a 720px email need 960, and the email may squeeze to 680 before the
 * rail gives way.
 */
export const RAIL_TIER_MIN = { wide: 1168, medium: 920 } as const;

export function railTier(width: number): RailTier {
  if (width >= RAIL_TIER_MIN.wide) return "wide";
  if (width >= RAIL_TIER_MIN.medium) return "medium";
  return "narrow";
}

/** The settings rail docks first (it holds the name the template cannot be saved without). */
export function railMode(tier: RailTier, side: RailSide): RailMode {
  if (side === "left") return tier === "wide" ? "docked" : "drawer";
  return tier === "narrow" ? "drawer" : "docked";
}

export interface RailsState {
  /** Rails the person folded away; only a docked rail honours it. */
  collapsed: Record<RailSide, boolean>;
  /** The drawer showing, if any. One at a time. */
  open: RailSide | null;
}

export const RAILS_INITIAL: RailsState = {
  collapsed: { left: false, right: false },
  open: null,
};

export type RailsAction =
  /** The folded flags read back from storage. */
  | { type: "load"; collapsed: Record<RailSide, boolean> }
  | { type: "toggle-collapsed"; side: RailSide }
  | { type: "open"; side: RailSide }
  | { type: "close" }
  /** The layout changed tier: a drawer whose rail is now docked has nothing to show. */
  | { type: "tier"; tier: RailTier }
  /** Make a rail visible, whichever way it shows (for a link into one of its fields). */
  | { type: "show"; side: RailSide; tier: RailTier };

export function railsReduce(state: RailsState, action: RailsAction): RailsState {
  switch (action.type) {
    case "load":
      return { ...state, collapsed: action.collapsed };
    case "toggle-collapsed":
      return {
        ...state,
        collapsed: { ...state.collapsed, [action.side]: !state.collapsed[action.side] },
      };
    case "open":
      return state.open === action.side ? state : { ...state, open: action.side };
    case "close":
      return state.open === null ? state : { ...state, open: null };
    case "tier":
      return state.open !== null && railMode(action.tier, state.open) === "docked"
        ? { ...state, open: null }
        : state;
    case "show":
      return railMode(action.tier, action.side) === "docked"
        ? state.collapsed[action.side]
          ? { ...state, collapsed: { ...state.collapsed, [action.side]: false } }
          : state
        : state.open === action.side
          ? state
          : { ...state, open: action.side };
  }
}

/** Whether a rail's contents can be seen and reached: docked and not folded, or its drawer open. */
export function railShown(state: RailsState, tier: RailTier, side: RailSide): boolean {
  return railMode(tier, side) === "docked" ? !state.collapsed[side] : state.open === side;
}

/** The drawer that is showing at this tier: the one that needs a scrim, a focus loop and Esc. */
export function railDrawer(state: RailsState, tier: RailTier): RailSide | null {
  return state.open !== null && railMode(tier, state.open) === "drawer" ? state.open : null;
}

/** The one thing stored: which rails are folded. Nothing else about the layout is. */
export const RAIL_PREFS_KEY = "po-template-rails";

export type RailPrefs = Record<RailSide, boolean>;

/** What a read or write needs of `localStorage`, so a double can stand in for it. */
export interface RailStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Folded flags from stored text; anything unreadable is "not folded". */
export function parseRailPrefs(raw: string | null | undefined): RailPrefs {
  const prefs: RailPrefs = { left: false, right: false };
  if (!raw) return prefs;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null) {
      const stored = value as Record<string, unknown>;
      prefs.left = stored.left === true;
      prefs.right = stored.right === true;
    }
  } catch {
    // Bad JSON: start unfolded.
  }
  return prefs;
}

/** Reads the folded flags; storage that is missing or throws counts as nothing stored. */
export function readRailPrefs(storage: RailStorage | null): RailPrefs {
  try {
    return parseRailPrefs(storage?.getItem(RAIL_PREFS_KEY));
  } catch {
    return parseRailPrefs(null);
  }
}

/** Stores the folded flags. False when the browser would not take them. */
export function writeRailPrefs(storage: RailStorage | null, prefs: RailPrefs): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RAIL_PREFS_KEY, JSON.stringify({ left: prefs.left, right: prefs.right }));
    return true;
  } catch {
    return false;
  }
}

/** The browser's `localStorage`, or null where it is blocked (a private window, cleared site data). */
export function browserRailStorage(): RailStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
