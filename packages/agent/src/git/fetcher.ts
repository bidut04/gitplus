import { runGit } from './statusAnalyzer';

export interface FetchResult {
  success: boolean;
  message: string;
}

/**
 * Safely fetches remote updates without touching the working tree.
 * Invariant: git fetch != git pull. Fetch modifies only remote tracking references.
 */
export async function safeFetch(repoPath: string, remote: string = 'origin'): Promise<FetchResult> {
  try {
    const output = await runGit(repoPath, ['fetch', remote, '--quiet']);
    return {
      success: true,
      message: output || 'Fetch completed successfully'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to fetch from remote'
    };
  }
}

