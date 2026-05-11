import { describe, it, expect } from 'vitest';
import { buildVerificationResult } from '../routes/snapshot';

describe('buildVerificationResult', () => {
  it('marks verification as failed when identity.description differs (string vs string)', () => {
    const target = {
      identity: { displayName: 'testAdarsh1', description: '1', publicDescription: '', lang: 'en' },
    } as any;
    const live = {
      identity: { displayName: 'testAdarsh1', description: '6', publicDescription: '', lang: 'en' },
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(false);
    expect(result.sections.some(s => s.section === 'Identity' && s.status === 'drifted')).toBe(true);
  });

  it('marks verification as failed when identity.description differs (object vs string)', () => {
    const target = {
      identity: { displayName: 'testAdarsh1', description: { markdown: '1' }, publicDescription: '', lang: 'en' },
    } as any;
    const live = {
      identity: { displayName: 'testAdarsh1', description: '6', publicDescription: '', lang: 'en' },
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(false);
    expect(result.sections.some(s => s.section === 'Identity' && s.status === 'drifted')).toBe(true);
  });

  it('marks appearance diffs as drifted', () => {
    const target = {
      settings: {
        keyColor: '#111111',
      },
    } as any;
    const live = {
      settings: {
        keyColor: '#222222',
      },
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(false);
    expect(result.sections.some(s => s.section === 'Appearance / Theme' && s.status === 'drifted')).toBe(true);
  });

  it('ignores non-restorable appearance fields during verification', () => {
    const target = {
      settings: {
        primaryColor: '#111111',
      },
    } as any;
    const live = {
      settings: {
        primaryColor: '#222222',
      },
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(true);
    expect(result.sections.some(s => s.section === 'Appearance / Theme' && s.status === 'drifted')).toBe(false);
  });

  it('skips AutoModerator verification when the target snapshot has no AutoMod config', () => {
    const target = {
      automoderator: 'Not configured',
      settings: {},
    } as any;
    const live = {
      automoderator: 'Some live AutoMod rules',
      settings: {},
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(true);
    expect(result.sections.some(s => s.section === 'AutoModerator' && s.status === 'skipped')).toBe(true);
    expect(result.notes.some(note => note.includes('verification skipped that section'))).toBe(true);
  });

  it('treats an empty AutoModerator snapshot as not configured', () => {
    const target = {
      automoderator: '',
      settings: {},
    } as any;
    const live = {
      automoderator: '',
      settings: {},
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(true);
    expect(result.sections.some(s => s.section === 'AutoModerator' && s.status === 'skipped')).toBe(true);
  });

  it('still marks configured AutoModerator drift as failed', () => {
    const target = {
      automoderator: 'type: submission\naction: remove',
      settings: {},
    } as any;
    const live = {
      automoderator: 'type: submission\naction: filter',
      settings: {},
    } as any;

    const result = buildVerificationResult(target, live);
    expect(result.verified).toBe(false);
    expect(result.sections.some(s => s.section === 'AutoModerator' && s.status === 'drifted')).toBe(true);
  });
});
