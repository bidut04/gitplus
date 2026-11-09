import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { inspectGitRepository, generateLocalIdentifier } from '../src/git/statusAnalyzer';
import { SyncStatus } from '@gitpulse/shared';

describe('Local Git Agent Status Analyzer (T-AGT-*)', () => {
  let tempDir: string;

  beforeAll(() => {
    // Create an isolated git repository in temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitpulse-test-repo-'));
    execSync('git init -b main', { cwd: tempDir });
    execSync('git config user.email "test@gitpulse.dev"', { cwd: tempDir });
    execSync('git config user.name "GitPulse Test"', { cwd: tempDir });

    // Initial commit
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Initial Commit');
    execSync('git add README.md', { cwd: tempDir });
    execSync('git commit -m "initial commit"', { cwd: tempDir });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { }
  });

  it('T-AGT-001: correctly detects branch name and clean working tree', async () => {
    const report = await inspectGitRepository(tempDir);
    expect(report.currentBranch).toBe('main');
    expect(report.workingTreeClean).toBe(true);
    expect(report.isMerging).toBe(false);
    expect(report.isRebasing).toBe(false);
    expect(report.isDetached).toBe(false);
  });

  it('T-AGT-002: detects dirty working tree when unstaged modifications exist', async () => {
    fs.writeFileSync(path.join(tempDir, 'newfile.txt'), 'uncommitted content');

    const report = await inspectGitRepository(tempDir);
    expect(report.workingTreeClean).toBe(false);
    expect(report.evaluation.isSafeToPull).toBe(false);

    // Clean up
    fs.unlinkSync(path.join(tempDir, 'newfile.txt'));
  });

  it('T-AGT-004: detects active merge when .git/MERGE_HEAD exists', async () => {
    const mergeHeadFile = path.join(tempDir, '.git', 'MERGE_HEAD');
    fs.writeFileSync(mergeHeadFile, '0000000000000000000000000000000000000000\n');

    const report = await inspectGitRepository(tempDir);
    expect(report.isMerging).toBe(true);
    expect(report.evaluation.status).toBe(SyncStatus.MERGING);
    expect(report.evaluation.isSafeToPull).toBe(false);

    // Clean up mock file
    fs.unlinkSync(mergeHeadFile);
  });

  it('T-AGT-008: verifies Non-destructive Invariant (no changes made to local files)', async () => {
    const testFile = path.join(tempDir, 'README.md');
    const contentBefore = fs.readFileSync(testFile, 'utf8');

    await inspectGitRepository(tempDir);

    const contentAfter = fs.readFileSync(testFile, 'utf8');
    expect(contentAfter).toBe(contentBefore);
  });

  it('generates consistent, anonymized local identifier', () => {
    const id1 = generateLocalIdentifier('C:\\Users\\Developer\\Project');
    const id2 = generateLocalIdentifier('c:\\users\\developer\\project');
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
    expect(id1).not.toContain('Users'); // Preserves privacy!
  });
});

