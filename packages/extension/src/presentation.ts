import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

export interface BadgeStyle {
  label: string;
  bgClass: string;
  textClass: string;
}

export function getSyncBadgeStyle(status: SyncStatus): BadgeStyle {
  switch (status) {
    case SyncStatus.UP_TO_DATE:
      return { label: 'Up to Date', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-400' };
    case SyncStatus.BEHIND:
      return { label: 'Behind Remote', bgClass: 'bg-amber-500/10', textClass: 'text-amber-400' };
    case SyncStatus.AHEAD:
      return { label: 'Ahead of Remote', bgClass: 'bg-blue-500/10', textClass: 'text-blue-400' };
    case SyncStatus.DIVERGED:
      return { label: 'Diverged History', bgClass: 'bg-purple-500/10', textClass: 'text-purple-400' };
    case SyncStatus.DIRTY:
      return { label: 'Uncommitted Changes', bgClass: 'bg-orange-500/10', textClass: 'text-orange-400' };
    case SyncStatus.MERGING:
    case SyncStatus.REBASING:
    case SyncStatus.CONFLICTED:
      return { label: 'Operation In Progress', bgClass: 'bg-rose-500/10', textClass: 'text-rose-400' };
    default:
      return { label: 'Unknown', bgClass: 'bg-zinc-500/10', textClass: 'text-zinc-400' };
  }
}

export function getActionCTA(action: RecommendationAction, isSafeToPull: boolean): {
  buttonText: string;
  isEnabled: boolean;
  tooltip: string;
} {
  if (isSafeToPull) {
    return {
      buttonText: 'Pull Changes',
      isEnabled: true,
      tooltip: 'Working tree is clean. Safe to integrate remote commits.'
    };
  }

  switch (action) {
    case RecommendationAction.INSPECT_LOCAL_CHANGES:
      return {
        buttonText: 'Stash / Commit First',
        isEnabled: false,
        tooltip: 'You have uncommitted modifications. Stash or commit before pulling.'
      };
    case RecommendationAction.REVIEW_DIVERGENCE:
      return {
        buttonText: 'Manual Rebase Needed',
        isEnabled: false,
        tooltip: 'History has diverged on both sides. Review commits before integrating.'
      };
    default:
      return {
        buttonText: 'Synchronized',
        isEnabled: false,
        tooltip: 'No pull action required.'
      };
  }
}

