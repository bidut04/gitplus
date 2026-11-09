import { describe, it, expect } from 'vitest';
import { getSyncBadgeStyle, getActionCTA } from '../src/presentation';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';

describe('Extension UI Presentation Logic', () => {
  it('displays emerald badge for UP_TO_DATE', () => {
    const badge = getSyncBadgeStyle(SyncStatus.UP_TO_DATE);
    expect(badge.label).toBe('Up to Date');
    expect(badge.textClass).toContain('text-emerald-400');
  });

  it('displays amber badge for BEHIND', () => {
    const badge = getSyncBadgeStyle(SyncStatus.BEHIND);
    expect(badge.label).toBe('Behind Remote');
    expect(badge.textClass).toContain('text-amber-400');
  });

  it('enables Pull CTA only when isSafeToPull is true', () => {
    const safeCta = getActionCTA(RecommendationAction.SAFE_PULL, true);
    expect(safeCta.isEnabled).toBe(true);
    expect(safeCta.buttonText).toBe('Pull Changes');

    const dirtyCta = getActionCTA(RecommendationAction.INSPECT_LOCAL_CHANGES, false);
    expect(dirtyCta.isEnabled).toBe(false);
    expect(dirtyCta.buttonText).toContain('Stash / Commit');
  });
});

