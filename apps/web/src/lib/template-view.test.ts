import { describe, expect, it } from "vitest";
import { bodyTabs, fileSlug, sourceFileName } from "./template-view";

describe("bodyTabs", () => {
  it("gives a block template all four views, editor first", () => {
    expect(bodyTabs("blocks")).toEqual(["edit", "preview", "html", "text"]);
  });

  it("leaves an html-authored template its own two", () => {
    expect(bodyTabs("code")).toEqual(["edit", "preview"]);
  });
});

describe("fileSlug", () => {
  it("slugs the subject", () => {
    expect(fileSlug("Welcome aboard!", "Onboarding 1")).toBe("welcome-aboard");
  });

  it("is plain ASCII, lower case, with single dashes", () => {
    expect(fileSlug("  Your  Café: receipt #42 ", "x")).toBe("your-cafe-receipt-42");
    expect(fileSlug("Ünïcödé ñ", "x")).toBe("unicode-n");
  });

  it("leaves merge tags out", () => {
    expect(fileSlug("Hi {{{firstName|there}}}, welcome", "x")).toBe("hi-welcome");
    expect(fileSlug("Welcome to Acme, {{first_name}}", "x")).toBe("welcome-to-acme");
    expect(fileSlug("Hi {{ firstName }}, welcome", "x")).toBe("hi-welcome");
    // A subject that is only a tag has no slug of its own.
    expect(fileSlug("{{{firstName}}}", "Weekly digest")).toBe("weekly-digest");
  });

  it("falls back to the name, then to template", () => {
    expect(fileSlug("", "Weekly digest")).toBe("weekly-digest");
    expect(fileSlug("   ", "Weekly digest")).toBe("weekly-digest");
    // A subject with no Latin letters has no slug of its own.
    expect(fileSlug("你好", "Weekly digest")).toBe("weekly-digest");
    expect(fileSlug("", "")).toBe("template");
    expect(fileSlug("你好", "!!!")).toBe("template");
  });

  it("stops at 60 characters without a trailing dash", () => {
    const slug = fileSlug(`${"a".repeat(59)} bbbb`, "x");
    expect(slug).toBe("a".repeat(59));
    expect(fileSlug("word ".repeat(40), "x").length).toBeLessThanOrEqual(60);
    expect(fileSlug("word ".repeat(40), "x").endsWith("-")).toBe(false);
  });
});

describe("sourceFileName", () => {
  it("names the html and text downloads", () => {
    expect(sourceFileName("Welcome", "n", "html")).toBe("welcome.html");
    expect(sourceFileName("Welcome", "n", "text")).toBe("welcome.txt");
    expect(sourceFileName("", "", "text")).toBe("template.txt");
  });
});
