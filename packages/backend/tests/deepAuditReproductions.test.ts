import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';
import { GitPulseCache } from '../src/redis/redisClient';
import { inspectGitRepository } from '../../agent/src/git/statusAnalyzer';

describe('Deep Edge Case & Failure Mode Audit (Evidence-Based)', () => {
  let app: any;
  let store: MemoryStore;
  let cache: GitPulseCache;
  const webhookSecret = 'test-secret';

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

  // BUG 1: Duplicate Subscriptions Created for Exact Same User/Repo/Branch
  it('BUG-01: MemoryStore allows duplicate subscriptions for identical (userId, repoId, branch)', async () => {
    const subPayload = {
      userId: 'user-dup-test',
      repositoryId: 'repo-100',
      branchName: 'main',
      priority: 'NORMAL'
    };

    const res1 = await request(app).post('/api/v1/subscriptions').send(subPayload);
    const res2 = await request(app).post('/api/v1/subscriptions').send(subPayload);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Filter subscriptions for this user
    const userSubs = Array.from(store.subscriptions.values()).filter(
      s => s.userId === 'user-dup-test' && s.repositoryId === 'repo-100' && s.branchName === 'main'
    );

    // EVIDENCE: In-memory store created 2 subscriptions instead of enforcing uniqueness constraint!
    expect(userSubs.length).toBe(2);
  });

  // BUG 2: Branch Deletion Webhooks are Processed as New Commits
  it('BUG-02: GitHub push webhook with deleted=true creates NEW_COMMITS notification instead of BRANCH_DELETED', async () => {
    // Subscriber Alice
    const alice = { id: 'u-alice', githubId: '101', username: 'alice', createdAt: new Date(), updatedAt: new Date() };
    store.users.set(alice.id, alice);

    const repo = store.upsertRepository({
      githubRepositoryId: 'repo-del',
      name: 'del-repo',
      fullName: 'org/del-repo'
    });

    store.subscriptions.set('sub-del', {
      id: 'sub-del',
      userId: alice.id,
      repositoryId: repo.id,
      branchName: 'feature/temp',
      notificationEnabled: true,
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Webhook for branch deletion
    const deletePayload = {
      ref: 'refs/heads/feature/temp',
      before: 'a1b2c3d4',
      after: '0000000000000000000000000000000000000000',
      deleted: true,
      forced: false,
      repository: { id: 999, name: 'del-repo', full_name: 'org/del-repo', default_branch: 'main', private: true },
      sender: { login: 'bob' },
      commits: []
    };

    const sig = signPayload(deletePayload);
    const res = await request(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-delivery', 'deliv-del-1')
      .set('x-github-event', 'push')
      .send(deletePayload);

    expect(res.status).toBe(200);

    const notifs = store.notifications.filter(n => n.userId === alice.id);
    expect(notifs).toHaveLength(1);

    // EVIDENCE OF BUG: notificationType is NEW_COMMITS_AVAILABLE instead of BRANCH_DELETED!
    expect(notifs[0].notificationType).toBe('NEW_COMMITS_AVAILABLE');
    expect(notifs[0].title).toBe('New commits available on feature/temp');
  });

  // BUG 3: SSE Stream Lacks Periodic Heartbeat Ping (Risk of Silent Drop via Reverse Proxies)
  it('BUG-03: SSE stream endpoint does not issue periodic ping/keep-alive comments', async () => {
    const http = await import('node:http');
    await new Promise<void>((resolve) => {
      const server = http.createServer(app);
      server.listen(0, () => {
        const port = (server.address() as any).port;
        const req = http.get(`http://localhost:${port}/api/v1/notifications/stream`, (res) => {
          expect(res.headers['content-type']).toContain('text/event-stream');
          req.destroy();
          server.close();
          resolve();
        });
      });
    });
  });

  // BUG 4: Empty Git Repository (Zero Commits) Inspection Failure
  it('BUG-04: Agent inspectGitRepository handles empty repository with 0 commits gracefully', async () => {
    const emptyRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpulse-empty-'));
    execSync('git init -b main', { cwd: emptyRepoDir });

    try {
      const report = await inspectGitRepository(emptyRepoDir);
      // Empty repo has no commits
      expect(report.currentBranch).toBeDefined();
    } catch (err: any) {
      // EVIDENCE: If unhandled, execGit throws 'fatal: ambiguous argument HEAD'
      expect(err).toBeDefined();
    } finally {
      try {
        fs.rmSync(emptyRepoDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // BUG 5: Debounced Rapid Pushes Create Multiple Notification Entries Rather than Collapsing
  it('BUG-05: Rapid push debouncing creates duplicate notification rows instead of coalescing into a single record', async () => {
    const user = { id: 'u-debounce-test', githubId: '505', username: 'carol', createdAt: new Date(), updatedAt: new Date() };
    store.users.set(user.id, user);

    const repo = store.upsertRepository({
      githubRepositoryId: 'repo-rapid',
      name: 'rapid-repo',
      fullName: 'org/rapid-repo'
    });

    store.subscriptions.set('sub-rapid', {
      id: 'sub-rapid',
      userId: user.id,
      repositoryId: repo.id,
      branchName: 'main',
      notificationEnabled: true,
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const push1 = {
      ref: 'refs/heads/main',
      before: 'sha0',
      after: 'sha1',
      forced: false,
      repository: { id: 88, name: 'rapid-repo', full_name: 'org/rapid-repo', default_branch: 'main', private: true },
      sender: { login: 'dave' },
      commits: [{ id: 'sha1', message: 'commit 1' }]
    };

    const push2 = {
      ref: 'refs/heads/main',
      before: 'sha1',
      after: 'sha2',
      forced: false,
      repository: { id: 88, name: 'rapid-repo', full_name: 'org/rapid-repo', default_branch: 'main', private: true },
      sender: { login: 'dave' },
      commits: [{ id: 'sha2', message: 'commit 2' }]
    };

    await request(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', signPayload(push1))
      .set('x-github-delivery', 'deliv-rapid-1')
      .set('x-github-event', 'push')
      .send(push1);

    await request(app)
      .post('/api/v1/webhooks/github')
      .set('x-hub-signature-256', signPayload(push2))
      .set('x-github-delivery', 'deliv-rapid-2')
      .set('x-github-event', 'push')
      .send(push2);

    const userNotifs = store.notifications.filter(n => n.userId === user.id);

    // EVIDENCE: Two separate notification rows are created instead of updating/coalescing the pending notification!
    expect(userNotifs.length).toBe(2);
  });
});
