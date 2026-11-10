import crypto from 'node:crypto';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

export interface UserEntity {
  id: string;
  githubId: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositoryEntity {
  id: string;
  githubRepositoryId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchSubscriptionEntity {
  id: string;
  userId: string;
  repositoryId: string;
  branchName: string;
  notificationEnabled: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'MUTED';
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalInstallationEntity {
  id: string;
  userId: string;
  deviceName: string;
  installationTokenHash: string;
  lastHeartbeat: Date;
  status: 'ONLINE' | 'OFFLINE';
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalRepositoryEntity {
  id: string;
  installationId: string;
  repositoryId: string;
  remoteUrl: string;
  localIdentifier: string;
  currentBranch: string;
  trackingBranch?: string | null;
  syncStatus: SyncStatus;
  recommendation: RecommendationAction;
  aheadCount: number;
  behindCount: number;
  workingTreeClean: boolean;
  isSafeToPull: boolean;
  lastScannedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubEventEntity {
  id: string;
  deliveryId: string;
  eventType: string;
  repositoryId?: string;
  branchName?: string;
  actorUsername?: string;
  beforeSha?: string;
  afterSha?: string;
  isForced: boolean;
  payload: any;
  processingStatus: 'PENDING' | 'PROCESSED' | 'DUPLICATE' | 'FAILED';
  receivedAt: Date;
  processedAt?: Date;
}

export interface NotificationEntity {
  id: string;
  userId: string;
  repositoryId: string;
  repoFullName: string;
  eventId?: string;
  branchName: string;
  notificationType: string;
  title: string;
  message: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'MUTED';
  isRead: boolean;
  metadata?: any;
  createdAt: Date;
}

export interface IMemoryStore {
  users: Map<string, UserEntity>;
  repositories: Map<string, RepositoryEntity>;
  subscriptions: Map<string, BranchSubscriptionEntity>;
  installations: Map<string, LocalInstallationEntity>;
  localRepositories: Map<string, LocalRepositoryEntity>;
  events: Map<string, GitHubEventEntity>;
  notifications: NotificationEntity[];
  clear: () => void;
  upsertRepository: (data: {
    githubRepositoryId: string;
    name: string;
    fullName: string;
    defaultBranch?: string;
    isPrivate?: boolean;
  }) => RepositoryEntity;
  findEventByDeliveryId: (deliveryId: string) => GitHubEventEntity | undefined;
  recordEvent: (evt: Omit<GitHubEventEntity, 'id' | 'receivedAt'>) => GitHubEventEntity;
}

export const createMemoryStore = (): IMemoryStore => {
  const users = new Map<string, UserEntity>();
  const repositories = new Map<string, RepositoryEntity>();
  const subscriptions = new Map<string, BranchSubscriptionEntity>();
  const installations = new Map<string, LocalInstallationEntity>();
  const localRepositories = new Map<string, LocalRepositoryEntity>();
  const events = new Map<string, GitHubEventEntity>();
  let notifications: NotificationEntity[] = [];

  const clear = (): void => {
    users.clear();
    repositories.clear();
    subscriptions.clear();
    installations.clear();
    localRepositories.clear();
    events.clear();
    notifications.length = 0;
  };

  const upsertRepository = (data: {
    githubRepositoryId: string;
    name: string;
    fullName: string;
    defaultBranch?: string;
    isPrivate?: boolean;
  }): RepositoryEntity => {
    for (const repo of repositories.values()) {
      if (repo.fullName === data.fullName || repo.githubRepositoryId === data.githubRepositoryId) {
        repo.name = data.name;
        repo.defaultBranch = data.defaultBranch ?? repo.defaultBranch;
        repo.isPrivate = data.isPrivate ?? repo.isPrivate;
        repo.updatedAt = new Date();
        return repo;
      }
    }
    const repo: RepositoryEntity = {
      id: crypto.randomUUID(),
      githubRepositoryId: data.githubRepositoryId,
      name: data.name,
      fullName: data.fullName,
      defaultBranch: data.defaultBranch ?? 'main',
      isPrivate: data.isPrivate ?? false,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    repositories.set(repo.id, repo);
    return repo;
  };

  const findEventByDeliveryId = (deliveryId: string): GitHubEventEntity | undefined => {
    for (const evt of events.values()) {
      if (evt.deliveryId === deliveryId) {
        return evt;
      }
    }
    return undefined;
  };

  const recordEvent = (evt: Omit<GitHubEventEntity, 'id' | 'receivedAt'>): GitHubEventEntity => {
    const id = crypto.randomUUID();
    const entity: GitHubEventEntity = {
      ...evt,
      id,
      receivedAt: new Date()
    };
    events.set(id, entity);
    return entity;
  };

  return {
    users,
    repositories,
    subscriptions,
    installations,
    localRepositories,
    events,
    notifications,
    clear,
    upsertRepository,
    findEventByDeliveryId,
    recordEvent
  };
};

export type MemoryStore = IMemoryStore;

export const MemoryStore = function (this: any) {
  return createMemoryStore();
} as unknown as {
  new (): MemoryStore;
  (): MemoryStore;
};

export const db = createMemoryStore();
