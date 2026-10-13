import { vi } from "vitest";
import { Posta } from "../src/index.js";

export interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A Posta client backed by a mock fetch that records every request. */
export function makeClient(response: { status?: number; body?: unknown } = {}) {
  const calls: Captured[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers = { ...((init?.headers as Record<string, string> | undefined) ?? {}) };
    const rawBody = init?.body;
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof rawBody === "string" && rawBody ? JSON.parse(rawBody) : undefined,
    });
    return new Response(JSON.stringify(response.body ?? { id: "id_1" }), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  const ms = new Posta("po_test", {
    baseUrl: "https://api.test",
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { ms, calls };
}

/** The path portion of the single captured request (drops the base URL). */
export function pathOf(call: Captured | undefined): string {
  return (call?.url ?? "").replace("https://api.test", "");
}
