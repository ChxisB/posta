import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isMailyDoc } from "./email-doc";
import { renderEmailDocument } from "./email-render";
import { EMAIL_FONTS, EMAIL_THEME_PRESETS, type EmailTheme, withTheme } from "./email-theme";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), "utf8");

const BASE: unknown = JSON.parse(fixture("email-default-doc.json"));

const themed = (theme: EmailTheme) => withTheme(BASE, theme);

const DARK = EMAIL_THEME_PRESETS.find((p) => p.id === "dark")?.theme as EmailTheme;

describe("the default look", () => {
  it("is byte-for-byte what the editor rendered before themes existed", async () => {
    // email-default.{html,txt} were captured from renderEmailDocument before the
    // theme code was written. A change that moves one byte of an unthemed
    // email's html would change every template already saved, so it must fail here.
    const { html, text } = await renderEmailDocument(BASE);
    expect(html).toBe(fixture("email-default.html"));
    expect(text).toBe(fixture("email-default.txt"));
  });

  it("is the same for no theme, an empty theme and a theme spelled out as the defaults", async () => {
    const plain = await renderEmailDocument(BASE);
    expect(await renderEmailDocument(withTheme(BASE, {}))).toEqual(plain);
    expect(
      await renderEmailDocument({
        ...(BASE as object),
        theme: {
          page: "#ffffff",
          email: "#ffffff",
          button: "#000000",
          font: "inter",
          corners: "square",
        },
      }),
    ).toEqual(plain);
  });

  it("falls back to it for a theme that does not validate, rather than failing the render", async () => {
    const plain = await renderEmailDocument(BASE);
    expect(await renderEmailDocument({ ...(BASE as object), theme: { page: "red" } })).toEqual(
      plain,
    );
  });
});

describe("a themed render", () => {
  it("puts the colours in the html, and keeps the content", async () => {
    const { html, text } = await renderEmailDocument(
      themed({
        page: "#0b0b0e",
        email: "#18181b",
        text: "#e4e4e7",
        heading: "#fafafa",
        link: "#93c5fd",
        button: "#ff5500",
        buttonText: "#010203",
      }),
    );
    expect(html).toContain("#0b0b0e");
    expect(html).toContain("#18181b");
    expect(html).toContain("#e4e4e7");
    expect(html).toContain("#fafafa");
    expect(html).toContain("#93c5fd");
    expect(html).toContain("#ff5500");
    expect(html).toContain("#010203");
    expect(html).toContain("{{{FIRST_NAME|there}}}");
    expect(html).toContain("{{{UNSUBSCRIBE_URL}}}");
    expect(text).toContain("{{{FIRST_NAME|there}}}");
  });

  it("differs from the default, and the plain text does not change with colour", async () => {
    const plain = await renderEmailDocument(BASE);
    const dark = await renderEmailDocument(themed(DARK));
    expect(dark.html).not.toBe(plain.html);
    expect(dark.text).toBe(plain.text);
  });

  it("still declares both colour schemes", async () => {
    const { html } = await renderEmailDocument(themed(DARK));
    expect(html).toContain('<meta name="color-scheme" content="light dark"/>');
  });

  it("applies corners to the email's container", async () => {
    const square = await renderEmailDocument(BASE);
    const round = await renderEmailDocument(themed({ corners: "round" }));
    expect(square.html).not.toContain("border-radius:20px");
    expect(round.html).toContain("border-radius:20px");
  });

  it("puts room around the email on the page, in the table cell that carries the page colour", async () => {
    const plain = await renderEmailDocument(BASE);
    const large = await renderEmailDocument(themed({ page: "#f4f4f5", spacing: "large" }));
    expect(plain.html).not.toContain("padding-top:48px");
    expect(large.html).toContain("background-color:#f4f4f5;padding-top:48px");
    expect(large.html).toContain("padding-bottom:48px");
  });

  it("gives an authored button colour precedence over the theme's", async () => {
    // The fixture's third button carries its own buttonColor "#7046e8".
    const { html } = await renderEmailDocument(themed({ button: "#ff5500" }));
    expect(html).toContain("#7046e8");
    expect(html).toContain("#ff5500");
  });

  it("uses the chosen font, and keeps the Inter web font only for Inter", async () => {
    const plain = await renderEmailDocument(BASE);
    expect(plain.html).toContain("rsms.me");

    const georgia = await renderEmailDocument(themed({ font: "georgia" }));
    expect(georgia.html).toContain("Georgia");
    expect(georgia.html).toContain("serif");
    expect(georgia.html).not.toContain("rsms.me");

    for (const f of EMAIL_FONTS) {
      const { html } = await renderEmailDocument(themed({ font: f.id }));
      expect(html).toContain(f.name);
      expect(html.includes("rsms.me")).toBe(f.id === "inter");
    }
  });
});

describe("one render does not colour the next", () => {
  // Maily#setTheme merges into a module-level default shared by every instance.
  // These fail if the render ever stops setting the whole theme each time.
  it("renders an unthemed email as the default after a themed one (A, B, A)", async () => {
    const before = await renderEmailDocument(BASE);
    const dark = await renderEmailDocument(themed(DARK));
    const after = await renderEmailDocument(BASE);
    expect(dark.html).not.toBe(before.html);
    expect(after).toEqual(before);
    expect(after.html).toBe(fixture("email-default.html"));
  });

  it("restores the web font after a system font", async () => {
    await renderEmailDocument(themed({ font: "courier" }));
    const { html } = await renderEmailDocument(BASE);
    expect(html).toContain("rsms.me");
    expect(html).toBe(fixture("email-default.html"));
  });

  it("keeps two themes apart when rendered in turn and at once", async () => {
    const a = themed({ page: "#0b0b0e", font: "courier" });
    const b = themed({ page: "#f4f4f5", font: "georgia", corners: "soft" });
    const [a1, b1] = [await renderEmailDocument(a), await renderEmailDocument(b)];
    const [a2, b2, plain] = await Promise.all([
      renderEmailDocument(a),
      renderEmailDocument(b),
      renderEmailDocument(BASE),
    ]);
    expect(a2).toEqual(a1);
    expect(b2).toEqual(b1);
    expect(plain.html).toBe(fixture("email-default.html"));
    expect(a1.html).not.toContain("#f4f4f5");
    expect(b1.html).not.toContain("#0b0b0e");
  });

  it("renders every preset, then the default, identically each time round", async () => {
    for (let round = 0; round < 2; round++) {
      for (const p of EMAIL_THEME_PRESETS) {
        const { html } = await renderEmailDocument(themed(p.theme));
        if (p.id === "default") expect(html).toBe(fixture("email-default.html"));
        else expect(html).not.toBe(fixture("email-default.html"));
      }
    }
  });
});

describe("the fixture", () => {
  it("is a document the renderer accepts and carries no theme", () => {
    expect(isMailyDoc(BASE)).toBe(true);
    expect("theme" in (BASE as object)).toBe(false);
  });
});
