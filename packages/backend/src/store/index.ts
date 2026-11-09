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

export class MemoryStore {
  users = new Map<string, UserEntity>();
  repositories = new Map<string, RepositoryEntity>();
  subscriptions = new Map<string, BranchSubscriptionEntity>();
  installations = new Map<string, LocalInstallationEntity>();
  localRepositories = new Map<string, LocalRepositoryEntity>();
  events = new Map<string, GitHubEventEntity>();
  notifications: NotificationEntity[] = [];

  clear() {
    this.users.clear();
    this.repositories.clear();
    this.subscriptions.clear();
    this.installations.clear();
    this.localRepositories.clear();
    this.events.clear();
    this.notifications = [];
  }

  // Repository methods
  upsertRepository(data: {
    githubRepositoryId: string;
    name: string;
    fullName: string;
    defaultBranch?: string;
    isPrivate?: boolean;
  }): RepositoryEntity {
    for (const repo of this.repositories.values()) {
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
    this.repositories.set(repo.id, repo);
    return repo;
  }

  // Event delivery deduplication
  findEventByDeliveryId(deliveryId: string): GitHubEventEntity | undefined {
    for (const evt of this.events.values()) {
      if (evt.deliveryId === deliveryId) {
        return evt;
      }
    }
    return undefined;
  }

  recordEvent(evt: Omit<GitHubEventEntity, 'id' | 'receivedAt'>): GitHubEventEntity {
    const id = crypto.randomUUID();
    const entity: GitHubEventEntity = {
      ...evt,
      id,
      receivedAt: new Date()
    };
    this.events.set(id, entity);
    return entity;
  }
}

export const db = new MemoryStore();

