import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    windowsHide: true
  });
  return stdout.trim();
}

interface GitSyncState {
  repoName: string;
  branch: string;
  trackingBranch: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  status: string;
  isSafeToPull: boolean;
  message: string;
}

async function inspectWorkspace(workspacePath: string): Promise<GitSyncState | null> {
  try {
    const gitDir = path.join(workspacePath, '.git');
    if (!fs.existsSync(gitDir)) return null;

    let branch = 'main';
    try {
      branch = await runGit(workspacePath, ['symbolic-ref', '--short', 'HEAD']);
    } catch {
      branch = await runGit(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    }

    let repoName = path.basename(workspacePath);
    try {
      const remoteUrl = await runGit(workspacePath, ['config', '--get', 'remote.origin.url']);
      const match = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/i);
      if (match) repoName = match[1];
    } catch {}

    let trackingBranch: string | null = null;
    let hasUpstream = true;
    try {
      trackingBranch = await runGit(workspacePath, ['rev-parse', '--abbrev-ref', '@{u}']);
    } catch {
      hasUpstream = false;
    }

    let ahead = 0;
    let behind = 0;
    if (hasUpstream) {
      try {
        const counts = await runGit(workspacePath, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
        const parts = counts.split(/\s+/);
        ahead = parseInt(parts[0], 10) || 0;
        behind = parseInt(parts[1], 10) || 0;
      } catch {}
    }

    let isClean = true;
    try {
      const statusOutput = await runGit(workspacePath, ['status', '--porcelain=v1']);
      if (statusOutput.length > 0) isClean = false;
    } catch {}

    let status = 'UP_TO_DATE';
    let isSafeToPull = false;
    let message = 'Branch is up to date.';

    if (!isClean) {
      status = 'DIRTY';
      isSafeToPull = false;
      message = 'Working tree has uncommitted modifications. Stash or commit before pulling.';
    } else if (ahead > 0 && behind > 0) {
      status = 'DIVERGED';
      isSafeToPull = false;
      message = `Branch diverged (${ahead} ahead, ${behind} behind). Manual review needed.`;
    } else if (behind > 0) {
      status = 'BEHIND';
      isSafeToPull = true;
      message = `Local branch is ${behind} commit(s) behind remote. Safe to pull.`;
    } else if (ahead > 0) {
      status = 'AHEAD';
      isSafeToPull = false;
      message = `Local branch is ${ahead} commit(s) ahead of remote. Ready to push.`;
    }

    return {
      repoName,
      branch,
      trackingBranch,
      ahead,
      behind,
      isClean,
      status,
      isSafeToPull,
      message
    };
  } catch {
    return null;
  }
}

class SyncPullTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private currentState: GitSyncState | null = null;

  public readonly updateState = (state: GitSyncState | null): void => {
    this.currentState = state;
    this._onDidChangeTreeData.fire();
  };

  public readonly getTreeItem = (element: vscode.TreeItem): vscode.TreeItem => {
    return element;
  };

  public readonly getChildren = async (): Promise<vscode.TreeItem[]> => {
    if (!this.currentState) {
      const item = new vscode.TreeItem('No Git repository detected in workspace');
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }

    const s = this.currentState;
    const repoItem = new vscode.TreeItem(`Repository: ${s.repoName}`);
    repoItem.description = s.branch;
    repoItem.iconPath = new vscode.ThemeIcon('repo');

    const statusItem = new vscode.TreeItem(`Status: ${s.status}`);
    statusItem.description = s.isSafeToPull ? 'Safe to Pull' : 'Pull Blocked';
    statusItem.iconPath = new vscode.ThemeIcon(
      s.isSafeToPull ? 'pass' : s.isClean ? 'cloud-download' : 'alert'
    );

    const behindItem = new vscode.TreeItem(`Commits Behind: ${s.behind} | Ahead: ${s.ahead}`);
    behindItem.iconPath = new vscode.ThemeIcon('git-commit');

    const treeItem = new vscode.TreeItem(`Working Tree: ${s.isClean ? 'Clean' : 'Dirty (Uncommitted)'}`);
    treeItem.iconPath = new vscode.ThemeIcon(s.isClean ? 'check' : 'edit');

    const recItem = new vscode.TreeItem(`Recommendation: ${s.message}`);
    recItem.tooltip = s.message;
    recItem.iconPath = new vscode.ThemeIcon('lightbulb');

    return [repoItem, statusItem, behindItem, treeItem, recItem];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'syncpull.status';
  context.subscriptions.push(statusBarItem);

  const treeDataProvider = new SyncPullTreeDataProvider();
  vscode.window.registerTreeDataProvider('syncpull.statusView', treeDataProvider);

  async function refreshSyncState() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      statusBarItem.hide();
      treeDataProvider.updateState(null);
      return;
    }

    const syncState = await inspectWorkspace(folders[0].uri.fsPath);
    if (!syncState) {
      statusBarItem.hide();
      treeDataProvider.updateState(null);
      return;
    }

    treeDataProvider.updateState(syncState);

    // Update Status Bar
    if (syncState.behind > 0) {
      if (syncState.isSafeToPull) {
        statusBarItem.text = `$(cloud-download) SyncPull: ${syncState.branch} (${syncState.behind} behind - Safe)`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.text = `$(alert) SyncPull: ${syncState.branch} (${syncState.behind} behind - Dirty)`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      }
    } else if (syncState.status === 'UP_TO_DATE') {
      statusBarItem.text = `$(check) SyncPull: ${syncState.branch} (In Sync)`;
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = `$(sync) SyncPull: ${syncState.branch} (${syncState.status})`;
      statusBarItem.backgroundColor = undefined;
    }

    statusBarItem.tooltip = `${syncState.repoName} [${syncState.branch}]\n${syncState.message}`;
    statusBarItem.show();
  }

  const handleStatus = async () => {
    await refreshSyncState();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    const state = await inspectWorkspace(folders[0].uri.fsPath);
    if (!state) return;

    const items = [
      { label: `$(repo) ${state.repoName} (${state.branch})`, description: state.status },
      { label: `$(git-commit) Ahead: ${state.ahead} | Behind: ${state.behind}` },
      { label: `$(lightbulb) ${state.message}` }
    ];

    if (state.isSafeToPull) {
      items.push({ label: `$(cloud-download) Safe to Pull: Click to git pull --ff-only` });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'SyncPull — Synchronization Status'
    });

    if (selected?.label.includes('Safe to Pull')) {
      const term = vscode.window.createTerminal('SyncPull');
      term.show();
      term.sendText('git pull --ff-only');
    }
  };

  const handleFetch = async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    try {
      await runGit(folders[0].uri.fsPath, ['fetch', '--quiet']);
      vscode.window.showInformationMessage('⚡ SyncPull: Remote tracking fetched successfully.');
      await refreshSyncState();
    } catch (err: any) {
      vscode.window.showErrorMessage(`SyncPull fetch failed: ${err.message}`);
    }
  };

  const handleMorningReport = async () => {
    await refreshSyncState();
    vscode.commands.executeCommand('syncpull.status');
  };

  // Register commands (both syncpull and legacy gitpulse aliases)
  context.subscriptions.push(
    vscode.commands.registerCommand('syncpull.status', handleStatus),
    vscode.commands.registerCommand('gitpulse.status', handleStatus),
    vscode.commands.registerCommand('syncpull.fetch', handleFetch),
    vscode.commands.registerCommand('gitpulse.fetch', handleFetch),
    vscode.commands.registerCommand('syncpull.morningReport', handleMorningReport),
    vscode.commands.registerCommand('gitpulse.morningReport', handleMorningReport)
  );

  // Poll workspace every 30 seconds
  const interval = setInterval(refreshSyncState, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // Refresh on editor/file save
  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/*');
  watcher.onDidChange(refreshSyncState);
  context.subscriptions.push(watcher);

  // Initial inspection
  refreshSyncState();
}

export function deactivate() {}
