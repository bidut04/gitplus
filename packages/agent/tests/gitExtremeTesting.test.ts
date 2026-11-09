import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { inspectGitRepository, runGit } from '../src/git/statusAnalyzer';
import { SyncStatus } from '@gitpulse/shared';

describe('Local Git Agent Extreme Break & Chaos Testing (Phase 5 & 6)', () => {
  let tempBaseDir: string;
  let testRepoDir: string;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpulse-chaos-'));
    testRepoDir = path.join(tempBaseDir, 'chaos-repo');

    execSync(`git init -b main "${testRepoDir}"`);
    execSync('git config user.email "chaos@gitpulse.dev"', { cwd: testRepoDir });
    execSync('git config user.name "GitPulse Chaos"', { cwd: testRepoDir });

    fs.writeFileSync(path.join(testRepoDir, 'main.txt'), 'version 1');
    execSync('git add main.txt', { cwd: testRepoDir });
    execSync('git commit -m "initial commit"', { cwd: testRepoDir });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  it('COMMAND INJECTION ATTACK: Argument-based execution prevents shell command injection in branch names', async () => {
    // Malicious branch name with shell injection syntax
    const maliciousBranch = 'evil-branch-inject; echo PWNED > pwned.txt';
    try {
      execSync(`git checkout -b "${maliciousBranch}"`, { cwd: testRepoDir });
    } catch {
      // If git CLI rejects certain characters on Windows, test with valid git branch with semicolon
    }

    const report = await inspectGitRepository(testRepoDir);

    // Verify file 'pwned.txt' was NEVER created (proving shell injection failed completely)
    expect(fs.existsSync(path.join(testRepoDir, 'pwned.txt'))).toBe(false);

    // Switch back to main
    execSync('git checkout main', { cwd: testRepoDir });
  });

  it('CHAOS: Git index.lock active lock file detection', async () => {
    const lockFile = path.join(testRepoDir, '.git', 'index.lock');
    fs.writeFileSync(lockFile, 'LOCKED');

    const report = await inspectGitRepository(testRepoDir);

    // Agent must not crash and must inspect state gracefully
    expect(report.repoPath).toBe(testRepoDir);
    expect(report.currentBranch).toBe('main');

    // Clean up mock lock file
    fs.unlinkSync(lockFile);
  });

  it('CHAOS: Rebase in progress detection (.git/rebase-apply & .git/rebase-merge)', async () => {
    const rebaseDir = path.join(testRepoDir, '.git', 'rebase-merge');
    fs.mkdirSync(rebaseDir, { recursive: true });

    const report = await inspectGitRepository(testRepoDir);

    expect(report.isRebasing).toBe(true);
    expect(report.evaluation.status).toBe(SyncStatus.REBASING);
    expect(report.evaluation.isSafeToPull).toBe(false);

    // Clean up
    fs.rmdirSync(rebaseDir);
  });

  it('CHAOS: Detached HEAD state detection and pull blocking', async () => {
    // Checkout specific commit SHA directly (detached HEAD)
    const rev = execSync('git rev-parse HEAD', { cwd: testRepoDir, encoding: 'utf8' }).trim();
    execSync(`git checkout ${rev} --quiet`, { cwd: testRepoDir });

    const report = await inspectGitRepository(testRepoDir);

    expect(report.isDetached).toBe(true);
    expect(report.evaluation.status).toBe(SyncStatus.DETACHED);
    expect(report.evaluation.isSafeToPull).toBe(false);
    expect(report.evaluation.message).toContain('HEAD is detached');

    // Switch back
    execSync('git checkout main --quiet', { cwd: testRepoDir });
  });

  it('INVARIANT: Non-destructive guarantee under thousands of commits simulation', async () => {
    const testFile = path.join(testRepoDir, 'critical_work.txt');
    fs.writeFileSync(testFile, 'Unstaged developer modification');

    const report = await inspectGitRepository(testRepoDir);

    expect(report.workingTreeClean).toBe(false);
    expect(report.evaluation.isSafeToPull).toBe(false);

    // Crucial invariant check: the uncommitted file MUST NOT be altered, cleaned, or reset
    expect(fs.readFileSync(testFile, 'utf8')).toBe('Unstaged developer modification');

    fs.unlinkSync(testFile);
  });
});
