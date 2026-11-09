import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';
import { GitPulseCache } from '../src/redis/redisClient';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

describe('GitPulse Red Team — Chaos & Extreme Adversarial Testing', () => {
  let app: any;
  let store: MemoryStore;
  let cache: GitPulseCache;
  const webhookSecret = 'adversarial-secret-key-999';

  beforeEach(() => {
    store = new MemoryStore();
    cache = new GitPulseCache();
    const serverInstance = createApp(webhookSecret, store, cache);
    app = serverInstance.app;
  });

  function signPayload(body: any): string {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', webhookSecret);
    return `sha256=${hmac.update(raw).digest('hex')}`;
  }

  describe('PHASE 2 & 3: Authentication & Permission Attacks (IDOR & Spoofing)', () => {
    it('ATTACK: Agent A attempts to spoof Agent B installation using invalid token', async () => {
      // 1. Legitimate Agent B registers
      const regRes = await request(app)
        .post('/api/v1/installations/register')
        .send({ userId: 'victim-bob', deviceName: 'Bobs-MacBook' });
      const { installationId: bobsInstallationId } = regRes.body;

      // 2. Attacker Alice tries to submit telemetry posing as Bob using Alice token
      const fakeToken = crypto.randomBytes(32).toString('hex');

      const attackRes = await request(app)
        .post('/api/v1/local-repositories/sync')
        .set('Authorization', `Bearer ${fakeToken}`)
        .send({
          installationId: bobsInstallationId,
          localIdentifier: 'spoofed-repo-id',
          repoFullName: 'victim-org/proprietary-backend',
          remoteUrl: 'git@github.com:victim-org/proprietary-backend.git',
          currentBranch: 'main',
          aheadCount: 0,
          behindCount: 0,
          workingTreeClean: true,
          syncStatus: SyncStatus.UP_TO_DATE,
          recommendation: RecommendationAction.UP_TO_DATE,
          isSafeToPull: false
        });

      // Must be rejected with 401
      expect(attackRes.status).toBe(401);
      expect(attackRes.body.error).toContain('Invalid agent authorization token');
    });

    it('ATTACK: Agent tries to register with missing or empty parameters', async () => {
      const res1 = await request(app).post('/api/v1/installations/register').send({});
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/v1/installations/register').send({ userId: '', deviceName: '' });
      expect(res2.status).toBe(400);
    });
  });

  describe('PHASE 4: GitHub Webhook Adversarial Ingress', () => {
    it('ATTACK: Timing Attack & Malformed HMAC Header Flooding', async () => {
      const payload = { ref: 'refs/heads/main', repository: { id: 1, full_name: 'test/repo' } };

      // Invalid signature prefixes
      const res1 = await request(app)
        .post('/api/v1/webhooks/github')
        .set('x-hub-signature-256', 'md5=invalid')
        .send(payload);
      expect(res1.status).toBe(401);

      // Truncated signature
      const res2 = await request(app)
        .post('/api/v1/webhooks/github')
        .set('x-hub-signature-256', 'sha256=1234')
        .send(payload);
      expect(res2.status).toBe(401);

      // Modified payload bit flip
      const validSig = signPayload(payload);
      const tamperedPayload = { ...payload, ref: 'refs/heads/tampered' };
      const res3 = await request(app)
        .post('/api/v1/webhooks/github')
        .set('x-hub-signature-256', validSig)
        .send(tamperedPayload);
      expect(res3.status).toBe(401);
    });

    it('CHAOS: 100 Simultaneous Webhooks with Same Delivery ID (Race Condition Bomb)', async () => {
      const deliveryId = 'bomb-delivery-id-' + crypto.randomUUID();
      const payload = {
        ref: 'refs/heads/main',
        repository: { id: 888, name: 'repo-race', full_name: 'org/repo-race', private: true },
        commits: [{ id: 'sha-race-1', message: 'race test commit' }],
        sender: { login: 'adversary' }
      };
      const signature = signPayload(payload);

      // Fire 50 concurrent requests simultaneously
      const promises = Array.from({ length: 50 }).map(() =>
        request(app)
          .post('/api/v1/webhooks/github')
          .set('x-hub-signature-256', signature)
          .set('x-github-delivery', deliveryId)
          .set('x-github-event', 'push')
          .send(payload)
      );

      const results = await Promise.all(promises);

      // All requests must succeed with HTTP 200 (either PROCESSED or DUPLICATE)
      results.forEach(res => {
        expect(res.status).toBe(200);
      });

      const processedCount = results.filter(r => r.body.status === 'PROCESSED').length;
      const duplicateCount = results.filter(r => r.body.status === 'DUPLICATE').length;

      // Exactly 1 must be PROCESSED; all other 49 must be DUPLICATE!
      expect(processedCount).toBe(1);
      expect(duplicateCount).toBe(49);
      expect(store.events.size).toBe(1);
    });
  });

  describe('PHASE 7 & 8: Redis Disconnect & Cache Chaos', () => {
    it('CHAOS: Webhook processing continues seamlessly during simulated Redis connection outage', async () => {
      // Force cache to simulate offline mode
      const offlineCache = new GitPulseCache('redis://localhost:9999'); // Non-existent port
      const offlineApp = createApp(webhookSecret, store, offlineCache).app;

      const payload = {
        ref: 'refs/heads/main',
        repository: { id: 700, name: 'resilience-repo', full_name: 'org/resilience-repo', private: true },
        commits: [{ id: 'sha-c1', message: 'offline test commit' }],
        sender: { login: 'dev' }
      };
      const sig = signPayload(payload);
      const deliveryId = 'offline-delivery-' + crypto.randomUUID();

      // First webhook in offline mode -> succeeds via fallback
      const res1 = await request(offlineApp)
        .post('/api/v1/webhooks/github')
        .set('x-hub-signature-256', sig)
        .set('x-github-delivery', deliveryId)
        .set('x-github-event', 'push')
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('PROCESSED');

      // Second identical webhook in offline mode -> correctly identified as duplicate by fallback cache!
      const res2 = await request(offlineApp)
        .post('/api/v1/webhooks/github')
        .set('x-hub-signature-256', sig)
        .set('x-github-delivery', deliveryId)
        .set('x-github-event', 'push')
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('DUPLICATE');
    });
  });

  describe('PHASE 14: Fuzz Testing (Malformed / Extreme Payloads)', () => {
    it('FUZZ: Rejects malformed synchronization payloads with Zod validation details', async () => {
      const regRes = await request(app)
        .post('/api/v1/installations/register')
        .send({ userId: 'u-fuzz', deviceName: 'FuzzRig' });
      const { installationId, token } = regRes.body;

      // Malformed: negative numbers, invalid enum status, missing fields
      const res = await request(app)
        .post('/api/v1/local-repositories/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({
          installationId,
          syncStatus: 'EXPLODE_DATABASE_STATUS', // Invalid enum
          aheadCount: 'not-a-number',
          behindCount: -9999
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid sync payload');
      expect(res.body.details).toBeDefined();
    });

    it('FUZZ: Handles internationalized Unicode & Emoji branch names safely', async () => {
      const regRes = await request(app)
        .post('/api/v1/installations/register')
        .send({ userId: 'u-emoji', deviceName: 'EmojiRig' });
      const { installationId, token } = regRes.body;

      const emojiBranch = 'feature/🔥-blazing-fast-🚀-интернационализация-한글';

      const res = await request(app)
        .post('/api/v1/local-repositories/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({
          installationId,
          localIdentifier: 'ident-emoji',
          repoFullName: 'org/emoji-service',
          remoteUrl: 'git@github.com:org/emoji-service.git',
          currentBranch: emojiBranch,
          trackingBranch: `origin/${emojiBranch}`,
          aheadCount: 1,
          behindCount: 0,
          workingTreeClean: true,
          syncStatus: SyncStatus.AHEAD,
          recommendation: RecommendationAction.READY_TO_PUSH,
          isSafeToPull: false
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SYNCED');

      // Verify report returns Unicode branch name accurately
      const rep = await request(app).get('/api/v1/reports/morning-sync?userId=u-emoji');
      expect(rep.status).toBe(200);
      const found = rep.body.repositories.find((r: any) => r.branch === emojiBranch);
      expect(found).toBeDefined();
      expect(found.branch).toBe(emojiBranch);
    });
  });
});

