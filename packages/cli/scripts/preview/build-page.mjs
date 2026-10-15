// Assembles the before/after review page from scenarios.json and the rendered screens.
// Usage: node build-page.mjs  → out/cli-before-after.html
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const scenarios = JSON.parse(readFileSync(join(HERE, "scenarios.json"), "utf8"));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stats = (htmlPath) => {
  const txt = readFileSync(join(HERE, htmlPath.replace(/\.html$/, ".txt")), "utf8")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\n$/, "");
  const lines = txt.split("\n");
  const widest = Math.max(...lines.map((l) => [...l].length));
  return { lines: lines.length, widest };
};
const screen = (htmlPath) => readFileSync(join(HERE, htmlPath), "utf8").trim();

const BUILDS = [
  { key: "before", chip: "0.1.1 · published", label: "Before" },
  { key: "after", chip: "next · this branch", label: "After" },
];

const windows = (s) =>
  BUILDS.map((b) => {
    const st = stats(s[b.key].html);
    return `
      <section class="win" data-build="${b.key}" aria-label="${b.label}: ${esc(s.title)}">
        <div class="bar">
          <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="bar-title">posta: ${s[b.key].cols}×50</span>
          <span class="chip chip-${b.key}">${b.chip}</span>
        </div>
        <div class="screen" style="--cols:${s[b.key].cols}" tabindex="0">${screen(s[b.key].html)}</div>
        <div class="foot"><span>${st.lines} lines</span><span>widest line ${st.widest} cells</span></div>
      </section>`;
  }).join("");

const railItems = scenarios
  .map((s) => {
    const b = stats(s.before.html);
    const a = stats(s.after.html);
    return `<button class="rail-item" role="tab" data-id="${s.id}" aria-selected="false">
      <span class="rail-title">${esc(s.title)}</span>
      <span class="rail-meta"><span>${b.lines}</span><span class="arrow">→</span><span>${a.lines}</span> lines</span>
    </button>`;
  })
  .join("");

const scenes = scenarios
  .map(
    (s) => `
    <article class="scene" data-id="${s.id}" hidden>
      <div class="scene-head">
        <h2>${esc(s.title)}</h2>
        <pre class="cmd">${s.command
          .split("\n")
          .map((c) => `<span class="prompt">$</span> ${esc(c)}`)
          .join("\n")}</pre>
        <p class="notes">${esc(s.notes)}</p>
      </div>
      <div class="stage">${windows(s)}</div>
    </article>`,
  )
  .join("");

