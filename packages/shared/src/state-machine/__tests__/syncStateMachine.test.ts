import { describe, it, expect } from 'vitest';
import {
  evaluateSyncRecommendation,
  SyncStatus,
  RecommendationAction
} from '../syncStateMachine';

describe('GitPulse Sync State Machine & Decision Engine', () => {
  it('identifies UP_TO_DATE when ahead=0, behind=0 and clean', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 0,
      isDirty: false,
      isMerging: false,
      isRebasing: false,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.UP_TO_DATE);
    expect(res.action).toBe(RecommendationAction.UP_TO_DATE);
    expect(res.isSafeToPull).toBe(false);
  });

  it('permits SAFE_PULL when clean and behind', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 5,
      isDirty: false,
      isMerging: false,
      isRebasing: false,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.BEHIND);
    expect(res.action).toBe(RecommendationAction.SAFE_PULL);
    expect(res.isSafeToPull).toBe(true);
  });

  it('strictly forbids automated pull when dirty and behind', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 5,
      isDirty: true,
      isMerging: false,
      isRebasing: false,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.DIRTY);
    expect(res.action).toBe(RecommendationAction.INSPECT_LOCAL_CHANGES);
    expect(res.isSafeToPull).toBe(false);
  });

  it('identifies DIVERGED when both ahead and behind exist and tree is clean', () => {
    const res = evaluateSyncRecommendation({
      ahead: 2,
      behind: 3,
      isDirty: false,
      isMerging: false,
      isRebasing: false,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.DIVERGED);
    expect(res.action).toBe(RecommendationAction.REVIEW_DIVERGENCE);
    expect(res.isSafeToPull).toBe(false);
  });

  it('blocks sync on active merge', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 2,
      isDirty: true,
      isMerging: true,
      isRebasing: false,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.MERGING);
    expect(res.action).toBe(RecommendationAction.RESOLVE_MERGE);
    expect(res.isSafeToPull).toBe(false);
  });

  it('blocks sync on active rebase', () => {
    const res = evaluateSyncRecommendation({
      ahead: 1,
      behind: 0,
      isDirty: true,
      isMerging: false,
      isRebasing: true,
      isDetached: false
    });
    expect(res.status).toBe(SyncStatus.REBASING);
    expect(res.action).toBe(RecommendationAction.RESOLVE_REBASE);
    expect(res.isSafeToPull).toBe(false);
  });

  it('blocks sync when HEAD is detached', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 0,
      isDirty: false,
      isMerging: false,
      isRebasing: false,
      isDetached: true
    });
    expect(res.status).toBe(SyncStatus.DETACHED);
    expect(res.action).toBe(RecommendationAction.CHECKOUT_BRANCH);
    expect(res.isSafeToPull).toBe(false);
  });

  it('requests upstream configuration when upstream is missing', () => {
    const res = evaluateSyncRecommendation({
      ahead: 0,
      behind: 0,
      isDirty: false,
      isMerging: false,
      isRebasing: false,
      isDetached: false,
      hasUpstream: false
    });
    expect(res.status).toBe(SyncStatus.UNKNOWN);
    expect(res.action).toBe(RecommendationAction.CONFIGURE_UPSTREAM);
    expect(res.isSafeToPull).toBe(false);
  });
});

