import { LocalRepoSyncPayload } from '@gitpulse/shared';
import { LocalGitInspectionReport } from '../git/statusAnalyzer';

export interface BackendClientConfig {
  backendUrl: string;
  installationId: string;
  token?: string;
}

export interface IBackendClient {
  sendHeartbeat: () => Promise<boolean>;
  reportSyncStatus: (report: LocalGitInspectionReport) => Promise<boolean>;
}

export const createBackendClient = (config: BackendClientConfig): IBackendClient => {
  const sendHeartbeat = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${config.backendUrl}/api/v1/installations/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
        },
        body: JSON.stringify({ installationId: config.installationId })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const reportSyncStatus = async (report: LocalGitInspectionReport): Promise<boolean> => {
    const payload: LocalRepoSyncPayload = {
      installationId: config.installationId,
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
      isSafeToPull: report.evaluation.isSafeToPull,
      modifiedFiles: report.modifiedFiles
    };

    try {
      const res = await fetch(`${config.backendUrl}/api/v1/local-repositories/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  return {
    sendHeartbeat,
    reportSyncStatus
  };
};

export type BackendClient = IBackendClient;

export const BackendClient = function (this: any, config: BackendClientConfig) {
  return createBackendClient(config);
} as unknown as {
  new (config: BackendClientConfig): BackendClient;
  (config: BackendClientConfig): BackendClient;
};
