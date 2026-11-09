import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import helmet from 'helmet';
import { MemoryStore } from '../store/index';
import { ICacheService } from '../redis/redisClient';

export interface AuthenticatedAgentRequest extends Request {
  installation?: any;
}

export function createSecurityMiddleware(store: MemoryStore, cache: ICacheService) {
  return {
    helmetMiddleware: helmet(),

    /**
     * SEC-01 Fix: Verifies Agent Bearer Token in constant-time against installationTokenHash.
     */
    verifyAgentAuth: (req: AuthenticatedAgentRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const installationId = req.body?.installationId || req.headers['x-installation-id'];

      if (!installationId) {
        return res.status(400).json({ error: 'installationId is required' });
      }

      const inst = store.installations.get(installationId as string);
      if (!inst) {
        return res.status(404).json({ error: 'Installation not found' });
      }

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization Bearer header' });
      }

      const token = authHeader.substring('Bearer '.length).trim();
      const providedHash = crypto.createHash('sha256').update(token).digest('hex');

      const expectedHash = inst.installationTokenHash;
      if (
        providedHash.length !== expectedHash.length ||
        !crypto.timingSafeEqual(Buffer.from(providedHash, 'utf8'), Buffer.from(expectedHash, 'utf8'))
      ) {
        return res.status(401).json({ error: 'Invalid agent authorization token' });
      }

      req.installation = inst;
      next();
    },

    /**
     * SEC-04 Fix: Sliding-window rate limiter using Redis / Cache.
     */
    rateLimiter: (limit: number = 100, windowSeconds: number = 60) => {
      return async (req: Request, res: Response, next: NextFunction) => {
        const rawIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || '127.0.0.1';
        const ip = rawIp.split(',')[0].trim();
        const key = `gitpulse:ratelimit:${ip}`;

        try {
          const current = await cache.incrWithTtl(key, windowSeconds);
          if (current > limit) {
            return res.status(429).json({
              error: 'Too Many Requests',
              message: `Rate limit of ${limit} requests per ${windowSeconds}s exceeded.`
            });
          }
        } catch {
          // Fail open to avoid blocking valid traffic if cache fails
        }
        next();
      };
    }
  };
}
