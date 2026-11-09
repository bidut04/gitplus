import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

describe('GitPulse Backend API Integration', () => {
  let app: any;
  let store: MemoryStore;
  const secret = 'test-secret';

  beforeEach(() => {
    store = new MemoryStore();
    const serverInstance = createApp(secret, store);
    app = serverInstance.app;
  });

  function sign(payload: any): string {
    const raw = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(raw).digest('hex')}`;
  }

  it('GET /health returns 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/v1/installations/register registers a new agent', async () => {
    const res = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-123', deviceName: 'MacBook-Pro-M2' });

    expect(res.status).toBe(201);
    expect(res.body.installationId).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(res.body.deviceName).toBe('MacBook-Pro-M2');
  });

  it('POST /api/v1/local-repositories/sync ingests agent status telemetry', async () => {
    // 1. Register installation first
    const instRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId: 'u-123', deviceName: 'Workstation' });
    const { installationId, token } = instRes.body;

    // 2. Submit sync state with valid Bearer token
    const syncRes = await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        installationId,
        localIdentifier: 'hash-path-443',
        repoFullName: 'org/backend-service',
        remoteUrl: 'git@github.com:org/backend-service.git',
        currentBranch: 'dev',
        trackingBranch: 'origin/dev',
        aheadCount: 0,
        behindCount: 3,
        workingTreeClean: true,
        isMerging: false,
        isRebasing: false,
        isDetached: false,
        hasConflicts: false,
        syncStatus: SyncStatus.BEHIND,
        recommendation: RecommendationAction.SAFE_PULL,
        isSafeToPull: true
      });

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.status).toBe('SYNCED');

    // 3. Verify it shows in list
    const listRes = await request(app).get('/api/v1/local-repositories');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].syncStatus).toBe(SyncStatus.BEHIND);
    expect(listRes.body[0].isSafeToPull).toBe(true);
  });

  it('POST /api/v1/webhooks/github rejects invalid HMAC', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', 'sha256=invalid-signature')
      .send({ test: true });

    expect(res.status).toBe(401);
  });

  it('POST /api/v1/webhooks/github accepts valid push webhook', async () => {
    const payload = {
      ref: 'refs/heads/main',
      before: 'sha1',
      after: 'sha2',
      forced: false,
      repository: {
        id: 12345,
        name: 'my-repo',
        full_name: 'test-org/my-repo',
        private: false,
        default_branch: 'main',
        owner: { login: 'test-org' }
      },
      sender: { login: 'octocat' },
      commits: [{ id: 'sha2', message: 'test commit' }]
    };

    const signature = sign(payload);

    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-delivery', 'deliv-1234')
      .set('x-github-event', 'push')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSED');
  });
});

