import crypto from 'node:crypto';
import { MemoryStore, GitHubEventEntity } from '../store/index';
import { NotificationService } from './notificationService';
import { ICacheService, defaultCache } from '../redis/redisClient';

export class WebhookService {
  constructor(
    private store: MemoryStore,
    private notifService: NotificationService,
    private webhookSecret: string = process.env.GITHUB_WEBHOOK_SECRET || 'test-secret',
    private cache: ICacheService = defaultCache
  ) { }

  /**
   * Verifies the GitHub HMAC SHA-256 signature in constant-time to avoid timing attacks.
   */
  verifySignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }
    const signature = signatureHeader.substring('sha256='.length);
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  }

  /**
   * Processes an incoming GitHub webhook with strict deduplication by deliveryId.
   */
  async handlePushEvent(
    deliveryId: string,
    payload: any
  ): Promise<{ status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED'; event?: GitHubEventEntity }> {
    // 1. Distributed Redis / Cache Deduplication (7-day TTL)
    const dedupKey = `gitpulse:dedup:${deliveryId}`;
    const isNew = await this.cache.setNxWithTtl(dedupKey, '1', 604800); // 7 days
    if (!isNew) {
      const existing = this.store.findEventByDeliveryId(deliveryId);
      return { status: 'DUPLICATE', event: existing };
    }

    // Secondary in-store check
    const existing = this.store.findEventByDeliveryId(deliveryId);
    if (existing) {
      return { status: 'DUPLICATE', event: existing };
    }

    const repoPayload = payload.repository;
    if (!repoPayload) {
      return { status: 'IGNORED' };
    }

    // 2. Ensure repository is recorded
    const repo = this.store.upsertRepository({
      githubRepositoryId: String(repoPayload.id),
      name: repoPayload.name,
      fullName: repoPayload.full_name,
      defaultBranch: repoPayload.default_branch,
      isPrivate: repoPayload.private
    });

    const branchName = payload.ref ? payload.ref.replace('refs/heads/', '') : 'unknown';
    const isForced = Boolean(payload.forced);
    const isDeleted = Boolean(payload.deleted) || payload.after === '0000000000000000000000000000000000000000';
    const actorUsername = payload.sender?.login;

    // 3. Durably record event
    const event = this.store.recordEvent({
      deliveryId,
      eventType: 'push',
      repositoryId: repo.id,
      branchName,
      actorUsername,
      beforeSha: payload.before,
      afterSha: payload.after,
      isForced,
      payload,
      processingStatus: 'PROCESSED',
      processedAt: new Date()
    });

    // 4. Dispatch notifications through Notification Intelligence
    await this.notifService.processPushNotifications({
      event,
      repository: repo,
      branchName,
      actorUsername,
      commits: payload.commits || [],
      isForced,
      isDeleted
    });

    return { status: 'PROCESSED', event };
  }
}

