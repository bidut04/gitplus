import { LocalRepoSyncPayload } from '@gitpulse/shared';
import { LocalGitInspectionReport } from '../git/statusAnalyzer';

export interface BackendClientConfig {
  backendUrl: string;
  installationId: string;
  token?: string;
}

export class BackendClient {
  constructor(private config: BackendClientConfig) { }

  async sendHeartbeat(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.backendUrl}/api/v1/installations/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {})
        },
        body: JSON.stringify({ installationId: this.config.installationId })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async reportSyncStatus(report: LocalGitInspectionReport): Promise<boolean> {
    const payload: LocalRepoSyncPayload = {
      installationId: this.config.installationId,
      localIdentifier: report.localIdentifier,
      repoFullName: report.repoFullName,
      remoteUrl: report.remoteUrl,
      currentBranch: report.currentBranch,
      trackingBranch: report.trackingBranch,
      aheadCount: report.aheadCount,
      behindCount: report.behindCount,
      workingTreeClean: report.workingTreeClean,
      isMerging: report.isMerging,
      isRebasing: report.isRebasing,
      isDetached: report.isDetached,
      hasConflicts: report.hasConflicts,
      syncStatus: report.evaluation.status,
      recommendation: report.evaluation.action,
      isSafeToPull: report.evaluation.isSafeToPull
    };

    try {
      const res = await fetch(`${this.config.backendUrl}/api/v1/local-repositories/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

