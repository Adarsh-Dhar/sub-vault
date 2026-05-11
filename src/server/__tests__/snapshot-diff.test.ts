import { describe, expect, it } from 'vitest';
import { computeSnapshotDiff } from '../../shared/snapshot-diff';

describe('computeSnapshotDiff', () => {
  it('keeps community settings changes visible when appearance changes are also present', () => {
    const target = {
      settings: {
        primaryColor: '#000000',
        title: 'SubVault',
        isPostingRestricted: false,
      },
    } as any;

    const live = {
      settings: {
        primaryColor: '#B300FF',
        title: 'SubVault',
        isPostingRestricted: true,
      },
    } as any;

    const diffs = computeSnapshotDiff(target, live);

    expect(diffs.some(diff => diff.section === 'Appearance / Theme')).toBe(true);
    const settingsDiff = diffs.find(diff => diff.section === 'Community Settings');
    expect(settingsDiff).toBeDefined();
    expect(settingsDiff?.lines.some(line => line.text.includes('isPostingRestricted'))).toBe(true);
  });
});