import crypto from 'node:crypto';
import { MemoryStore, RepositoryEntity, GitHubEventEntity, NotificationEntity } from '../store/index';
import { ICacheService, defaultCache } from '../redis/redisClient';

export interface PushNotificationContext {
  event: GitHubEventEntity;
  repository: RepositoryEntity;
  branchName: string;
  actorUsername?: string;
  commits: Array<{ id: string; message: string; author?: { username?: string; name?: string } }>;
  isForced: boolean;
  isDeleted?: boolean;
}

export interface DebouncedPushGroup {
  actor: string;
  branch: string;
  repoFullName: string;
  pushCount: number;
  totalCommits: number;
  lastTimestamp: number;
}

export interface INotificationService {
  subscribeSSE: (callback: (data: NotificationEntity) => void) => () => void;
  matchesBranch: (subscriptionPattern: string, branchName: string) => boolean;
  shouldDebouncePush: (
    author: string,
    branch: string,
    repoFullName: string,
    commitCount: number,
    windowMs?: number
  ) => { isDebounced: boolean; group?: DebouncedPushGroup };
  processPushNotifications: (ctx: PushNotificationContext) => Promise<NotificationEntity[]>;
}

export const createNotificationService = (
  store: MemoryStore,
  cache: ICacheService = defaultCache
): INotificationService => {
  const recentPushes = new Map<string, DebouncedPushGroup>();
  const sseClients = new Set<(data: NotificationEntity) => void>();
  const maxStoredNotifications = 5000;

  const subscribeSSE = (callback: (data: NotificationEntity) => void): (() => void) => {
    sseClients.add(callback);
    return () => {
      sseClients.delete(callback);
    };
  };

  const matchesBranch = (subscriptionPattern: string, branchName: string): boolean => {
    if (subscriptionPattern === branchName) return true;
    if (subscriptionPattern.endsWith('/*')) {
      const prefix = subscriptionPattern.slice(0, -2);
      return branchName.startsWith(prefix + '/');
    }
    return false;
  };

  const shouldDebouncePush = (
    author: string,
    branch: string,
    repoFullName: string,
    commitCount: number,
    windowMs: number = 300000
  ): { isDebounced: boolean; group?: DebouncedPushGroup } => {
    const key = `${repoFullName}:${branch}:${author}`;
    const now = Date.now();
    const existing = recentPushes.get(key);

    if (existing && now - existing.lastTimestamp < windowMs) {
      existing.pushCount += 1;
      existing.totalCommits += commitCount;
      existing.lastTimestamp = now;
      return { isDebounced: true, group: existing };
    }

    const newGroup: DebouncedPushGroup = {
      actor: author,
      branch,
      repoFullName,
      pushCount: 1,
      totalCommits: commitCount,
      lastTimestamp: now
    };
    recentPushes.set(key, newGroup);
    return { isDebounced: false, group: newGroup };
  };

  const processPushNotifications = async (ctx: PushNotificationContext): Promise<NotificationEntity[]> => {
    const { event, repository, branchName, actorUsername, commits, isForced, isDeleted } = ctx;
    const commitCount = commits.length;
    const generated: NotificationEntity[] = [];

    const matchingSubscriptions = Array.from(store.subscriptions.values()).filter(sub => {
      return (
        sub.repositoryId === repository.id &&
        sub.notificationEnabled &&
        matchesBranch(sub.branchName, branchName)
      );
    });

    for (const sub of matchingSubscriptions) {
      const user = store.users.get(sub.userId);
      if (!user) continue;

      if (actorUsername && user.username.toLowerCase() === actorUsername.toLowerCase()) {
        continue;
      }

      const debounceCheck = shouldDebouncePush(
        actorUsername || 'unknown',
        branchName,
        repository.fullName,
        commitCount
      );

      if (debounceCheck.isDebounced && debounceCheck.group && !isForced && !isDeleted) {
        const existingUnread = store.notifications.find(
          n => n.userId === user.id && n.repositoryId === repository.id && n.branchName === branchName && !n.isRead
        );
        if (existingUnread) {
          existingUnread.title = `New updates available on ${branchName}`;
          existingUnread.message = `${actorUsername || 'A contributor'} pushed ${debounceCheck.group.pushCount} updates (${debounceCheck.group.totalCommits} commits total) to ${repository.fullName}:${branchName}.`;
          existingUnread.metadata = {
            ...existingUnread.metadata,
            commitCount: debounceCheck.group.totalCommits,
            pushCount: debounceCheck.group.pushCount
          };
          existingUnread.createdAt = new Date();
          generated.push(existingUnread);
          continue;
        }
      }

      let title: string;
      let message: string;
      let priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'MUTED' = sub.priority;
      let notificationType: string = 'NEW_COMMITS_AVAILABLE';

      if (isDeleted) {
        priority = 'HIGH';
        notificationType = 'BRANCH_DELETED';
        title = `Branch ${branchName} was deleted`;
        message = `${actorUsername || 'A contributor'} deleted branch ${branchName} on ${repository.fullName}.`;
      } else if (isForced) {
        priority = 'CRITICAL';
        notificationType = 'FORCE_PUSH_DETECTED';
        title = `⚠️ Force-Push Detected on ${branchName}`;
        message = `${actorUsername || 'A contributor'} force-pushed changes to ${repository.fullName}:${branchName}. Local history may have diverged.`;
      } else if (debounceCheck.isDebounced && debounceCheck.group) {
        title = `New updates available on ${branchName}`;
        message = `${actorUsername || 'A contributor'} pushed ${debounceCheck.group.pushCount} updates (${debounceCheck.group.totalCommits} commits total) to ${repository.fullName}:${branchName}.`;
      } else {
        title = `New commits available on ${branchName}`;
        message = `${actorUsername || 'A contributor'} pushed ${commitCount} commit(s) to ${repository.fullName}:${branchName}.`;
      }

      const notif: NotificationEntity = {
        id: crypto.randomUUID(),
        userId: user.id,
        repositoryId: repository.id,
        repoFullName: repository.fullName,
        eventId: event.id,
        branchName,
        notificationType,
        title,
        message,
        priority,
        isRead: false,
        metadata: {
          commitCount,
          isForced,
          isDeleted,
          actorUsername
        },
        createdAt: new Date()
      };

      store.notifications.push(notif);
      if (store.notifications.length > maxStoredNotifications) {
        store.notifications.splice(0, store.notifications.length - maxStoredNotifications);
      }
      generated.push(notif);

      sseClients.forEach(client => {
        try {
          client(notif);
        } catch {}
      });
    }

    return generated;
  };

  return {
    subscribeSSE,
    matchesBranch,
    shouldDebouncePush,
    processPushNotifications
  };
};

export type NotificationService = INotificationService;

export const NotificationService = function (
  this: any,
  store: MemoryStore,
  cache: ICacheService = defaultCache
) {
  return createNotificationService(store, cache);
} as unknown as {
  new (store: MemoryStore, cache?: ICacheService): NotificationService;
  (store: MemoryStore, cache?: ICacheService): NotificationService;
};
