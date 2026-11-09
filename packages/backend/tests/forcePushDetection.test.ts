import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';

describe('Force Push Detection & High Priority Alerts (Section 6.1 Case 6 & 7.2)', () => {
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

  it('detects forced: true, assigns CRITICAL priority, and warns subscriber', async () => {
    // Subscriber Bob
    const bob = {
      id: 'user-bob',
      githubId: '992',
      username: 'bob',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    store.users.set(bob.id, bob);

    const repo = store.upsertRepository({
      githubRepositoryId: 'repo-fleet',
      name: 'fleet-backend',
      fullName: 'org/fleet-backend'
    });

    // Bob subscribes to main
    store.subscriptions.set('sub-bob', {
      id: 'sub-bob',
      userId: bob.id,
      repositoryId: repo.id,
      branchName: 'main',
      notificationEnabled: true,
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Developer Alice force-pushes to main
    const forcePushPayload = {
      ref: 'refs/heads/main',
      before: 'commit-old-sha',
      after: 'commit-new-rewritten-sha',
      forced: true,
      repository: {
        id: 777,
        name: 'fleet-backend',
        full_name: 'org/fleet-backend',
        default_branch: 'main',
        private: true
      },
      sender: { login: 'alice' },
      commits: [{ id: 'commit-new-rewritten-sha', message: 'rebase and rewrite' }]
    };

    const signature = sign(forcePushPayload);

    const response = await (await import('supertest')).default(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', signature)
      .set('x-github-delivery', 'deliv-force-push-99')
      .set('x-github-event', 'push')
      .send(forcePushPayload);

    expect(response.status).toBe(200);

    // Verify notification was created with CRITICAL priority
    const bobNotifs = store.notifications.filter(n => n.userId === bob.id);
    expect(bobNotifs).toHaveLength(1);
    expect(bobNotifs[0].priority).toBe('CRITICAL');
    expect(bobNotifs[0].notificationType).toBe('FORCE_PUSH_DETECTED');
    expect(bobNotifs[0].title).toContain('Force-Push Detected');
  });
});

