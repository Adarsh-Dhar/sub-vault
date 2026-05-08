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
});
