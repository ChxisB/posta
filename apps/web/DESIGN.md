# Posta dashboard design system

Quiet surfaces, one violet, numbers that count. Two themes, dark by default.
All values live in `src/styles/tokens/` as `--po-*` custom properties;
components apply the `po-*` classes from `src/styles/components.css`. Do not
invent new colours, radii or font sizes; the one sanctioned exception is the
touch text-field size (Controls).

The tables below are checked against the CSS by `test/brand-rules.test.ts`:
change a token and the test names the row to update here.

## The brand

Three colours, the same in both themes. They belong to the mark and to large
brand moments, not to the interface.

| Token | Value | Where |
| --- | --- | --- |
| `--po-brand-coral` | #ff6a3d | gradient start |
| `--po-brand-rose` | #e8458b | gradient middle |
| `--po-brand-violet` | #7046e8 | gradient end, and the accent fill |

`--po-brand-gradient` is Coral → Rose → Violet at 135°.

**Where the gradient is allowed:** the logo mark, and large brand moments (a
hero, an empty-state illustration, the social image). Nowhere else.

**Where it is not:** a button, a link, any text, a border, a badge or a chart.
White on Coral is 2.85:1 and on Rose 3.71:1, so neither carries text; interface
colour is the flat violet below.

## The five rules

1. **One accent, spent once per view.** The primary button, the live status
   dot or the lit digit. If two things are lit, one is wrong. Fills are flat
   violet (`--po-accent`, white text, `--po-on-accent`) in both themes. Violet
   used as text, a line or a mark is `--po-accent-text`: the same violet on the
   light ground, a lighter tint on dark so it reads there. `--po-steel` is the
   accent text's earlier name, kept as an alias; new code uses
   `--po-accent-text`.
2. **Separation by tone and 1px `--po-line` lines.** No coloured card fills and
   no elevation scale. The one lift is `--po-shadow-card`, a soft edge-lit
   shadow on cards, modals and menus, much gentler on light than on dark. The
   only glow is the focus ring.
3. **Geist for display and UI**, weight 600 for titles (`.po-display`). Data
   (IDs, emails, DNS, code) is JetBrains Mono (`.po-mono`).
4. **Every number that counts is a tabular figure, weight 800**
   (`.po-digits`), animating as an odometer digit-roll, the product's only
   flourish (`prefers-reduced-motion` gives a plain swap).
5. **Status colours stay dim and always carry a text label.** Semantic only,
   never decorative, never the accent.

## Themes

Dark is the default (no attribute on `<html>`); light is `data-theme="light"`,
set before first paint by the inline script in the root layout. The choice is
an explicit toggle stored under `po-theme`; the system preference is not
followed. Both blocks live in `tokens/colors.css`, and light redefines every
token dark declares. Any element carrying `data-theme` applies that set
inside itself, which is how a preview frame shows the other scheme.

