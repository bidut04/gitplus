import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { db } from './store/index';
import { NotificationService } from './services/notificationService';
import { WebhookService } from './services/webhookService';
import { LocalRepoSyncPayloadSchema } from '@gitpulse/shared';
import { ICacheService, defaultCache } from './redis/redisClient';
import { createSecurityMiddleware } from './middleware/security';

export function createApp(
  webhookSecret: string = 'test-secret',
  store = db,
  cache: ICacheService = defaultCache
) {
  const app = express();
  const notifService = new NotificationService(store, cache);
  const webhookService = new WebhookService(store, notifService, webhookSecret, cache);
  const security = createSecurityMiddleware(store, cache);

  // SEC-07: Security Headers & Explicit Body Size Limit
  app.use(security.helmetMiddleware);
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(cors());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      redisConnected: cache.isRedisConnected()
    });
  });

  // --- GitHub Webhook Ingress (Rate limited to 300 req/min) ---
  app.post('/api/v1/webhooks/github', security.rateLimiter(300, 60), async (req: any, res) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const deliveryId = (req.headers['x-github-delivery'] as string) || crypto.randomUUID();
    const eventType = req.headers['x-github-event'] as string;

    if (!webhookService.verifySignature(req.rawBody || JSON.stringify(req.body), signature)) {
      return res.status(401).json({ error: 'Invalid HMAC signature' });
    }

    if (eventType !== 'push') {
      return res.status(200).json({ status: 'IGNORED_EVENT_TYPE', eventType });
    }

    const result = await webhookService.handlePushEvent(deliveryId, req.body);
    return res.status(200).json(result);
  });

  // --- Agent & Installation Endpoints ---
  app.post('/api/v1/installations/register', security.rateLimiter(60, 60), (req, res) => {
    const { userId, deviceName } = req.body;
    if (!userId || !deviceName) {
      return res.status(400).json({ error: 'userId and deviceName are required' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const installation = {
      id: crypto.randomUUID(),
      userId,
      deviceName,
      installationTokenHash: tokenHash,
      lastHeartbeat: new Date(),
      status: 'ONLINE' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    store.installations.set(installation.id, installation);

    return res.status(201).json({
      installationId: installation.id,
      token,
      deviceName: installation.deviceName
    });
  });

  // SEC-01 Fix: Agent heartbeat verified via constant-time token check
  app.post('/api/v1/installations/heartbeat', security.verifyAgentAuth, (req, res) => {
    const { installationId } = req.body;
    const inst = store.installations.get(installationId);
    if (!inst) {
      return res.status(404).json({ error: 'Installation not found' });
    }
    inst.lastHeartbeat = new Date();
    inst.status = 'ONLINE';
    return res.json({ status: 'OK', lastHeartbeat: inst.lastHeartbeat });
  });

  // SEC-01 Fix: Local Repository Synchronization Telemetry protected by verifyAgentAuth
  app.post('/api/v1/local-repositories/sync', security.verifyAgentAuth, (req, res) => {
    const parsed = LocalRepoSyncPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid sync payload', details: parsed.error.issues });
    }

    const payload = parsed.data;
    const inst = store.installations.get(payload.installationId);
    if (!inst) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    // Ensure remote repository is linked
    const repo = store.upsertRepository({
      githubRepositoryId: payload.repoFullName,
      name: payload.repoFullName.split('/')[1] || payload.repoFullName,
      fullName: payload.repoFullName
    });

    const existingId = Array.from(store.localRepositories.entries()).find(
      ([_, lr]) =>
        lr.installationId === payload.installationId && lr.localIdentifier === payload.localIdentifier
    )?.[0];

    const localRepoEntity = {
      id: existingId || crypto.randomUUID(),
      installationId: payload.installationId,
      repositoryId: repo.id,
      remoteUrl: payload.remoteUrl,
      localIdentifier: payload.localIdentifier,
      currentBranch: payload.currentBranch,
      trackingBranch: payload.trackingBranch,
      syncStatus: payload.syncStatus,
      recommendation: payload.recommendation,
      aheadCount: payload.aheadCount,
      behindCount: payload.behindCount,
      workingTreeClean: payload.workingTreeClean,
      isSafeToPull: payload.isSafeToPull,
      lastScannedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    store.localRepositories.set(localRepoEntity.id, localRepoEntity);

    // Invalidate morning report cache for this user
    cache.del(`gitpulse:cache:morning:${inst.userId}`);

    return res.json({ status: 'SYNCED', localRepositoryId: localRepoEntity.id });
  });

  app.get('/api/v1/local-repositories', (_req, res) => {
    return res.json(Array.from(store.localRepositories.values()));
  });

  // Morning Synchronization Report endpoint with Redis/Cache caching (60s TTL)
  app.get('/api/v1/reports/morning-sync', async (req, res) => {
    const { userId } = req.query;
    const cacheKey = `gitpulse:cache:morning:${userId || 'all'}`;

    // Cache hit check
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // Find installations for this user
    const userInstallations = Array.from(store.installations.values())
      .filter(inst => !userId || inst.userId === userId)
      .map(inst => inst.id);

    const repos = Array.from(store.localRepositories.values())
      .filter(repo => userInstallations.includes(repo.installationId));

    const summary = {
      generatedAt: new Date().toISOString(),
      totalMonitored: repos.length,
      upToDateCount: repos.filter(r => r.syncStatus === 'UP_TO_DATE').length,
      outdatedCount: repos.filter(r => r.behindCount > 0).length,
      divergedCount: repos.filter(r => r.syncStatus === 'DIVERGED').length,
      dirtyCount: repos.filter(r => !r.workingTreeClean).length,
      repositories: repos.map(r => ({
        id: r.id,
        repository: r.repoFullName,
        branch: r.currentBranch,
        trackingBranch: r.trackingBranch,
        behind: r.behindCount,
        ahead: r.aheadCount,
        workingTreeClean: r.workingTreeClean,
        status: r.syncStatus,
        recommendation: r.recommendation,
        isSafeToPull: r.isSafeToPull
      }))
    };

    // Store in cache for 60 seconds
    await cache.set(cacheKey, JSON.stringify(summary), 60);

    return res.json(summary);
  });

  // --- Subscriptions & Repositories ---
  app.post('/api/v1/subscriptions', (req, res) => {
    const { userId, repositoryId, branchName, priority } = req.body;
    if (!userId || !repositoryId || !branchName) {
      return res.status(400).json({ error: 'userId, repositoryId, branchName required' });
    }

    // Fix Bug 1: Enforce uniqueness constraint [userId, repositoryId, branchName]
    const existing = Array.from(store.subscriptions.values()).find(
      s => s.userId === userId && s.repositoryId === repositoryId && s.branchName === branchName
    );

    if (existing) {
      existing.priority = priority || existing.priority;
      existing.notificationEnabled = true;
      existing.updatedAt = new Date();
      return res.status(200).json(existing);
    }

    const sub = {
      id: crypto.randomUUID(),
      userId,
      repositoryId,
      branchName,
      notificationEnabled: true,
      priority: priority || 'NORMAL',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    store.subscriptions.set(sub.id, sub);
    return res.status(201).json(sub);
  });

  app.get('/api/v1/repositories', (_req, res) => {
    return res.json(Array.from(store.repositories.values()));
  });

  // --- Notifications & SSE Stream ---
  app.get('/api/v1/notifications', (req, res) => {
    const { userId, unreadOnly } = req.query;
    let list = store.notifications;
    if (userId) {
      list = list.filter(n => n.userId === userId);
    }
    if (unreadOnly === 'true') {
      list = list.filter(n => !n.isRead);
    }
    return res.json(list);
  });

  app.patch('/api/v1/notifications/:id/read', (req, res) => {
    const notif = store.notifications.find(n => n.id === req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    notif.isRead = true;
    return res.json(notif);
  });

  app.patch('/api/v1/notifications/read-all', (req, res) => {
    const { userId } = req.body;
    store.notifications.forEach(n => {
      if (!userId || n.userId === userId) {
        n.isRead = true;
      }
    });
    return res.json({ status: 'ALL_READ' });
  });

  app.get('/api/v1/notifications/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Fix Bug 3: Periodic keepalive ping to prevent proxy/ALB 504 drops
    const pingTimer = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);
    if (pingTimer.unref) pingTimer.unref();

    const unsubscribe = notifService.subscribeSSE(notification => {
      res.write(`data: ${JSON.stringify(notification)}\n\n`);
    });

    req.on('close', () => {
      clearInterval(pingTimer);
      unsubscribe();
    });
  });

  return { app, store, notifService, webhookService };
}

