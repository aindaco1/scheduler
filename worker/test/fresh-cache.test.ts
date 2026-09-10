import { describe, it, expect, vi } from "vitest";
import { FreshCache, busyWindow } from "../src/fresh-cache";
describe("bounded private calendar memo", () => {
  it("coalesces concurrent readers and expires from the start of a read", async () => {
    let now = 0;
    const cache = new FreshCache<number>(4, () => now);
    const load = vi.fn(async () => {
      now += 10;
      return 1;
    });
    expect(
      await Promise.all(
        Array.from({ length: 30 }, () => cache.get("week", 30, load)),
      ),
    ).toEqual(Array(30).fill(1));
    expect(load).toHaveBeenCalledTimes(1);
    now = 30;
    await cache.get("week", 30, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("never serves expired data on failure and retries failed reads", async () => {
    let now = 0;
    const cache = new FreshCache<number>(4, () => now);
    await cache.get("week", 30, async () => 1);
    now = 31;
    await expect(
      cache.get("week", 30, async () => {
        throw Error("provider unavailable");
      }),
    ).rejects.toThrow();
    expect(await cache.get("week", 30, async () => 2)).toBe(2);
  });
  it("cannot resurrect a snapshot invalidated while it was loading", async () => {
    const cache = new FreshCache<number>();
    let resolve!: (value: number) => void;
    const old = cache.get(
      "week",
      30_000,
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await Promise.resolve();
    cache.clear();
    resolve(1);
    await old;
    expect(await cache.get("week", 30_000, async () => 2)).toBe(2);
  });
  it("bounds cardinality and isolates calendar selection keys", async () => {
    const cache = new FreshCache<number>(2);
    for (const [i, key] of ["family", "work", "personal"].entries())
      await cache.get(key, 30_000, async () => i);
    expect(await cache.get("family", 30_000, async () => 99)).toBe(99);
  });
  it("covers the maximum picker range across bucket and DST boundaries", () => {
    const day = 86_400_000;
    for (let i = 0; i < 42; i++) {
      const from = Date.parse("2026-10-20T05:00:00Z") + i * day;
      const to = from + 8 * day + 12 * 3_600_000;
      const window = busyWindow(from, to);
      expect(window.from).toBeLessThanOrEqual(from);
      expect(window.to).toBeGreaterThanOrEqual(to);
      expect(window.to - window.from).toBeLessThanOrEqual(24 * day);
    }
  });
});
