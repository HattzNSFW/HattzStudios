import { describe, expect, it } from 'vitest';
import { HATTZ_APPS, SYSTEM_VERSION, createLocalId, isNonEmptyString } from './index';

describe('shared-utils foundation', () => {
  it('exposes the three Hättz apps', () => {
    expect(HATTZ_APPS).toEqual(['share', 'studio', 'control']);
  });

  it('has a foundation system version', () => {
    expect(SYSTEM_VERSION).toBe('0.1.0-foundation');
  });

  it('validates non-empty strings', () => {
    expect(isNonEmptyString('hattz')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('creates prefixed local ids', () => {
    const id = createLocalId('draft');
    expect(id.startsWith('draft_')).toBe(true);
  });
});
