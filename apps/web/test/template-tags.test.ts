import { tagNameProblem as serverProblem } from "@posta/core";
import { describe, expect, it } from "vitest";
import { tagNameProblem } from "@/lib/template-tags";

// The dashboard checks a tag name before it asks; the server's rules decide.
describe("template tag names", () => {
  const names = [
    "production",
    "v1.2-rc_3",
    "A",
    "a".repeat(64),
    "a".repeat(65),
    "",
    "123",
    "1a",
    "-lead",
    ".lead",
    "has space",
    "tag/slash",
    "ünï",
    "tag:colon",
  ];

  it.each(names)("agrees with the server on %j", (name) => {
    expect(tagNameProblem(name) === null).toBe(serverProblem(name) === null);
  });

  it("tells a bad shape from a name made of digits", () => {
    expect(tagNameProblem("production")).toBeNull();
    expect(tagNameProblem("has space")).toBe("format");
    expect(tagNameProblem("123")).toBe("digits");
  });
});
