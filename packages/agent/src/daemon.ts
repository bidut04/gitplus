import { AgentConfigManager, createAgentConfigManager } from './config/agentConfig';
import { discoverRepositories } from './scanner/workspaceScanner';
import { inspectGitRepository } from './git/statusAnalyzer';
import { safeFetch } from './git/fetcher';
import { createBackendClient } from './client/backendClient';

export interface IAgentDaemon {
  runSingleCycle: () => Promise<{ scannedCount: number; errors: string[] }>;
  start: (intervalMs?: number) => void;
  stop: () => void;
}

export const createAgentDaemon = (
  configManager: AgentConfigManager = createAgentConfigManager()
): IAgentDaemon => {
  let isRunning = false;
  let timer: NodeJS.Timeout | undefined;

  const runSingleCycle = async (): Promise<{ scannedCount: number; errors: string[] }> => {
    const config = configManager.loadConfig();
    const errors: string[] = [];

    if (!config.installationId) {
      errors.push('Agent is not paired. Run `gitpulse-agent register` first.');
      return { scannedCount: 0, errors };
    }

    const client = createBackendClient({
      backendUrl: config.backendUrl,
      installationId: config.installationId,
      token: config.token
    });

    // 1. Send heartbeat
    await client.sendHeartbeat();

    // 2. Discover local Git repositories
    const repos = discoverRepositories(config.monitoredFolders);
    let scannedCount = 0;

    for (const repo of repos) {
      try {
        // Optional non-destructive fetch
        if (config.autoFetchEnabled) {
          await safeFetch(repo.path);
        }

        // Safe inspection
        const report = await inspectGitRepository(repo.path);
        await client.reportSyncStatus(report);
        scannedCount++;
      } catch (err: any) {
        errors.push(`Failed inspecting ${repo.path}: ${err.message}`);
      }
    }

    return { scannedCount, errors };
  };

  const start = (intervalMs?: number): void => {
    if (isRunning) return;
    isRunning = true;

    const interval = intervalMs || configManager.loadConfig().scanIntervalSeconds * 1000;

    const loop = async () => {
      if (!isRunning) return;
      try {
        await runSingleCycle();
      } catch (err: any) {
        console.error('Agent daemon cycle encountered error:', err.message);
      } finally {
        if (isRunning) {
          timer = setTimeout(loop, interval);
        }
      }
    };

    loop();
  };

  const stop = (): void => {
    isRunning = false;
    if (timer) {
      clearTimeout(timer);
    }
  };

  return {
    runSingleCycle,
    start,
    stop
  };
};

export type AgentDaemon = IAgentDaemon;

export const AgentDaemon = function (
  this: any,
  configManager: AgentConfigManager = createAgentConfigManager()
) {
  return createAgentDaemon(configManager);
} as unknown as {
  new (configManager?: AgentConfigManager): AgentDaemon;
  (configManager?: AgentConfigManager): AgentDaemon;
};
