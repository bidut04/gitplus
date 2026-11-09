import { AgentConfigManager } from './config/agentConfig';
import { discoverRepositories } from './scanner/workspaceScanner';
import { inspectGitRepository } from './git/statusAnalyzer';
import { safeFetch } from './git/fetcher';
import { BackendClient } from './client/backendClient';

export class AgentDaemon {
  private isRunning: boolean = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private configManager: AgentConfigManager = new AgentConfigManager()
  ) { }

  async runSingleCycle(): Promise<{ scannedCount: number; errors: string[] }> {
    const config = this.configManager.loadConfig();
    const errors: string[] = [];

    if (!config.installationId) {
      errors.push('Agent is not paired. Run `gitpulse-agent register` first.');
      return { scannedCount: 0, errors };
    }

    const client = new BackendClient({
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
  }

  start(intervalMs?: number) {
    if (this.isRunning) return;
    this.isRunning = true;

    const interval = intervalMs || this.configManager.loadConfig().scanIntervalSeconds * 1000;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.runSingleCycle();
      } catch (err: any) {
        console.error('Agent daemon cycle encountered error:', err.message);
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(loop, interval);
        }
      }
    };

    loop();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}

