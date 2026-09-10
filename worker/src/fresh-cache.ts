/** Owner-local, bounded memory only. No stale serving, persistence or timers. */
export class FreshCache<T> {
  private entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(
    private maximum = 4,
    private now = () => Date.now(),
  ) {}
  clear() {
    this.entries.clear();
  }
  get(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    for (const [k, entry] of this.entries)
      if (entry.expires <= now) this.entries.delete(k);
    const found = this.entries.get(key);
    if (found) return found.value;
    // Expiry starts before I/O; slow reads cannot extend the freshness budget.
    const entry = { expires: now + ttl, value: Promise.resolve().then(load) };
    this.entries.set(key, entry);
    while (this.entries.size > this.maximum)
      this.entries.delete(this.entries.keys().next().value!);
    void entry.value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return entry.value;
  }
}
export const BUSY_CACHE_TTL_MS = 30_000;
const DAY = 86_400_000;
/** A bounded snapshot shared across adjacent weeks, meeting types and time zones. */
export function busyWindow(from: number, to: number) {
  const start = Math.floor(from / (14 * DAY)) * 14 * DAY;
  return { from: start, to: Math.max(to, start + 24 * DAY) };
}
