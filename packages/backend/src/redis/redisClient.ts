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
export const createMemoryTtlCache = (): ICacheService => {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  let timer: NodeJS.Timeout | undefined;

  const sweep = (): void => {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && v.expiresAt < now) {
        store.delete(k);
      }
    }
  };

  timer = setInterval(sweep, 60000);
  if (timer.unref) timer.unref();

  const setNxWithTtl = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    const now = Date.now();
    const existing = store.get(key);
    if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
      return false;
    }
    store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
    return true;
  };

  const get = async (key: string): Promise<string | null> => {
    const now = Date.now();
    const existing = store.get(key);
    if (!existing) return null;
    if (existing.expiresAt && existing.expiresAt < now) {
      store.delete(key);
      return null;
    }
    return existing.value;
  };

  const set = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    store.set(key, { value, expiresAt });
  };

  const del = async (key: string): Promise<void> => {
    store.delete(key);
  };

  const incrWithTtl = async (key: string, ttlSeconds: number): Promise<number> => {
    const current = await get(key);
    const count = current ? parseInt(current, 10) + 1 : 1;
    await set(key, String(count), ttlSeconds);
    return count;
  };

  const close = async (): Promise<void> => {
    if (timer) clearInterval(timer);
    store.clear();
  };

  const isRedisConnected = (): boolean => false;

  return {
    setNxWithTtl,
    get,
    set,
    del,
    incrWithTtl,
    close,
    isRedisConnected
  };
};

/**
 * Enterprise Production Redis Cache with automatic fallback.
 */
export const createGitPulseCache = (redisUrl?: string, customOptions?: RedisOptions): ICacheService => {
  const fallback = createMemoryTtlCache();
  let redis: Redis | undefined;
  let connected = false;

  const targetUrl = redisUrl || process.env.REDIS_URL;

  if (targetUrl) {
    try {
      redis = new Redis(targetUrl, {
        maxRetriesPerRequest: 1,
        commandTimeout: 2000,
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        ...customOptions
      });

      redis.on('connect', () => {
        connected = true;
      });

      redis.on('error', () => {
        connected = false;
      });

      redis.on('close', () => {
        connected = false;
      });

      redis.connect().catch(() => {
        connected = false;
      });
    } catch {
      connected = false;
    }
  }

  const isRedisConnected = (): boolean => connected && redis?.status === 'ready';

  const setNxWithTtl = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    if (isRedisConnected() && redis) {
      try {
        const res = await redis.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // Fallback transparently
      }
    }
    return fallback.setNxWithTtl(key, value, ttlSeconds);
  };

  const get = async (key: string): Promise<string | null> => {
    if (isRedisConnected() && redis) {
      try {
        return await redis.get(key);
      } catch {}
    }
    return fallback.get(key);
  };

  const set = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
    if (isRedisConnected() && redis) {
      try {
        if (ttlSeconds) {
          await redis.set(key, value, 'EX', ttlSeconds);
        } else {
          await redis.set(key, value);
        }
        return;
      } catch {}
    }
    return fallback.set(key, value, ttlSeconds);
  };

  const del = async (key: string): Promise<void> => {
    if (isRedisConnected() && redis) {
      try {
        await redis.del(key);
        return;
      } catch {}
    }
    return fallback.del(key);
  };

  const incrWithTtl = async (key: string, ttlSeconds: number): Promise<number> => {
    if (isRedisConnected() && redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, ttlSeconds);
        }
        return count;
      } catch {}
    }
    return fallback.incrWithTtl(key, ttlSeconds);
  };

  const close = async (): Promise<void> => {
    if (redis) {
      try {
        await redis.quit();
      } catch {}
    }
    await fallback.close();
  };

  return {
    setNxWithTtl,
    get,
    set,
    del,
    incrWithTtl,
    close,
    isRedisConnected
  };
};

export type GitPulseCache = ICacheService;

export const GitPulseCache = function (this: any, redisUrl?: string, customOptions?: RedisOptions) {
  return createGitPulseCache(redisUrl, customOptions);
} as unknown as {
  new (redisUrl?: string, customOptions?: RedisOptions): GitPulseCache;
  (redisUrl?: string, customOptions?: RedisOptions): GitPulseCache;
};

export const defaultCache: ICacheService = createGitPulseCache();
