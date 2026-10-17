import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PREFLIGHT_MESSAGE_KEYS,
  type PreflightIssue,
  type PreflightNodeKind,
} from "@/lib/preflight";

// The real English catalog, so the test reads what a customer reads.
const catalogs = {
  en: (await import("../../../../messages/en/templates.json")).default,
};
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({
        locale: "en",
        messages: { templates: catalogs.en },
        namespace,
      } as never),
  };
});

const { PreflightStrip } = await import("./preflight-strip");

const NODE_KINDS: PreflightNodeKind[] = [
  "text",
  "link",
  "button",
  "image",
  "logo",
  "inlineImage",
  "linkCard",
  "variable",
];

const error: PreflightIssue = {
  id: "link-invalid",
  severity: "error",
  messageKey: "link-invalid",
  at: { scope: "node", path: [0, 1], node: "link" },
  context: "javascript:alert(1)",
};
const warning: PreflightIssue = {
  id: "image-alt-missing",
  severity: "warn",
  messageKey: "image-alt-missing",
  at: { scope: "node", path: [2], node: "image" },
  context: "banner.png",
};
const subjectWarning: PreflightIssue = {
  id: "subject-empty",
  severity: "warn",
  messageKey: "subject-empty",
  at: { scope: "subject" },
};
const sizeError: PreflightIssue = {
  id: "size-over",
  severity: "error",
  messageKey: "size-over",
  params: { size: "104 KB", limit: "102 KB" },
  at: { scope: "email" },
};

function render(props: Partial<Parameters<typeof PreflightStrip>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(PreflightStrip, {
      issues: [],
      checking: false,
      htmlSource: false,
      onReveal: () => {},
      ...props,
    }),
  );
}