The neutrals are cool and close to grey so the violet carries the brand. They
are provisional until the Brand Book gives final ink and slate values.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--po-void` | #09090b | #f8f8fa | page ground |
| `--po-panel` | #111115 | #ffffff | sidebar, cards, modals |
| `--po-panel-raised` | #18181d | #f1f1f5 | hover rows, active nav pill, table header |
| `--po-inset` | #1d1d23 | #f5f5f8 | inputs, code blocks, chips |
| `--po-line` | #26262d | #e5e5eb | every border and divider |
| `--po-bone` | #f4f4f6 | #16161d | primary text |
| `--po-muted` | #9b9ba6 | #62626e | secondary text, labels |
| `--po-accent` | #7046e8 | #7046e8 | primary button and checked-control fill |
| `--po-accent-text` | #a98bff | #7046e8 | links, the lit digit, the focus ring |

`--po-faint` is for disabled and decorative use only and is under 3:1 by
design; never use it for copy.

**Contrast.** Every text pair holds 4.5:1 and every non-text control 3:1 in both
themes. `src/test-support/contrast.ts` lists the pairs the UI draws and
`contrast.test.ts` fails on a miss. A new text colour or surface goes into
`PAIRS` in the same change.

**Colours outside the tokens** are for things that cannot read CSS variables:
email HTML, the click interstitial, the docs app's own stylesheet and the CLI
preview page. They use the token values as literals, in light first where a
reader may have no theme. The brand test fails on any other hex colour.

## Links

- **Prose links** (`.po-link`, inline in a sentence) are `--po-accent-text`
  with a dotted underline that is always on, so they read as links mid-line.
- **Table links** stay `--po-bone`; **nav and breadcrumb links** stay
  `--po-muted` (nav goes to bone on hover). None of them is underlined until
  hover, and none is violet: a page of rows is not a page of violet.

## Type

Geist for everything, JetBrains Mono for data. Both are bundled through
`@fontsource` in the root layout, never fetched from a CDN. The system
grotesque stands in until Geist loads.

| Token | Size | Use |
| --- | --- | --- |
| `--po-fs-micro` | 11px | uppercase metadata labels, letter-spacing .08em |
| `--po-fs-badge` | 12px | status badges, pills |
| `--po-fs-label` | 13px | table headers and cells, form labels, timestamps |
| `--po-fs-ui` | 14px | nav, buttons |
| `--po-fs-body` | 15px | body copy, input values |
| `--po-fs-section` | 17px | card section headings |
| `--po-fs-h2` | 22px | card and drawer titles |
| `--po-fs-h1` | 30px | page titles |
| `--po-fs-kpi` | 40px | metric numbers (digits style) |
| `--po-fs-price` | 44px | plan prices (digits style) |

## Radii

| Token | Size | Use |
| --- | --- | --- |
| `--po-r-chip` | 6px | badges, keycaps, tag chips |
| `--po-r-tile` | 8px | hero icon tiles, empty-state panels |
| `--po-r-input` | 10px | inputs, buttons, selects |
| `--po-r-card` | 16px | cards, tables, code panels |
| `--po-r-modal` | 22px | modals, drawers |
| `--po-r-pill` | 999px | pills |

Menus and popovers are 10px (`.po-menu`).

## Motion

Everything is a 120–180ms fade on `--po-ease`; drawers and modals take 240ms.
The odometer digit-roll is the only flourish. Every animation is off under
`prefers-reduced-motion`.

## Logo

The Posta Brand Book is the source. The mark is a violet-ending gradient "P"
with three speed stripes, skewed 12°. The wordmark is the lowercase word
"posta" in Geist 800, tracked -0.045em. In a sentence the name is "Posta".

The files are in `public/logo/` (the docs app has its own favicon in
`apps/docs/public/logo/`). They are drawn as paths, so they need no font:

| File | Use |
| --- | --- |
| `posta-mark.svg` | the mark alone |
| `posta-wordmark.svg` | mark and word, word in white, for dark grounds |
| `posta-wordmark-light.svg` | the same, word in ink, for light grounds |
| `posta-banner.svg` | the README banner (1280 × 320 on ink) |
| `posta-favicon.svg` | the tile for under 20px: a white P on the gradient |
| `posta-avatar.svg`, `posta-avatar-512.png` | the app icon: gradient tile, corners 22.5%, the mark at half the tile's height |

`src/app/apple-icon.png` and the two `og.png` files are the same artwork
rasterised. They are made from the Brand Book's geometry, not redrawn: the
brand test checks the mark's path data and the gradient's stops.

- **Colourways.** Six, from the book. Primary (gradient on a light ground), On
  dark (gradient on ink `#0A0C10`), Reversed (white on `#6538D6`), Lilac
  (`#6538D6` on `#EFE9FF`), One colour (ink on white) and Deep (`#A98BFF` on
  `#2A1470`). Only the first two are files so far; the app uses them.
- **Size.** The stripes from 32px high. From 20 to 31px use the P alone. Under
  20px use the favicon tile. The sidebar, the mobile bar and the auth screens
  set the lockup at 32px.
- **Clear space.** Half the mark's height on every side.
- **Never.** Recolour it, stretch or squash it, rotate it, outline it, retype
  the wordmark in another face, or put it on a ground that does not contrast.
- **The gradient is for the logo and the app icon only.** In the interface the
  accent is the flat violet above. The gradient lives in the SVG files, so no
  stylesheet or component names it.
