import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  evaluateSyncRecommendation,
  SyncEvaluationResult,
  SyncStatus,
  RecommendationAction
} from '@gitpulse/shared';

const execFileAsync = promisify(execFile);

export interface LocalGitInspectionReport {
  repoPath: string;
  localIdentifier: string;
  remoteUrl: string;
  repoFullName: string;
  currentBranch: string;
  trackingBranch: string | null;
  aheadCount: number;
  behindCount: number;
  workingTreeClean: boolean;
  isMerging: boolean;
  isRebasing: boolean;
  isDetached: boolean;
  hasConflicts: boolean;
  modifiedFiles: string[];
  evaluation: SyncEvaluationResult;
}

export async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    windowsHide: true
  });
  return stdout.trim();
}

/**
 * Generates an anonymized hash of device + local path for privacy.
 * Invariant: Never transmit raw absolute disk paths to remote servers.
 */
export function generateLocalIdentifier(repoPath: string): string {
  const normalized = path.resolve(repoPath).toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Safely inspects the local Git repository without altering the working tree, index, or refs.
 */
export async function inspectGitRepository(repoPath: string): Promise<LocalGitInspectionReport> {
  const localIdentifier = generateLocalIdentifier(repoPath);

  // 1. Detect active branch & detached HEAD (handles unborn/empty repositories safely)
  let currentBranch = 'HEAD';
  let isDetached = false;
  try {
    // symbolic-ref safely returns branch name even on brand new repos with zero commits
    currentBranch = await runGit(repoPath, ['symbolic-ref', '--short', 'HEAD']);
  } catch {
    try {
      currentBranch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (currentBranch === 'HEAD') {
        isDetached = true;
      }
    } catch {
      currentBranch = 'main';
      isDetached = false;
    }
  }

  // 2. Detect remote URL and fullName
  let remoteUrl = '';
  let repoFullName = path.basename(repoPath);
  try {
    remoteUrl = await runGit(repoPath, ['config', '--get', 'remote.origin.url']);
    const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/i);
    if (match) {
      repoFullName = match[1];
    }
  } catch { }

  // 3. Detect upstream tracking branch
  let trackingBranch: string | null = null;
  let hasUpstream = true;
  try {
    trackingBranch = await runGit(repoPath, ['rev-parse', '--abbrev-ref', '@{u}']);
  } catch {
    hasUpstream = false;
  }

  // 4. In-progress operation checks via filesystem indicators
  const gitDir = path.join(repoPath, '.git');
  const isMerging = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
  const isRebasing =
    fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
    fs.existsSync(path.join(gitDir, 'rebase-apply'));

  // 5. Working tree status check
  let workingTreeClean = true;
  let hasConflicts = false;
  const modifiedFiles: string[] = [];
  try {
    const statusOutput = await runGit(repoPath, ['status', '--porcelain=v1']);
    if (statusOutput.length > 0) {
      workingTreeClean = false;
      const lines = statusOutput.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('UU') || line.startsWith('AA')) {
          hasConflicts = true;
        }
        const filePath = line.substring(3).trim();
        if (filePath) {
          modifiedFiles.push(filePath);
        }
      }
    }
  } catch { }

  // 6. Ahead / Behind calculation
  let aheadCount = 0;
  let behindCount = 0;
  if (hasUpstream && !isDetached) {
    try {
      const counts = await runGit(repoPath, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      const parts = counts.split(/\s+/);
      aheadCount = parseInt(parts[0], 10) || 0;
      behindCount = parseInt(parts[1], 10) || 0;
    } catch { }
  }

  // 7. Evaluate safe sync recommendation using shared state machine
  const evaluation = evaluateSyncRecommendation({
    ahead: aheadCount,
    behind: behindCount,
    isDirty: !workingTreeClean,
    isMerging,
    isRebasing,
    isDetached,
    hasConflicts,
    hasUpstream
  });

  return {
    repoPath,
    localIdentifier,
    remoteUrl,
    repoFullName,
    currentBranch,
    trackingBranch,
    aheadCount,
    behindCount,
    workingTreeClean,
    isMerging,
    isRebasing,
    isDetached,
    hasConflicts,
    modifiedFiles,
    evaluation
  };
}

