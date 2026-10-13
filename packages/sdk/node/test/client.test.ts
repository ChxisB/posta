import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { MillionSend } from "../src/index.js";
import { type Captured, makeClient } from "./helper.js";

describe("construction", () => {
  it("throws without an API key and without the env var", () => {
    const prev = process.env.MILLIONSEND_API_KEY;
    delete process.env.MILLIONSEND_API_KEY;
    expect(() => new MillionSend()).toThrow(/Missing API key/);
    if (prev !== undefined) process.env.MILLIONSEND_API_KEY = prev;
  });

  it("falls back to MILLIONSEND_API_KEY", () => {
    process.env.MILLIONSEND_API_KEY = "ms_env";
    expect(() => new MillionSend()).not.toThrow();
    delete process.env.MILLIONSEND_API_KEY;
  });

  it("strips a trailing slash from the base URL", async () => {
    const calls: Captured[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push({ url: String(url), method: "GET", headers: {}, body: undefined });
      return new Response("{}", { status: 200 });
    });
    const ms = new MillionSend("ms_test", {
      baseUrl: "https://api.test/",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await ms.emails.get("e1");
    expect(calls[0]?.url).toBe("https://api.test/emails/e1");
  });

  it("defaults the base URL to MillionSend Cloud; the env var and the option win in turn", async () => {
    const prev = process.env.MILLIONSEND_BASE_URL;
    delete process.env.MILLIONSEND_BASE_URL;
    const calls: Captured[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      calls.push({ url: String(url), method: "GET", headers: {}, body: undefined });
      return new Response("{}", { status: 200 });
    });
    const fetch = fetchImpl as unknown as typeof globalThis.fetch;

    await new MillionSend("ms_test", { fetch }).emails.get("e1");
    expect(calls[0]?.url).toBe("https://api.millionsend.com/emails/e1");

    process.env.MILLIONSEND_BASE_URL = "https://mail.env.test";
    await new MillionSend("ms_test", { fetch }).emails.get("e1");
    expect(calls[1]?.url).toBe("https://mail.env.test/emails/e1");

    await new MillionSend("ms_test", { fetch, baseUrl: "https://mail.opt.test" }).emails.get("e1");
    expect(calls[2]?.url).toBe("https://mail.opt.test/emails/e1");

    if (prev === undefined) delete process.env.MILLIONSEND_BASE_URL;
    else process.env.MILLIONSEND_BASE_URL = prev;
  });

  it("rejects invalid request deadlines", () => {
    expect(() => new MillionSend("ms_test", { timeoutMs: 0 })).toThrow(/timeoutMs/);
  });

  it("refuses a non-loopback http base URL unless allowInsecureHttp is set", () => {
    expect(() => new MillionSend("ms_test", { baseUrl: "http://mail.example.com" })).toThrow(
      /allowInsecureHttp/,
    );
    process.env.MILLIONSEND_BASE_URL = "http://mail.example.com";
    expect(() => new MillionSend("ms_test")).toThrow(/allowInsecureHttp/);
    delete process.env.MILLIONSEND_BASE_URL;
    expect(
      () =>
        new MillionSend("ms_test", { baseUrl: "http://mail.example.com", allowInsecureHttp: true }),
    ).not.toThrow();
    expect(() => new MillionSend("ms_test", { baseUrl: "http://localhost:3001" })).not.toThrow();
    expect(() => new MillionSend("ms_test", { baseUrl: "http://127.0.0.1:3001" })).not.toThrow();
  });

  it("keeps the API key out of inspect and JSON output", () => {
    const ms = new MillionSend("ms_secret_key", { baseUrl: "https://api.test" });
    expect(inspect(ms, { depth: 10 })).not.toContain("ms_secret_key");
    expect(JSON.stringify(ms)).not.toContain("ms_secret_key");
  });
});

describe("request wiring", () => {
  it("sets Bearer auth, Accept, User-Agent and Content-Type on writes", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>" });
    const h = calls[0]?.headers ?? {};
    expect(h.Authorization).toBe("Bearer ms_test");
    expect(h.Accept).toBe("application/json");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["User-Agent"]).toMatch(/^millionsend-node\/\d/);
  });

  it("applies a request deadline", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("{}", { status: 200 });
    });
    const ms = new MillionSend("ms_test", {
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5_000,
    });

    await ms.emails.get("e1");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps camelCase inputs to the snake_case wire and omits undefined", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send({
      from: "a@x.dev",
      to: ["b@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      replyTo: "r@x.dev",
      scheduledAt: "2999-01-01T00:00:00Z",
    });
    expect(calls[0]?.body).toEqual({
      from: "a@x.dev",
      to: ["b@x.dev"],
      subject: "s",
      html: "<p>h</p>",
      reply_to: "r@x.dev",
      scheduled_at: "2999-01-01T00:00:00Z",
    });
  });

  it("sends Idempotency-Key on POST when provided, and only on POST", async () => {
    const { ms, calls } = makeClient();
    await ms.emails.send(
      { from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" },
      { idempotencyKey: "key-123" },
    );
    expect(calls[0]?.headers["Idempotency-Key"]).toBe("key-123");
    // The negative half of the guard: no other verb or resource carries the
    // header — only the two send surfaces are wired to it.
    await ms.emails.get("e1");
    await ms.contacts.update({ id: "c1", unsubscribed: true });
    await ms.segments.remove("s1");
    for (const call of calls.slice(1)) {
      expect(call.headers["Idempotency-Key"]).toBeUndefined();
    }
    expect(calls).toHaveLength(4);
  });

  it("returns { data } on 2xx", async () => {
    const { ms } = makeClient({ body: { id: "abc" } });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "abc" });
  });

  it("returns a normalized error on non-2xx", async () => {
    const { ms } = makeClient({
      status: 422,
      body: { statusCode: 422, name: "validation_error", message: "bad" },
    });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.data).toBeNull();
    expect(res.error).toEqual({ statusCode: 422, name: "validation_error", message: "bad" });
  });

  it("passes the all_recipients_suppressed 422 through by name", async () => {
    const { ms } = makeClient({
      status: 422,
      body: {
        statusCode: 422,
        name: "all_recipients_suppressed",
        message: "All recipients are suppressed",
      },
    });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.data).toBeNull();
    expect(res.error?.name).toBe("all_recipients_suppressed");
    expect(res.error?.statusCode).toBe(422);
  });

  it("surfaces a transport failure as statusCode null", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const ms = new MillionSend("ms_test", {
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const res = await ms.emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" });
    expect(res.data).toBeNull();
    expect(res.error?.statusCode).toBeNull();
    expect(res.error?.message).toMatch(/ECONNREFUSED/);
  });

  it("falls back to a generic error when the body is not the canonical shape", async () => {
    const { ms } = makeClient({ status: 500, body: "gateway boom" });
    const res = await ms.emails.get("e1");
    expect(res.error).toEqual({
      name: "application_error",
      message: "Request failed with status 500",
      statusCode: 500,
    });
  });
});
