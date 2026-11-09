import fs from 'node:fs';
import path from 'node:path';

export interface DiscoveredRepository {
  path: string;
  name: string;
  hasGit: boolean;
}

/**
 * Scans explicitly configured workspace folders for Git repositories up to a fixed depth limit (default 2).
 * Invariant: Never scan entire filesystem root without permission; stop recursion at .git folders.
 */
export function discoverRepositories(folders: string[], maxDepth: number = 2): DiscoveredRepository[] {
  const discovered: DiscoveredRepository[] = [];
  const visited = new Set<string>();

  function searchDirectory(currentDir: string, currentDepth: number) {
    if (currentDepth > maxDepth || visited.has(currentDir)) return;
    visited.add(currentDir);

    try {
      const gitPath = path.join(currentDir, '.git');
      if (fs.existsSync(gitPath)) {
        discovered.push({
          path: currentDir,
          name: path.basename(currentDir),
          hasGit: true
        });
        return; // Do not recurse into nested directories of an existing Git repo (submodules handled separately)
      }

      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        // SEC-06 Fix: Guard against symlink traversal and directory loops
        if (
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          searchDirectory(path.join(currentDir, entry.name), currentDepth + 1);
        }
      }
    } catch {
      // Gracefully skip unreadable directories
    }
  }

  for (const folder of folders) {
    if (fs.existsSync(folder)) {
      searchDirectory(path.resolve(folder), 0);
    }
  }

  return discovered;
}

