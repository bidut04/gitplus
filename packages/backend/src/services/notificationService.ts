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
}

export interface DebouncedPushGroup {
  actor: string;
  branch: string;
  repoFullName: string;
  pushCount: number;
  totalCommits: number;
  lastTimestamp: number;
}

export class NotificationService {
  private recentPushes: Map<string, DebouncedPushGroup> = new Map();
  private sseClients: Set<(data: NotificationEntity) => void> = new Set();
  private maxStoredNotifications: number = 5000;

  constructor(
    private store: MemoryStore,
    private cache: ICacheService = defaultCache
  ) {}

  subscribeSSE(callback: (data: NotificationEntity) => void): () => void {
    this.sseClients.add(callback);
    return () => {
      this.sseClients.delete(callback);
    };
  }

  /**
   * Evaluates branch pattern matches (e.g. "main", "dev", "release/*").
   */
  matchesBranch(subscriptionPattern: string, branchName: string): boolean {
    if (subscriptionPattern === branchName) return true;
    if (subscriptionPattern.endsWith('/*')) {
      const prefix = subscriptionPattern.slice(0, -2);
      return branchName.startsWith(prefix + '/');
    }
    return false;
  }

  /**
   * Groups rapid pushes by author and branch within a sliding time window (default 5 minutes).
   */
  shouldDebouncePush(
    author: string,
    branch: string,
    repoFullName: string,
    commitCount: number,
    windowMs: number = 300000
  ): { isDebounced: boolean; group?: DebouncedPushGroup } {
    const key = `${repoFullName}:${branch}:${author}`;
    const now = Date.now();
    const existing = this.recentPushes.get(key);

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
    this.recentPushes.set(key, newGroup);
    return { isDebounced: false, group: newGroup };
  }

  async processPushNotifications(ctx: PushNotificationContext): Promise<NotificationEntity[]> {
    const { event, repository, branchName, actorUsername, commits, isForced } = ctx;
    const commitCount = commits.length;
    const generated: NotificationEntity[] = [];

    // Find all users who are subscribed to this repository
    const matchingSubscriptions = Array.from(this.store.subscriptions.values()).filter(sub => {
      return (
        sub.repositoryId === repository.id &&
        sub.notificationEnabled &&
        this.matchesBranch(sub.branchName, branchName)
      );
    });

    for (const sub of matchingSubscriptions) {
      const user = this.store.users.get(sub.userId);
      if (!user) continue;

      // 1. Invariant: Suppress self-notifications!
      if (actorUsername && user.username.toLowerCase() === actorUsername.toLowerCase()) {
        continue;
      }

      // 2. Debouncing / Grouping check
      const debounceCheck = this.shouldDebouncePush(
        actorUsername || 'unknown',
        branchName,
        repository.fullName,
        commitCount
      );

      let title: string;
      let message: string;
      let priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'MUTED' = sub.priority;

      if (isForced) {
        priority = 'CRITICAL';
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
        notificationType: isForced ? 'FORCE_PUSH_DETECTED' : 'NEW_COMMITS_AVAILABLE',
        title,
        message,
        priority,
        isRead: false,
        metadata: {
          commitCount,
          isForced,
          actorUsername
        },
        createdAt: new Date()
      };

      this.store.notifications.push(notif);
      if (this.store.notifications.length > this.maxStoredNotifications) {
        this.store.notifications.splice(0, this.store.notifications.length - this.maxStoredNotifications);
      }
      generated.push(notif);

      // Broadcast to active SSE listeners
      this.sseClients.forEach(client => {
        try {
          client(notif);
        } catch {}
      });
    }

    return generated;
  }
}

