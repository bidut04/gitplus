import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';
import { GitPulseCache } from '../src/redis/redisClient';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

describe('Security Hardening & Production Safeguards (SEC-01 to SEC-07)', () => {
  let app: any;
  let store: MemoryStore;
  let cache: GitPulseCache;

  beforeEach(() => {
    store = new MemoryStore();
    cache = new GitPulseCache();
    const serverInstance = createApp('test-secret', store, cache);
    app = serverInstance.app;
  });

  it('SEC-01: Rejects unauthenticated agent sync with 401 Unauthorized', async () => {
    const regRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-sec-1', deviceName: 'Dev-Rig' });
    const { installationId } = regRes.body;

    // Call sync WITHOUT Authorization header
    const res = await request(app)
      .post('/api/v1/local-repositories/sync')
      .send({
        installationId,
        localIdentifier: 'ident-x',
        repoFullName: 'org/repo',
        remoteUrl: 'git@github.com:org/repo.git',
        currentBranch: 'main',
        aheadCount: 0,
        behindCount: 0,
        workingTreeClean: true,
        syncStatus: SyncStatus.UP_TO_DATE,
        recommendation: RecommendationAction.UP_TO_DATE,
        isSafeToPull: false
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Authorization');
  });

  it('SEC-01: Rejects agent sync with invalid/tampered token with 401 Unauthorized', async () => {
    const regRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-sec-2', deviceName: 'Dev-Rig' });
    const { installationId } = regRes.body;

    const res = await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', 'Bearer tampered-or-wrong-token-value')
      .send({
        installationId,
        localIdentifier: 'ident-x',
        repoFullName: 'org/repo',
        remoteUrl: 'git@github.com:org/repo.git',
        currentBranch: 'main',
        aheadCount: 0,
        behindCount: 0,
        workingTreeClean: true,
        syncStatus: SyncStatus.UP_TO_DATE,
        recommendation: RecommendationAction.UP_TO_DATE,
        isSafeToPull: false
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid agent authorization token');
  });

  it('SEC-01: Accepts authenticated agent sync with valid Bearer token', async () => {
    const regRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-sec-3', deviceName: 'Dev-Rig' });
    const { installationId, token } = regRes.body;

    const res = await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        installationId,
        localIdentifier: 'ident-valid',
        repoFullName: 'org/repo',
        remoteUrl: 'git@github.com:org/repo.git',
        currentBranch: 'main',
        aheadCount: 0,
        behindCount: 0,
        workingTreeClean: true,
        syncStatus: SyncStatus.UP_TO_DATE,
        recommendation: RecommendationAction.UP_TO_DATE,
        isSafeToPull: false
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SYNCED');
  });

  it('SEC-04: Rate limiter blocks requests exceeding configured threshold with 429', async () => {
    const testIp = '203.0.113.195';
    const key = `gitpulse:ratelimit:${testIp}`;
    await cache.set(key, '65', 60);

    const res = await request(app)
      .post('/api/v1/installations/register')
      .set('X-Forwarded-For', testIp)
      .send({ userId: 'u-flood', deviceName: 'SpamRig' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too Many Requests');
  });

  it('CACHE: Morning sync report caches result and invalidates on new telemetry sync', async () => {
    // 1. Register agent
    const regRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-cache-test', deviceName: 'DevBox' });
    const { installationId, token } = regRes.body;

    // 2. Initial sync
    await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        installationId,
        localIdentifier: 'id-1',
        repoFullName: 'org/cache-repo',
        remoteUrl: 'git@github.com:org/cache-repo.git',
        currentBranch: 'main',
        aheadCount: 0,
        behindCount: 0,
        workingTreeClean: true,
        syncStatus: SyncStatus.UP_TO_DATE,
        recommendation: RecommendationAction.UP_TO_DATE,
        isSafeToPull: false
      });

    // 3. Query report (Populates Cache)
    const rep1 = await request(app).get('/api/v1/reports/morning-sync?userId=u-cache-test');
    expect(rep1.status).toBe(200);
    expect(rep1.body.outdatedCount).toBe(0);

    // 4. Update sync state to BEHIND 4 commits (triggers cache invalidation)
    await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        installationId,
        localIdentifier: 'id-1',
        repoFullName: 'org/cache-repo',
        remoteUrl: 'git@github.com:org/cache-repo.git',
        currentBranch: 'main',
        aheadCount: 0,
        behindCount: 4,
        workingTreeClean: true,
        syncStatus: SyncStatus.BEHIND,
        recommendation: RecommendationAction.SAFE_PULL,
        isSafeToPull: true
      });

    // 5. Query report again: must show fresh data (outdatedCount = 1), not stale cache
    const rep2 = await request(app).get('/api/v1/reports/morning-sync?userId=u-cache-test');
    expect(rep2.status).toBe(200);
    expect(rep2.body.outdatedCount).toBe(1);
  });
});
