/**
 * Template tag names, as the dashboard checks them before it asks. The rules
 * are the API's (tagNameProblem in @posta/core, which the server enforces);
 * test/template-tags.test.ts keeps the two agreeing.
 */

export type TagNameProblem = "format" | "digits";

const TAG_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Why a name is refused, or null when it is fine. Names are compared exactly, case included. */
export function tagNameProblem(name: string): TagNameProblem | null {
  if (!TAG_NAME.test(name)) return "format";
  // Digits alone are version numbers in a URL, so a tag may not look like one.
  if (/^[0-9]+$/.test(name)) return "digits";
  return null;
}
