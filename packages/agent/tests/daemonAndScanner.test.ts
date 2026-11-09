import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverRepositories } from '../src/scanner/workspaceScanner';
import { AgentConfigManager } from '../src/config/agentConfig';

describe('Agent Workspace Scanner & Config Manager (Section 12.1)', () => {
  let tempBaseDir: string;
  let repo1Dir: string;
  let repo2Dir: string;
  let nonRepoDir: string;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpulse-workspace-'));
    repo1Dir = path.join(tempBaseDir, 'service-auth');
    repo2Dir = path.join(tempBaseDir, 'service-payment');
    nonRepoDir = path.join(tempBaseDir, 'docs-folder');

    fs.mkdirSync(repo1Dir, { recursive: true });
    fs.mkdirSync(path.join(repo1Dir, '.git'), { recursive: true });

    fs.mkdirSync(repo2Dir, { recursive: true });
    fs.mkdirSync(path.join(repo2Dir, '.git'), { recursive: true });

    fs.mkdirSync(nonRepoDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch { }
  });

  it('discovers only directories containing .git and ignores non-git folders', () => {
    const discovered = discoverRepositories([tempBaseDir]);
    expect(discovered).toHaveLength(2);

    const names = discovered.map(r => r.name);
    expect(names).toContain('service-auth');
    expect(names).toContain('service-payment');
    expect(names).not.toContain('docs-folder');
  });

  it('persists and retrieves agent configuration safely', () => {
    const configDir = path.join(tempBaseDir, '.gitpulse-config');
    const manager = new AgentConfigManager(configDir);

    manager.saveConfig({
      installationId: 'inst-1234',
      token: 'tok-abc',
      scanIntervalSeconds: 30
    });

    const loaded = manager.loadConfig();
    expect(loaded.installationId).toBe('inst-1234');
    expect(loaded.token).toBe('tok-abc');
    expect(loaded.scanIntervalSeconds).toBe(30);

    // Adding monitored folder
    manager.addMonitoredFolder(repo1Dir);
    const updated = manager.loadConfig();
    expect(updated.monitoredFolders).toHaveLength(1);
    expect(updated.monitoredFolders[0]).toBe(path.resolve(repo1Dir));
  });
});

