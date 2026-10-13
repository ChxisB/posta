import { expect, it } from "vitest";
import { parseEmailFrom } from "../src/env.js";

it("parses a bare address", () => {
  expect(parseEmailFrom("no-reply@mail.example.com")).toEqual({
    name: null,
    address: "no-reply@mail.example.com",
  });
  expect(parseEmailFrom("  no-reply@mail.example.com  ")).toEqual({
    name: null,
    address: "no-reply@mail.example.com",
  });
});

it("parses a display-name form, with or without quotes", () => {
  expect(parseEmailFrom("Posta <no-reply@mail.example.com>")).toEqual({
    name: "Posta",
    address: "no-reply@mail.example.com",
  });
  expect(parseEmailFrom('"Posta" <no-reply@mail.example.com>')).toEqual({
    name: "Posta",
    address: "no-reply@mail.example.com",
  });
  expect(parseEmailFrom("<no-reply@mail.example.com>")).toEqual({
    name: null,
    address: "no-reply@mail.example.com",
  });
});

it("rejects values whose address part is not an email", () => {
  expect(parseEmailFrom("")).toBeNull();
  expect(parseEmailFrom("not-an-email")).toBeNull();
  expect(parseEmailFrom("Name <not-an-email>")).toBeNull();
  expect(parseEmailFrom("Name <a@b.com> trailing")).toBeNull();
  expect(parseEmailFrom("two words@example.com")).toBeNull();
});
