import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../src/store/index';
import { NotificationService } from '../src/services/notificationService';

describe('Notification Intelligence (T-NOTIF-*)', () => {
  let store: MemoryStore;
  let notifService: NotificationService;

  beforeEach(() => {
    store = new MemoryStore();
    notifService = new NotificationService(store);
  });

  it('T-NOTIF-001: suppresses self-notifications when author matches subscriber', async () => {
    // User Alice
    const alice = {
      id: 'u-alice',
      githubId: '1001',
      username: 'alice',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // User Bob
    const bob = {
      id: 'u-bob',
      githubId: '1002',
      username: 'bob',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    store.users.set(alice.id, alice);
    store.users.set(bob.id, bob);

    const repo = store.upsertRepository({
      githubRepositoryId: 'repo-1',
      name: 'fleet-backend',
      fullName: 'org/fleet-backend'
    });

    // Both subscribe to 'dev'
    store.subscriptions.set('sub-alice', {
      id: 'sub-alice',
      userId: alice.id,
      repositoryId: repo.id,
      branchName: 'dev',
      notificationEnabled: true,
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    store.subscriptions.set('sub-bob', {
      id: 'sub-bob',
      userId: bob.id,
      repositoryId: repo.id,
      branchName: 'dev',
      notificationEnabled: true,
      priority: 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Alice pushes commits
    const notifs = await notifService.processPushNotifications({
      event: { id: 'evt-1' } as any,
      repository: repo,
      branchName: 'dev',
      actorUsername: 'alice',
      commits: [{ id: 'c1', message: 'add feature' }],
      isForced: false
    });

    // Alice should NOT receive a notification; only Bob should
    expect(notifs).toHaveLength(1);
    expect(notifs[0].userId).toBe(bob.id);
  });

  it('T-NOTIF-002: debounces and groups rapid pushes within sliding window', () => {
    const author = 'carol';
    const branch = 'dev';
    const repo = 'org/api';

    const p1 = notifService.shouldDebouncePush(author, branch, repo, 2, 5000);
    expect(p1.isDebounced).toBe(false);
    expect(p1.group?.totalCommits).toBe(2);

    const p2 = notifService.shouldDebouncePush(author, branch, repo, 3, 5000);
    expect(p2.isDebounced).toBe(true);
    expect(p2.group?.pushCount).toBe(2);
    expect(p2.group?.totalCommits).toBe(5);
  });

  it('T-NOTIF-003: matches wildcard branch subscriptions like release/*', () => {
    expect(notifService.matchesBranch('release/*', 'release/v1.0')).toBe(true);
    expect(notifService.matchesBranch('release/*', 'release/2026.1')).toBe(true);
    expect(notifService.matchesBranch('release/*', 'main')).toBe(false);
  });
});