describe("PreflightStrip state", () => {
  it("a clean email says 0 errors, 0 warnings", () => {
    const html = render();
    expect(html).toContain('data-state="clean"');
    expect(html).toContain("0 errors");
    expect(html).toContain("0 warnings");
    expect(html).not.toContain("data-active");
  });

  it("a warned email is in the warn state, with only the warnings counted active", () => {
    const html = render({ issues: [warning, subjectWarning] });
    expect(html).toContain('data-state="warn"');
    expect(html).toContain("0 errors");
    expect(html).toContain("2 warnings");
    expect(html).toContain('data-count="warn" data-active=""');
    expect(html).not.toContain('data-count="error" data-active');
  });

  it("an errored email is in the error state even when it also has warnings", () => {
    const html = render({ issues: [warning, error] });
    expect(html).toContain('data-state="error"');
    expect(html).toContain("1 error</span>, ");
    expect(html).toContain("1 warning");
    expect(html).toContain('data-count="error" data-active=""');
  });

  it("checking shows no counts, no clean bill, and a disabled toggle", () => {
    const html = render({ checking: true, issues: [error] });
    expect(html).toContain('data-state="checking"');
    expect(html).toContain("Checking");
    expect(html).not.toContain("0 errors");
    expect(html).not.toContain("1 error");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("checking keeps the list shut even when it was open", () => {
    const html = render({ checking: true, issues: [error], defaultOpen: true });
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("po-pf-list");
  });
});

describe("PreflightStrip list id", () => {
  it("can be given its own, so two strips on a page never share one", () => {
    const html = render({ issues: [error], listId: "tpl-preflight-list-top" });
    expect(html).toContain('aria-controls="tpl-preflight-list-top"');
    expect(html).toContain('id="tpl-preflight-list-top"');
    expect(html).not.toContain('id="tpl-preflight-list"');
  });
});

describe("PreflightStrip list", () => {
  it("is shut by default, with the toggle pointing at it", () => {
    const html = render({ issues: [error] });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="tpl-preflight-list"');
    expect(html).toContain('id="tpl-preflight-list"');
    expect(html).toMatch(/id="tpl-preflight-list"[^>]*hidden/);
    expect(html).not.toContain("po-pf-list");
  });

  it("opens to rows that name severity in words, the place and the context", () => {
    const html = render({ issues: [error, warning], defaultOpen: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("po-pf-list");
    expect(html).toContain(">Error<");
    expect(html).toContain(">Warning<");
    expect(html).toContain("po-pf-where");
    expect(html).toContain("javascript:alert(1)");
    expect(html).toContain("banner.png");
  });

  it("a row with a place is a button; a whole-email row is not", () => {
    const html = render({ issues: [error, sizeError], defaultOpen: true });
    expect(html.match(/<button[^>]*class="po-pf-issue"/g)).toHaveLength(1);
    expect(html).toContain('<div class="po-pf-issue" data-static="">');
  });

  it("subject and preview text rows are buttons too", () => {
    const html = render({
      issues: [subjectWarning, { ...subjectWarning, at: { scope: "previewText" } }],
      defaultOpen: true,
    });
    expect(html.match(/<button[^>]*class="po-pf-issue"/g)).toHaveLength(2);
  });

  it("a clean email opens to 'Nothing to fix.'", () => {
    const html = render({ defaultOpen: true });
    expect(html).toContain("Nothing to fix.");
    expect(html).not.toContain("po-pf-list");
  });

  it("an html-authored body adds the note that links and images are not read", () => {
    expect(render({ htmlSource: true, defaultOpen: true })).toContain("po-pf-note");
    expect(render({ htmlSource: false, defaultOpen: true })).not.toContain("po-pf-note");
    expect(render({ htmlSource: true })).not.toContain("po-pf-note");
  });

  it("fills a message's placeholders", () => {
    const html = render({ issues: [sizeError], defaultOpen: true });
    expect(html).toContain("104 KB");
    expect(html).toContain("102 KB");
  });
});

describe("preflight catalogs", () => {
  for (const [locale, templates] of Object.entries(catalogs)) {
    describe(locale, () => {
      const preflight = templates.preflight as {
        issue: Record<string, string>;
        where: Record<string, string>;
      } & Record<string, unknown>;

      it("has a message for every key a rule can return", () => {
        for (const key of PREFLIGHT_MESSAGE_KEYS) {
          expect(preflight.issue[key], key).toBeTruthy();
        }
      });

      it("has no message that no rule returns", () => {
        expect(Object.keys(preflight.issue).sort()).toEqual([...PREFLIGHT_MESSAGE_KEYS].sort());
      });

      it("writes a contrast ratio with one decimal, in the locale's own separator", () => {
        const say = createTranslator({
          locale,
          messages: { templates: templates as never },
          namespace: "templates.preflight",
        } as never) as unknown as (key: string, values: Record<string, number>) => string;
        const sep = locale === "en" ? "." : ",";
        for (const pair of ["text", "heading", "link", "button"]) {
          const key = `issue.theme-contrast-${pair}`;
          expect(say(key, { ratio: 4.4 })).toContain(`(4${sep}4:1)`);
          expect(say(key, { ratio: 1 })).toContain(`(1${sep}0:1)`);
        }
      });

      it("names every place an issue can sit", () => {
        for (const where of ["email", "subject", "previewText", "theme", ...NODE_KINDS]) {
          expect(preflight.where[where], where).toBeTruthy();
        }
      });
    });
  }

  it("the strip's source never names a place or message the catalog lacks", () => {
    const source = readFileSync(new URL("./preflight-strip.tsx", import.meta.url), "utf8");
    for (const key of source.match(/t\("([a-zA-Z]+)"/g) ?? []) {
      const name = key.slice(3, -1);
      expect(catalogs.en.preflight, name).toHaveProperty(name);
    }
  });
});

describe("PreflightStrip theme issue", () => {
  const themeWarning: PreflightIssue = {
    id: "theme-contrast-low",
    severity: "warn",
    messageKey: "theme-contrast-link",
    params: { ratio: 1.3 },
    at: { scope: "theme", field: "link" },
  };

  it("is a row you can click to go to the colour, named Theme, with the ratio in words", () => {
    const html = render({ issues: [themeWarning], defaultOpen: true });
    expect(html).toMatch(/<button[^>]*po-pf-issue/);
    expect(html).toContain(">Theme</span>");
    expect(html).toContain("Links are hard to read on the email background (1.3:1)");
    expect(html).toContain("po-pf-go");
  });

  it("keeps a row per colour, not one for the whole theme", () => {
    const html = render({
      issues: [
        themeWarning,
        {
          ...themeWarning,
          messageKey: "theme-contrast-text",
          at: { scope: "theme", field: "text" },
        },
      ],
      defaultOpen: true,
    });
    expect(html.match(/po-pf-msg/g)).toHaveLength(2);
    expect(html).toContain("Text is hard to read");
  });
});
