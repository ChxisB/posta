/** mulberry32: a small seeded generator, so the demo workspace reads the same on every load. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const hex = (len: number): string =>
    Array.from({ length: len }, () => int(0, 15).toString(16)).join("");
  return {
    next,
    int,
    hex,
    chance: (p: number): boolean => next() < p,
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T,
    // A v4-shaped id from the stream, so row ids repeat across loads too.
    uuid: (): string =>
      `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + int(0, 3)).toString(16)}${hex(3)}-${hex(12)}`,
    /** Fisher-Yates over a copy. */
    shuffle: <T>(xs: readonly T[]): T[] => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
