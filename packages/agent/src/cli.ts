#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { inspectGitRepository } from './git/statusAnalyzer';
import { safeFetch } from './git/fetcher';
import { AgentConfigManager } from './config/agentConfig';
import { discoverRepositories } from './scanner/workspaceScanner';
import { AgentDaemon } from './daemon';

const program = new Command();
const configManager = new AgentConfigManager();

program
  .name('gitpulse-agent')
  .description('GitPulse Local Git Agent — Safe Synchronization Intelligence')
  .version('1.0.0');

program
  .command('register')
  .description('Pair this local agent with your GitPulse backend account')
  .requiredOption('-u, --url <url>', 'Backend API URL', 'http://localhost:4000')
  .requiredOption('-i, --installation-id <id>', 'Installation ID')
  .option('-t, --token <token>', 'Authentication Token')
  .action((opts) => {
    configManager.saveConfig({
      backendUrl: opts.url,
      installationId: opts.installationId,
      token: opts.token
    });
    console.log(`✅ Agent paired successfully! Installation ID: ${opts.installationId}`);
  });

program
  .command('add <folderPath>')
  .description('Add a folder to monitor for Git repositories')
  .action((folderPath) => {
    const list = configManager.addMonitoredFolder(folderPath);
    console.log(`📁 Added ${path.resolve(folderPath)} to monitored folders.`);
    console.log('Currently monitored folders:', list);
  });

program
  .command('list')
  .description('List all discovered Git repositories in monitored folders')
  .action(() => {
    const config = configManager.loadConfig();
    const repos = discoverRepositories(config.monitoredFolders);
    console.log(`Found ${repos.length} repository(s):`);
    repos.forEach((r) => console.log(` - ${r.name} (${r.path})`));
  });

program
  .command('status [path]')
  .description('Inspect repository sync state without modifying local work')
  .action(async (targetPath = process.cwd()) => {
    try {
      const report = await inspectGitRepository(targetPath);
      console.log('--- GitPulse Local Status Report ---');
      console.log(`Repository:     ${report.repoFullName}`);
      console.log(`Branch:         ${report.currentBranch} (Tracking: ${report.trackingBranch || 'none'})`);
      console.log(`Working Tree:   ${report.workingTreeClean ? 'CLEAN' : 'DIRTY (Uncommitted changes)'}`);
      console.log(`Ahead / Behind: Ahead: ${report.aheadCount} | Behind: ${report.behindCount}`);
      console.log(`Sync Status:    ${report.evaluation.status}`);
      console.log(`Safe to Pull?   ${report.evaluation.isSafeToPull ? 'YES' : 'NO'}`);
      console.log(`Recommendation: ${report.evaluation.message}`);
    } catch (err: any) {
      console.error('Inspection failed:', err.message);
      process.exit(1);
    }
  });

program
  .command('fetch [path]')
  .description('Perform a safe, non-destructive background fetch')
  .action(async (targetPath = process.cwd()) => {
    const res = await safeFetch(targetPath);
    console.log(res.message);
  });

program
  .command('daemon')
  .description('Run GitPulse background synchronization daemon')
  .action(() => {
    console.log('🚀 GitPulse Agent Daemon started...');
    const daemon = new AgentDaemon(configManager);
    daemon.start();

    process.on('SIGINT', () => {
      console.log('\nStopping daemon...');
      daemon.stop();
      process.exit(0);
    });
  });

program.parse(process.argv);
