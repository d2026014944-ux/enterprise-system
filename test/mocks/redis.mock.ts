/**
 * Redis Mock — In-memory Redis for unit tests
 *
 * Implements the ioredis interface with an in-memory Map.
 * Supports TTL via setTimeout cleanup.
 */

export class RedisMock {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private timers = new Map<string, NodeJS.Timeout>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    let ttl: number | undefined;
    if (args.length >= 2 && args[0] === 'EX') {
      ttl = Number(args[1]) * 1000;
    } else if (args.length >= 2 && args[0] === 'PX') {
      ttl = Number(args[1]);
    }

    // Clear existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const expiresAt = ttl ? Date.now() + ttl : undefined;
    this.store.set(key, { value, expiresAt });

    if (ttl) {
      const timer = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, ttl);
      timer.unref();
      this.timers.set(key, timer);
    }

    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async flushall(): Promise<'OK'> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.store.clear();
    return 'OK';
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async info(): Promise<string> {
    return `# Keyspace\r\ndb0:keys=${this.store.size}\r\n`;
  }

  async quit(): Promise<'OK'> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.store.clear();
    return 'OK';
  }

  async disconnect(): Promise<void> {
    await this.quit();
  }

  // Event emitter stubs
  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  once(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  removeListener(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }
}
