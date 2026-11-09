export enum SyncStatus {
  UP_TO_DATE = 'UP_TO_DATE',
  BEHIND = 'BEHIND',
  AHEAD = 'AHEAD',
  DIVERGED = 'DIVERGED',
  DIRTY = 'DIRTY',
  MERGING = 'MERGING',
  REBASING = 'REBASING',
  DETACHED = 'DETACHED',
  CONFLICTED = 'CONFLICTED',
  UNKNOWN = 'UNKNOWN',
  OFFLINE = 'OFFLINE'
}

export enum RecommendationAction {
  UP_TO_DATE = 'UP_TO_DATE',
  SAFE_PULL = 'SAFE_PULL',
  READY_TO_PUSH = 'READY_TO_PUSH',
  INSPECT_LOCAL_CHANGES = 'INSPECT_LOCAL_CHANGES',
  REVIEW_DIVERGENCE = 'REVIEW_DIVERGENCE',
  RESOLVE_MERGE = 'RESOLVE_MERGE',
  RESOLVE_REBASE = 'RESOLVE_REBASE',
  CHECKOUT_BRANCH = 'CHECKOUT_BRANCH',
  RESOLVE_CONFLICTS = 'RESOLVE_CONFLICTS',
  CONFIGURE_UPSTREAM = 'CONFIGURE_UPSTREAM'
}

export interface SyncInspectionInput {
  ahead: number;
  behind: number;
  isDirty: boolean;
  isMerging: boolean;
  isRebasing: boolean;
  isDetached: boolean;
  hasConflicts?: boolean;
  hasUpstream?: boolean;
}

export interface SyncEvaluationResult {
  status: SyncStatus;
  action: RecommendationAction;
  isSafeToPull: boolean;
  message: string;
}

/**
 * Evaluates the synchronization state and determines safe user recommendations.
 * INVARIANT: Never recommends automated pulling if working tree is dirty, diverged, or in mid-operation.
 */
export function evaluateSyncRecommendation(input: SyncInspectionInput): SyncEvaluationResult {
  const {
    ahead,
    behind,
    isDirty,
    isMerging,
    isRebasing,
    isDetached,
    hasConflicts = false,
    hasUpstream = true
  } = input;

  // 1. In-progress Git state checks (highest priority blocks)
  if (isDetached) {
    return {
      status: SyncStatus.DETACHED,
      action: RecommendationAction.CHECKOUT_BRANCH,
      isSafeToPull: false,
      message: 'HEAD is detached. Checkout a named branch before synchronizing.'
    };
  }

  if (isMerging) {
    return {
      status: SyncStatus.MERGING,
      action: RecommendationAction.RESOLVE_MERGE,
      isSafeToPull: false,
      message: 'Active merge in progress. Resolve conflicts or finish the merge before pulling.'
    };
  }

  if (isRebasing) {
    return {
      status: SyncStatus.REBASING,
      action: RecommendationAction.RESOLVE_REBASE,
      isSafeToPull: false,
      message: 'Active rebase in progress. Finish or abort rebase before syncing.'
    };
  }

  if (hasConflicts) {
    return {
      status: SyncStatus.CONFLICTED,
      action: RecommendationAction.RESOLVE_CONFLICTS,
      isSafeToPull: false,
      message: 'Unresolved conflicts detected in working tree.'
    };
  }

  if (!hasUpstream) {
    return {
      status: SyncStatus.UNKNOWN,
      action: RecommendationAction.CONFIGURE_UPSTREAM,
      isSafeToPull: false,
      message: 'No upstream tracking branch configured for current branch.'
    };
  }

  // 2. Working Tree Dirty Condition
  if (isDirty) {
    if (behind > 0 && ahead > 0) {
      return {
        status: SyncStatus.DIRTY,
        action: RecommendationAction.INSPECT_LOCAL_CHANGES,
        isSafeToPull: false,
        message: `Working tree has modifications, and branch has diverged (${ahead} ahead, ${behind} behind). Stash or commit before reviewing divergence.`
      };
    }
    if (behind > 0) {
      return {
        status: SyncStatus.DIRTY,
        action: RecommendationAction.INSPECT_LOCAL_CHANGES,
        isSafeToPull: false,
        message: `Branch is ${behind} commits behind remote, but you have uncommitted changes. Stash or commit before synchronizing.`
      };
    }
    return {
      status: SyncStatus.DIRTY,
      action: RecommendationAction.INSPECT_LOCAL_CHANGES,
      isSafeToPull: false,
      message: 'Working tree contains uncommitted changes.'
    };
  }

  // 3. Clean Working Tree State Calculations
  if (ahead > 0 && behind > 0) {
    return {
      status: SyncStatus.DIVERGED,
      action: RecommendationAction.REVIEW_DIVERGENCE,
      isSafeToPull: false,
      message: `Branch diverged: ${ahead} local commits ahead, ${behind} remote commits behind. Manual rebase or merge recommended.`
    };
  }

  if (behind > 0 && ahead === 0) {
    return {
      status: SyncStatus.BEHIND,
      action: RecommendationAction.SAFE_PULL,
      isSafeToPull: true,
      message: `Working tree clean. Local branch is ${behind} commits behind remote. Safe to pull.`
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      status: SyncStatus.AHEAD,
      action: RecommendationAction.READY_TO_PUSH,
      isSafeToPull: false,
      message: `Local branch is ${ahead} commits ahead of remote. Ready to push.`
    };
  }

  return {
    status: SyncStatus.UP_TO_DATE,
    action: RecommendationAction.UP_TO_DATE,
    isSafeToPull: false,
    message: 'Branch is up to date with remote.'
  };
}