- Open: the book names `#6538D6` as its violet, and the interface accent is
  `#7046E8` (the gradient's end). They are not unified yet.

## Voice: plain, numeric, engineer to engineer

- Lead with the number, state facts, stop: "12,847 delivered. 3 bounced."
- **No exclamation points. No "Oops". No emoji.** No cheer, no apology theatre.
- Sentence case everywhere: buttons ("Create API key"), headers, nav.
  Uppercase only in 11px `.po-microlabel` ("EMAILS DELIVERED").
- British spelling in new copy ("colour", "organisation").
- A failure reads "Could not load the contact." and, where it helps, what to do
  next ("Try again."). Existing strings use both "Could not" and "Couldn't"
  and some American spellings; they are changed when the surrounding copy
  is, not in a sweep.
- Empty states state the count: "0 API keys."
- Data rendered as data: full addresses, real UUIDs, masked keys
  (`po_••••••••abcd`), mono DNS values. Never truncate a value an engineer
  might paste; give it a copy button (`.po-chip`) instead.
- Timestamps compact and relative: "24min ago", "1h ago". The exact local
  stamp shows on hover (`RelativeTime`), never inline.
- Keycaps are part of the copy: ⌘ ↵ in modal confirm buttons, Esc to cancel.
- Every user-facing string lives in the i18n catalogues. No hardcoded copy.

## Iconography

**Text is the icon system for inline affordances:** unicode glyphs in the
running font: `⧉` copy, `✓` confirmed, `●` status dot, `…` overflow, `</>`
code (mono), `→` follow-through. The drawn icons are the 10 nav glyphs in
`src/components/icons/nav-icons.tsx`: lucide-derived (ISC) paths, 16px,
stroke 1.4, currentColor, each with a semantic hover micro-animation driven
by `motion` (≤500ms on `--po-ease`, disabled under
`prefers-reduced-motion`) and triggered by the parent nav item's hover. The
command palette and page action buttons may reuse these glyphs. Do not add
other icon fonts or icon libraries.

## Fonts

- **Geist** (OFL): `@fontsource-variable/geist` (one variable file, 100–900),
  imported in the root layout of the dashboard and the docs.
- **JetBrains Mono** (OFL): `@fontsource/jetbrains-mono` (400/500/700).

## Layout

Fixed 240px sidebar on `--po-panel`; content column on `--po-void` with the
main-block padding `32px 40px` (40px gutters, never wider). Cards: panel fill,
1px line, `--po-r-card` radius, 24px padding; console cards (`/console`) run
denser at 20px, and console stat tiles at `16px 20px`. Controls are compact:
`.po-btn` and `.po-input` pad 6px 10px (input line-height 1.4) and
`.po-btn-icon` is an exact 30px wide, so everything lands about 30px tall.
Lists (`.po-table`) run at 13px with 6px cell padding, about 40px rows, so a
page of contacts or emails fits a laptop viewport; the shared `ListFooter`
holds the page-size chooser and then "Load more" at the right, both drawn as
secondary buttons, and any secondary action under a table or section is
right-aligned. Modals are **centred in the viewport** (both axes), overlay
`rgba(0,0,0,.72)`, no blur, 538px wide, `--po-r-modal` radius.

**Page header** (`PageHeader`). The H1 carries its **status badges** in the
`badges` slot, right after the title's last word on its line; they wrap
under it as a group and never sit among the actions. The mono meta line
under it is " · "-joined parts and breaks only between them. The actions
share the title's row only while the title block keeps its natural width;
otherwise they take their own row under the meta line, at any viewport
width. The trailing icon action ("…" overflow, `</>` API) goes in the
`menu` slot and never starts a row alone.

**Label/value lists** (`.po-kv` with `KvRow`: region cards, the team
dialog, settings). A value sits right-aligned on its label's line when the
whole of it fits there, and otherwise takes the line under the label at full
width; a " · "-joined value breaks only between its parts, in balanced
lines.

**Strips and dialogs.** A notice strip's action stays beside the text while
the text keeps 18rem, and otherwise takes its own line under it; the support
strip's two buttons share the full width on a phone. Dialog footers are
**not sticky**: the footer is the last thing in a dialog and scrolls with
its content; nothing renders after it. A dialog title, like the meta line,
breaks only between its " · " parts ("Ajustar limites · <team>"), and a
dialog's text wraps a long URL or address rather than widen the dialog.

**Floating panels** (menus, selects, pickers, anchored panels, tooltips,
chart hover tips) measure themselves after rendering and stay inside the
viewport with a 12px margin: they flip above or below, shift sideways, and
cap their size (`src/lib/panel-placement.ts`). A **chart tip** never covers
the pointer or the hovered point: it sits above the plot, centred on the
pointer. Without room above, a mouse's tip drops below the plot; a touch's
never does (the hand would hide it) but rises from above the fingertip,
beside the touched column.

**Narrow desktop (900–1199px).** Beside the sidebar the content column is
under 880px: the console's 4-up grids go 2-up and its 2/1 splits stack, a
detail page's meta grid lays out as many columns as keep each value 11rem
wide, and no meta value widens its column (a long chip ellipsizes). In a
list a long address wraps at its "@" and dots (`Breakable`) rather than push
the list sideways. Filter rows, wrap rows and steppers wrap at every width
rather than overflow.

**Mobile (breakpoint 900px).** Below 900px the sidebar becomes an off-canvas
drawer behind a 48px sticky topbar (hamburger `.po-btn-icon` + wordmark on
panel bg, hairline bottom); the drawer slides over content with the modal
scrim, closes on nav/scrim/Esc, and locks body scroll while open. Content
padding collapses to 16px. Header actions take the full width under the
title, each button sharing its row; the search takes the full first line of
a filter row and the selects share the lines under it (one per line under
480px); meta grids drop to 2-up then 1-up (<640px), while stat strips stay
2-up; side-by-side KPI cards stack; the console's 6-up stat tile strip drops
to 3-up then 2-up (<640px); stepper rails hide or shrink under 640px. Modals
go `calc(100vw - 24px)` under 480px and their footer buttons share the width.
Toasts drop from under the topbar (<640px) so they never cover a dialog's
footer. Tables scroll horizontally **inside their own wrapper** (the shared
`<Table>`) — the page itself never scrolls horizontally — and a list's row
menu ("…") column sticks to the wrapper's right edge at any width. An email's
events strip reads top to bottom. On touch screens
keycaps are hidden, small glyph controls (✕, ⓘ, a chip's copy button) get a
finger-sized hit area, and bulk-select checkboxes show in a column of their
own. The narrow-desktop and phone rules live in the delimited responsive
section of `components.css`; every rule above it holds at every width.

## Controls

- Buttons never show a text underline: `.po-btn` sets
  `text-decoration: none` so Link-rendered buttons don't inherit the dotted
  link treatment.
- **Focus-outline policy:** interactive controls (`.po-btn`, `.po-input`,
  `.po-menu-item`) show the violet `--po-focus-ring` on `:focus-visible`
  only. This is an accessibility requirement. Everything else (dialog panels,
  chart/svg containers, anything focused programmatically via
  `tabindex="-1"`) gets `outline: none`. No browser-blue outline anywhere.
- **Text fields on touch screens:** under `(pointer: coarse)` every text
  input, textarea, the `<Select>` trigger and the email editor's body runs at
  16px (`--po-fs-input-touch`), the only size outside the type scale: iOS
  Safari zooms the page into any field under 16px when it takes focus.
  Desktop keeps 14px.
- **Select:** never render native `<select>`. Use `<Select>` from
  `src/components/select.tsx`: a compact `.po-input` trigger with a `.po-chev`
  chevron, a `.po-menu` listbox popover, built-in search when there are more
  than 6 options, full keyboard and ARIA combobox support, ✓ on the selected
  row. Options are `{ value, label, hint? }`; controlled `value` +
  `onChange`.
- **Menus/popovers** use the `.po-menu` grammar: panel bg, 1px
  `--po-line-strong`, 10px radius, 4px padding; 13px item rows (8px radius,
  28px minimum) that raise to `--po-panel-raised`; `.po-menu-sep` hairline
  separators. `<PopoverMenu>` in
  `src/components/popover-menu.tsx` is the "…" overflow menu.
- Search inputs carry no "/" keycap for now (removed in visual QA).
