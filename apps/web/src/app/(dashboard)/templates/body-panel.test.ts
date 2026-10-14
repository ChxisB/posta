import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import enBlocks from "../../../../messages/en/block-editor.json";
import en from "../../../../messages/en/templates.json";
import ptBR from "../../../../messages/pt-BR/templates.json";
import { ContentPreview } from "../broadcasts/parts";
import { BodyPanel } from "./body-panel";
import { SourceActions, SourceView } from "./source-view";

function intl(messages: Record<string, unknown>, children: ReactElement): ReactElement {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(intl({ templates: en, "block-editor": enBlocks }, node));
}

const noop = () => {};
const HTML = '<p>Hi {{{firstName}}} &amp; welcome</p>\n<a href="https://example.com">Go</a>';

function panel(over: Partial<Parameters<typeof BodyPanel>[0]> = {}) {
  return createElement(BodyPanel, {
    wide: false,
    tab: "preview",
    onTab: noop,
    mode: "blocks",
    editorKey: 0,
    document: null,
    html: HTML,
    text: "Hi Ada & welcome\nGo (https://example.com)",
    name: "Welcome email",
    rendering: false,
    converting: false,
    mergeFields: [],
    previewSamples: { firstName: "Ada" },
    inbox: { subject: "Welcome aboard!", previewText: "" },
    onBlocksChange: noop,
    onCodeChange: noop,
    onConvert: noop,
    ...over,
  });
}

/** Labels of the buttons inside the group with this aria-label, with their pressed state. */
function segments(markup: string, label: string): [string, string][] {
  const group = new RegExp(`aria-label="${label}">(.*?)</fieldset>`, "s").exec(markup)?.[1] ?? "";
  return [...group.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)].map(
    (m) => [m[2] ?? "", m[1] ?? ""],
  );
}

describe("BodyPanel view switch", () => {
  it("offers a block template Edit, Preview, HTML and Text, the open one pressed", () => {
    expect(segments(render(panel({ tab: "html" })), "Body view")).toEqual([
      ["Edit", "false"],
      ["Preview", "false"],
      ["HTML", "true"],
      ["Text", "false"],
    ]);
    expect(segments(render(panel({ tab: "preview" })), "Body view")[1]).toEqual([
      "Preview",
      "true",
    ]);
  });

  it("leaves an html-authored template its Edit and Preview pair", () => {
    const markup = render(panel({ mode: "code", tab: "preview" }));
    expect(segments(markup, "Body view")).toEqual([
      ["Edit", "false"],
      ["Preview", "true"],
    ]);
    // Neither the width toggle nor the source actions are theirs.
    expect(markup).not.toContain("Preview width");
    expect(markup).not.toContain("Download");
  });

  it("shows the width toggle beside the switch on a block template's preview only", () => {
    const preview = render(panel({ tab: "preview" }));
    expect(segments(preview, "Preview width")).toEqual([
      ["Desktop", "true"],
      ["Mobile", "false"],
    ]);
    expect(preview.indexOf("Preview width")).toBeLessThan(preview.indexOf("Body view"));
    expect(render(panel({ tab: "html" }))).not.toContain("Preview width");
  });

  it("shows the generated html read-only, with Copy and Download", () => {
    const markup = render(panel({ tab: "html" }));
    expect(markup).toContain('<textarea class="po-tpl-source" readOnly=""');
    expect(markup).toContain('aria-label="Generated HTML"');
    expect(markup).toContain('wrap="off"');
    // The source as rendered, merge tags and all, escaped for the page.
    expect(markup).toContain("Hi {{{firstName}}} &amp;amp; welcome");
    expect(markup).toContain(">Copy</button>");
    expect(markup).toContain(">Download</button>");
    expect(markup).not.toContain("<iframe");
  });

  it("shows the plain text, wrapped, under its own label", () => {
    const markup = render(panel({ tab: "text" }));
    expect(markup).toContain('aria-label="Plain text"');
    expect(markup).toContain('wrap="soft"');
    expect(markup).toContain("Go (https://example.com)");
  });

  it("holds Copy and Download back while a render is pending or there is nothing to hand over", () => {
    const disabled = (markup: string) =>
      [...markup.matchAll(/<button[^>]*disabled=""[^>]*>(Copy|Download)</g)].length;
    expect(disabled(render(panel({ tab: "html", rendering: true })))).toBe(2);
    expect(disabled(render(panel({ tab: "text", text: "" })))).toBe(2);
    expect(disabled(render(panel({ tab: "html" })))).toBe(0);
  });

  it("says so when there is no html or text yet", () => {
    expect(render(panel({ tab: "html", html: "" }))).toContain("No HTML yet.");
    expect(render(panel({ tab: "text", text: "" }))).toContain("No plain text yet.");
    expect(render(panel({ tab: "text", text: "" }))).not.toContain("<textarea");
  });

  it("names the body group by its label, and points the label at a field only where one exists", () => {
    const blocks = render(panel({ tab: "preview" }));
    expect(blocks).toContain('id="tpl-body-label"');
    expect(blocks).toContain('<section aria-labelledby="tpl-body-label">');
    expect(blocks).not.toContain('for="tpl-html"');
    expect(render(panel({ tab: "html" }))).not.toContain('for="tpl-html"');
  });
});

