export class MemoryCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly maxEntries = 100) {}
  get(key: string): T | undefined {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) { this.values.delete(key); return undefined; }
    return item.value;
  }
  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.values.delete(key);
    while (this.values.size >= this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  clear(): void { this.values.clear(); }
}
