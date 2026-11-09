import { z } from 'zod';
import { SyncStatus, RecommendationAction } from '../state-machine/syncStateMachine';

export const PrioritySchema = z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'MUTED']);
export type Priority = z.infer<typeof PrioritySchema>;

export const NotificationTypeSchema = z.enum([
  'NEW_COMMITS_AVAILABLE',
  'BRANCH_UPDATED',
  'FORCE_PUSH_DETECTED',
  'BRANCH_DELETED',
  'BRANCH_RENAMED',
  'LOCAL_BRANCH_BEHIND',
  'LOCAL_BRANCH_DIVERGED',
  'SAFE_TO_SYNC',
  'POTENTIAL_CONFLICT'
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const PushCommitSchema = z.object({
  id: z.string(),
  message: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string().optional(),
    username: z.string().optional()
  }),
  timestamp: z.string().optional(),
  added: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
  modified: z.array(z.string()).default([])
});
export type PushCommit = z.infer<typeof PushCommitSchema>;

export const GitHubPushEventSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  forced: z.boolean().default(false),
  deleted: z.boolean().default(false),
  created: z.boolean().default(false),
  compare: z.string().optional(),
  commits: z.array(PushCommitSchema).default([]),
  head_commit: PushCommitSchema.nullable().optional(),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    full_name: z.string(),
    private: z.boolean(),
    default_branch: z.string().default('main'),
    owner: z.object({
      login: z.string(),
      id: z.number().optional()
    })
  }),
  sender: z.object({
    login: z.string(),
    id: z.number().optional(),
    avatar_url: z.string().optional()
  })
});
export type GitHubPushEvent = z.infer<typeof GitHubPushEventSchema>;

export const AgentRegistrationRequestSchema = z.object({
  deviceName: z.string().min(1),
  userId: z.string().min(1)
});
export type AgentRegistrationRequest = z.infer<typeof AgentRegistrationRequestSchema>;

export const LocalRepoSyncPayloadSchema = z.object({
  installationId: z.string(),
  localIdentifier: z.string(),
  repoFullName: z.string(),
  remoteUrl: z.string(),
  currentBranch: z.string(),
  trackingBranch: z.string().nullable().optional(),
  aheadCount: z.number().default(0),
  behindCount: z.number().default(0),
  workingTreeClean: z.boolean().default(true),
  isMerging: z.boolean().default(false),
  isRebasing: z.boolean().default(false),
  isDetached: z.boolean().default(false),
  hasConflicts: z.boolean().default(false),
  syncStatus: z.nativeEnum(SyncStatus),
  recommendation: z.nativeEnum(RecommendationAction),
  isSafeToPull: z.boolean()
});
export type LocalRepoSyncPayload = z.infer<typeof LocalRepoSyncPayloadSchema>;

export const NotificationRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repositoryId: z.string(),
  repoFullName: z.string(),
  branchName: z.string(),
  notificationType: NotificationTypeSchema,
  priority: PrioritySchema,
  title: z.string(),
  message: z.string(),
  isRead: z.boolean().default(false),
  createdAt: z.string(),
  metadata: z.record(z.any()).optional()
});
export type NotificationRecord = z.infer<typeof NotificationRecordSchema>;

