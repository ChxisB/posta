/**
 * JSON.stringify with every object's keys in sorted order, so two values that
 * differ only in key order serialize the same. Use it wherever a stored
 * document is compared with an edited one: a jsonb column hands documents back
 * in its own key order (`{"text": …, "type": "text"}` for Tiptap's
 * `{"type": "text", "text": …}`), so a plain stringify would call an untouched
 * document changed. Array order still counts.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}
