import Redis, { RedisOptions } from 'ioredis';

export interface ICacheService {
  setNxWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
  close(): Promise<void>;
  isRedisConnected(): boolean;
}

/**
 * Resilient In-Memory TTL Cache fallback when Redis is offline or unconfigured.
 */
class MemoryTtlCache implements ICacheService {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private timer?: NodeJS.Timeout;

  constructor() {
    // Eviction sweep every 60 seconds to prevent memory leaks
    this.timer = setInterval(() => this.sweep(), 60000);
    if (this.timer.unref) this.timer.unref();
  }

  private readonly sweep = (): void => {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt && v.expiresAt < now) {
        this.store.delete(k);
      }
    }
  };

  public readonly setNxWithTtl = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
      return false;
    }
    this.store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return true;
  };

  public readonly get = async (key: string): Promise<string | null> => {
    const now = Date.now();
    const existing = this.store.get(key);
    if (!existing) return null;
    if (existing.expiresAt && existing.expiresAt < now) {
      this.store.delete(key);
      return null;
    }
    return existing.value;
  };

  public readonly set = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  };

  public readonly del = async (key: string): Promise<void> => {
    this.store.delete(key);
  };

  public readonly incrWithTtl = async (key: string, ttlSeconds: number): Promise<number> => {
    const current = await this.get(key);
    const count = current ? parseInt(current, 10) + 1 : 1;
    await this.set(key, String(count), ttlSeconds);
    return count;
  };

  public readonly close = async (): Promise<void> => {
    if (this.timer) clearInterval(this.timer);
    this.store.clear();
  };

  public readonly isRedisConnected = (): boolean => {
    return false;
  };
}

/**
 * Enterprise Production Redis Cache with automatic fallback.
 */
export class GitPulseCache implements ICacheService {
  private redis?: Redis;
  private fallback: MemoryTtlCache;
  private connected: boolean = false;

  constructor(redisUrl?: string, customOptions?: RedisOptions) {
    this.fallback = new MemoryTtlCache();

    const targetUrl = redisUrl || process.env.REDIS_URL;

    if (targetUrl) {
      try {
        this.redis = new Redis(targetUrl, {
          maxRetriesPerRequest: 1,
          commandTimeout: 2000,
          enableReadyCheck: true,
          lazyConnect: true,
          retryStrategy: (times) => {
            if (times > 5) return null; // Stop reconnecting after 5 attempts
            return Math.min(times * 200, 2000);
          },
          ...customOptions
        });

        this.redis.on('connect', () => {
          this.connected = true;
        });

        this.redis.on('error', () => {
          this.connected = false;
        });

        this.redis.on('close', () => {
          this.connected = false;
        });

        this.redis.connect().catch(() => {
          this.connected = false;
        });
      } catch {
        this.connected = false;
      }
    }
  }

  public readonly isRedisConnected = (): boolean => {
    return this.connected && this.redis?.status === 'ready';
  };

  public readonly setNxWithTtl = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    if (this.isRedisConnected() && this.redis) {
      try {
        const res = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // Fallback transparently
      }
    }
    return this.fallback.setNxWithTtl(key, value, ttlSeconds);
  };

  public readonly get = async (key: string): Promise<string | null> => {
    if (this.isRedisConnected() && this.redis) {
      try {
        return await this.redis.get(key);
      } catch {}
    }
    return this.fallback.get(key);
  };

  public readonly set = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    if (this.isRedisConnected() && this.redis) {
      try {
        if (ttlSeconds) {
          await this.redis.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.redis.set(key, value);
        }
        return;
      } catch {}
    }
    return this.fallback.set(key, value, ttlSeconds);
  };

  public readonly del = async (key: string): Promise<void> => {
    if (this.isRedisConnected() && this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch {}
    }
    return this.fallback.del(key);
  };

  public readonly incrWithTtl = async (key: string, ttlSeconds: number): Promise<number> => {
    if (this.isRedisConnected() && this.redis) {
      try {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, ttlSeconds);
        }
        return count;
      } catch {}
    }
    return this.fallback.incrWithTtl(key, ttlSeconds);
  };

  public readonly close = async (): Promise<void> => {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {}
    }
    await this.fallback.close();
  };
}

export const defaultCache = new GitPulseCache();
export const createGitPulseCache = (redisUrl?: string, customOptions?: RedisOptions): GitPulseCache => new GitPulseCache(redisUrl, customOptions);
