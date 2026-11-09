import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/index';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

describe('Multi-Device Synchronization Edge Cases (Section 6.4 / T-DEV-*)', () => {
  let app: any;
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    const serverInstance = createApp('test-secret', store);
    app = serverInstance.app;
  });

  it('T-DEV-001: tracks desktop and laptop independently for the same user', async () => {
    const userId = 'user-developer-1';

    // 1. Register Desktop
    const desktopRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId, deviceName: 'Workstation Desktop' });
    const { installationId: desktopId, token: desktopToken } = desktopRes.body;

    // 2. Register Laptop
    const laptopRes = await request(app)
      .post('/api/v1/installations/register')
      .send({ userId, deviceName: 'Travel Laptop' });
    const { installationId: laptopId, token: laptopToken } = laptopRes.body;

    expect(desktopId).not.toBe(laptopId);

    // 3. Desktop clone is UP_TO_DATE (ahead=0, behind=0, clean)
    await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${desktopToken}`)
      .send({
        installationId: desktopId,
        localIdentifier: 'hash-desktop-backend',
        repoFullName: 'org/fleet-backend',
        remoteUrl: 'git@github.com:org/fleet-backend.git',
        currentBranch: 'dev',
        trackingBranch: 'origin/dev',
        aheadCount: 0,
        behindCount: 0,
        workingTreeClean: true,
        syncStatus: SyncStatus.UP_TO_DATE,
        recommendation: RecommendationAction.UP_TO_DATE,
        isSafeToPull: false
      });

    // 4. Laptop clone is BEHIND by 8 commits
    await request(app)
      .post('/api/v1/local-repositories/sync')
      .set('Authorization', `Bearer ${laptopToken}`)
      .send({
        installationId: laptopId,
        localIdentifier: 'hash-laptop-backend',
        repoFullName: 'org/fleet-backend',
        remoteUrl: 'git@github.com:org/fleet-backend.git',
        currentBranch: 'dev',
        trackingBranch: 'origin/dev',
        aheadCount: 0,
        behindCount: 8,
        workingTreeClean: true,
        syncStatus: SyncStatus.BEHIND,
        recommendation: RecommendationAction.SAFE_PULL,
        isSafeToPull: true
      });

    // 5. Query morning sync report
    const reportRes = await request(app)
      .get(`/api/v1/reports/morning-sync?userId=${userId}`);

    expect(reportRes.status).toBe(200);
    const report = reportRes.body;
    expect(report.totalMonitored).toBe(2);
    expect(report.upToDateCount).toBe(1);
    expect(report.outdatedCount).toBe(1);

    const desktopRepo = report.repositories.find((r: any) => r.behind === 0);
    const laptopRepo = report.repositories.find((r: any) => r.behind === 8);

    expect(desktopRepo.status).toBe(SyncStatus.UP_TO_DATE);
    expect(laptopRepo.status).toBe(SyncStatus.BEHIND);
    expect(laptopRepo.isSafeToPull).toBe(true);
  });
});