const page = `<title>Migrate CLI Before and After</title>
<style>
  :root {
    color-scheme: dark;
    --void: #09090b; --panel: #111115; --panel-2: #18181d; --line: #26262d; --line-2: #33333c;
    --bone: #f4f4f6; --ink-2: #9b9ba6; --steel: #9b9ba6; --accent: #a98bff;
    --ui: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --term-bg: #111115; --term-bar: #09090b; --term-line: #26262d; --term-line-2: #33333c;
    --term-fg: #f4f4f6; --term-dim: #9b9ba6; --term-bright: #ffffff;
    --t-green: #5fce8b; --t-yellow: #d9ae5f; --t-red: #e07f76; --t-cyan: #8fb3d9; --t-magenta: #e88bc0; --t-blue: #7ea6db;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --void: #f8f8fa; --panel: #ffffff; --panel-2: #f1f1f5; --line: #e5e5eb; --line-2: #d3d3dc;
      --bone: #16161d; --ink-2: #62626e; --steel: #62626e; --accent: #7046e8;
    }
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --void: #f8f8fa; --panel: #ffffff; --panel-2: #f1f1f5; --line: #e5e5eb; --line-2: #d3d3dc;
    --bone: #16161d; --ink-2: #62626e; --steel: #62626e; --accent: #7046e8;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--void); color: var(--bone); font-family: var(--ui); font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .top { padding: 28px 32px 20px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 32px; align-items: end; }
  h1 { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -0.01em; text-wrap: balance; }
  h1 code, .lede code { font-family: var(--mono); font-weight: 400; font-size: 0.92em; }
  .lede { margin: 6px 0 0; max-width: 68ch; color: var(--ink-2); }
  .legend { display: flex; gap: 18px; font-family: var(--mono); font-size: 12px; color: var(--steel); white-space: nowrap; }
  .legend b { font-weight: 500; }
  .body { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: calc(100vh - 110px); }
  .rail { border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0; align-self: start; max-height: 100vh; overflow: auto; }
  .rail-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--steel); padding: 4px 10px 8px; }
  .rail-item { all: unset; cursor: pointer; display: grid; gap: 2px; padding: 9px 10px; border-radius: 8px; border-left: 2px solid transparent; }
  .rail-item:hover { background: var(--panel-2); }
  .rail-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .rail-item[aria-selected="true"] { background: var(--panel-2); border-left-color: var(--accent); }
  .rail-title { font-weight: 500; }
  .rail-meta { font-family: var(--mono); font-size: 11.5px; color: var(--steel); font-variant-numeric: tabular-nums; display: flex; gap: 5px; }
  .rail-meta .arrow { color: var(--line-2); }
  main { padding: 20px 28px 48px; min-width: 0; }
  .scene-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 24px; align-items: start; margin-bottom: 16px; }
  .scene-head h2 { margin: 0; font-size: 18px; font-weight: 500; letter-spacing: -0.01em; }
  .cmd { grid-column: 1; margin: 0; font-family: var(--mono); font-size: 12.5px; color: var(--ink-2); white-space: pre-wrap; word-break: break-word; }
  .cmd .prompt { color: var(--steel); }
  .notes { grid-column: 1; margin: 0; color: var(--ink-2); max-width: 78ch; }
  .view { grid-column: 2; grid-row: 1 / span 3; display: inline-flex; border: 1px solid var(--line); border-radius: 8px; padding: 3px; gap: 2px; background: var(--panel); align-self: start; }
  .view button { all: unset; cursor: pointer; padding: 5px 12px; border-radius: 6px; font-size: 13px; color: var(--ink-2); white-space: nowrap; }
  .view button:focus-visible { outline: 2px solid var(--accent); }
  .view button[aria-pressed="true"] { background: var(--panel-2); color: var(--bone); box-shadow: inset 0 0 0 1px var(--line-2); }
  .view kbd { font-family: var(--mono); font-size: 10.5px; color: var(--steel); margin-left: 6px; }
  .stage { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
  .stage[data-view="side"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stage[data-view="before"] .win[data-build="after"], .stage[data-view="after"] .win[data-build="before"] { display: none; }
  .win { min-width: 0; background: var(--term-bg); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--term-line); background: var(--term-bar); color: var(--term-dim); font-family: var(--mono); font-size: 11.5px; }
  .dots { display: inline-flex; gap: 6px; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--term-line); border: 1px solid var(--term-line-2); }
  .bar-title { text-align: center; }
  .chip { justify-self: end; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--term-line-2); font-size: 11px; color: var(--term-dim); }
  .chip-after { border-color: #a98bff; color: var(--term-fg); }
  .screen { overflow: auto; padding: 16px 18px 18px; max-height: 72vh; scrollbar-color: var(--term-line-2) var(--term-bg); }
  .screen:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .term { margin: 0; font-family: var(--mono); font-size: 12.5px; line-height: 1.5; color: var(--term-fg); min-width: calc(var(--cols) * 1ch); tab-size: 8; }
  .foot { display: flex; gap: 16px; padding: 7px 14px; border-top: 1px solid var(--term-line); font-family: var(--mono); font-size: 11px; color: var(--term-dim); font-variant-numeric: tabular-nums; }
  .term .bold { font-weight: 700; color: var(--term-bright); }
  .term .dim, .term .fg-90 { color: var(--term-dim); }
  .term .fg-97 { color: var(--term-bright); }
  .term .fg-31, .term .fg-91 { color: var(--t-red); }
  .term .fg-32, .term .fg-92 { color: var(--t-green); }
  .term .fg-33, .term .fg-93 { color: var(--t-yellow); }
  .term .fg-34, .term .fg-94 { color: var(--t-blue); }
  .term .fg-35, .term .fg-95 { color: var(--t-magenta); }
  .term .fg-36, .term .fg-96 { color: var(--t-cyan); }
  .term .fg-37 { color: var(--term-fg); }
  .term .bold.fg-32 { color: var(--t-green); }
  .term .bold.fg-33 { color: var(--t-yellow); }
  .term .bold.fg-31 { color: var(--t-red); }
  .term .dim.bold { color: var(--term-dim); }
  @media (max-width: 1180px) { .stage[data-view="side"] { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 860px) {
    .body { grid-template-columns: minmax(0, 1fr); }
    .rail { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--line); flex-direction: row; flex-wrap: wrap; }
    .rail-label { width: 100%; }
    .top, .scene-head { grid-template-columns: minmax(0, 1fr); }
    .view { grid-column: 1; grid-row: auto; }
    main { padding: 16px; }
  }
  @media (prefers-reduced-motion: no-preference) { .rail-item, .view button { transition: background-color 120ms ease, color 120ms ease; } }
</style>

<header class="top">
  <div>
    <h1>The migrate CLI, before and after</h1>
    <p class="lede">Nine recordings of <code>@tack-labs/posta-cli</code> against the same seeded Resend account and a fresh Posta instance, captured under a real pseudo-terminal at 100×50 (one at 60 columns). Left, 0.1.1 as published; right, the restyled build on this branch. Screens are the terminal's final state after every in-place redraw.</p>
  </div>
  <div class="legend" aria-label="Terminal colors"><span><b style="color:var(--t-green)">✓</b> done</span><span><b style="color:var(--t-cyan)">⟳</b> running</span><span><b style="color:var(--t-magenta)">!</b> manual</span><span><b style="color:var(--t-yellow)">~</b> update</span><span><b style="color:var(--t-red)">✗</b> failed</span></div>
</header>
<div class="body">
  <nav class="rail" role="tablist" aria-label="Scenarios">
    <div class="rail-label">Scenarios</div>
    ${railItems}
  </nav>
  <main>
    <div class="view" role="group" aria-label="View">
      <button type="button" data-view="before" aria-pressed="false">Before<kbd>1</kbd></button>
      <button type="button" data-view="after" aria-pressed="false">After<kbd>2</kbd></button>
      <button type="button" data-view="side" aria-pressed="false">Side by side<kbd>3</kbd></button>
    </div>
    ${scenes}
  </main>
</div>
<script>
  (() => {
    const ids = ${JSON.stringify(scenarios.map((s) => s.id))};
    const rail = [...document.querySelectorAll(".rail-item")];
    const scenes = [...document.querySelectorAll(".scene")];
    const viewButtons = [...document.querySelectorAll(".view button")];
    const viewBox = document.querySelector(".view");
    let view = null;
    try { view = localStorage.getItem("migrate-preview-view"); } catch {}
    if (!["before", "after", "side"].includes(view)) view = window.innerWidth >= 1180 ? "side" : "after";
    let current = "migrate";
    try { current = localStorage.getItem("migrate-preview-scene") || current; } catch {}
    if (!ids.includes(current)) current = ids[0];
    const applyView = () => {
      for (const b of viewButtons) b.setAttribute("aria-pressed", String(b.dataset.view === view));
      for (const stage of document.querySelectorAll(".stage")) stage.dataset.view = view;
      try { localStorage.setItem("migrate-preview-view", view); } catch {}
    };
    const show = (id) => {
      current = id;
      for (const s of scenes) s.hidden = s.dataset.id !== id;
      for (const r of rail) r.setAttribute("aria-selected", String(r.dataset.id === id));
      const active = scenes.find((s) => s.dataset.id === id);
      if (active) active.querySelector(".scene-head").before(viewBox);
      try { localStorage.setItem("migrate-preview-scene", id); } catch {}
    };
    for (const r of rail) r.addEventListener("click", () => show(r.dataset.id));
    for (const b of viewButtons) b.addEventListener("click", () => { view = b.dataset.view; applyView(); });
    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
      const i = ids.indexOf(current);
      if (e.key === "ArrowRight" || e.key === "j") show(ids[(i + 1) % ids.length]);
      else if (e.key === "ArrowLeft" || e.key === "k") show(ids[(i - 1 + ids.length) % ids.length]);
      else if (e.key === "1") { view = "before"; applyView(); }
      else if (e.key === "2") { view = "after"; applyView(); }
      else if (e.key === "3") { view = "side"; applyView(); }
      else return;
      e.preventDefault();
    });
    applyView();
    show(current);
  })();
</script>
`;

writeFileSync(join(HERE, "out", "cli-before-after.html"), page);
console.log(`wrote ${join(HERE, "out", "cli-before-after.html")} (${page.length} bytes)`);