describe("BodyPanel width", () => {
  it("is one column at reading width; the rails around it are the layout's", () => {
    const markup = render(panel({ tab: "edit", mode: "code" }));
    expect(markup).not.toContain("po-tpl-rail");
    expect(markup).not.toContain("data-rail");
    expect(markup).toContain("max-width:720px");
  });

  it("leaves a wide html-and-preview field its full width", () => {
    expect(render(panel({ wide: true }))).toContain("max-width:1200px");
  });
});

describe("ContentPreview width", () => {
  const preview = (device?: "desktop" | "mobile") =>
    renderToStaticMarkup(
      intl(
        { emails: { detail: { previewLight: "Light", previewDark: "Dark" } } },
        createElement(ContentPreview, {
          html: HTML,
          title: "Preview",
          samples: { firstName: "Ada" },
          ...(device ? { device } : {}),
        }),
      ),
    );

  it("keeps the full-width frame by default, exactly as the composer draws it", () => {
    const markup = preview();
    expect(markup).toContain("width:100%;height:560px;border:0");
    expect(markup).not.toContain("max-width");
    expect(preview("desktop")).toBe(markup);
  });

  it("narrows the frame to a phone and centres it, changing nothing else", () => {
    const markup = preview("mobile");
    expect(markup).toContain("width:375px;max-width:100%;height:560px;border:0");
    expect(markup).toContain("justify-content:center");
  });

  it("never lets scripts run and fills merge samples, at either width", () => {
    for (const device of ["desktop", "mobile"] as const) {
      const markup = preview(device);
      expect(markup).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
      expect(markup).toContain("Hi Ada");
      expect(markup).not.toContain("firstName");
    }
  });
});

describe("source views", () => {
  it("renders a source's html escaped, never as markup", () => {
    const markup = render(createElement(SourceView, { kind: "html", value: "<script>x</script>" }));
    expect(markup).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
  });

  it("starts its copy status empty, in a live region", () => {
    const markup = render(
      createElement(SourceActions, {
        kind: "html",
        value: "x",
        fileName: "a.html",
        disabled: false,
      }),
    );
    expect(markup).toContain('role="status" class="po-tpl-source-note"></span>');
  });
});

describe("messages", () => {
  const keys = [
    "htmlTab",
    "textTab",
    "viewLabel",
    "deviceLabel",
    "deviceDesktop",
    "deviceMobile",
    "noText",
    "htmlSourceLabel",
    "htmlSourceHint",
    "textSourceHint",
    "copy",
    "copied",
    "copyFailed",
    "download",
  ] as const;

  it("has every view-switch string in both languages", () => {
    for (const key of keys) {
      expect(en.editor[key], key).toBeTruthy();
      expect(ptBR.editor[key], key).toBeTruthy();
    }
  });
});
