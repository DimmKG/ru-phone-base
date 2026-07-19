import { describe, it, expect } from 'vitest';
import { lookupPhoneNumber, getRegions, initRuPhoneBase } from '../../src/index.js';

// These tests share the module-level default instance and must run in order:
// the first use is what proves lazy default-options init works; only after
// that do we reconfigure it via initRuPhoneBase and prove the override sticks.
describe('module-level default instance', () => {
  it('lazily initializes with default options (both tables) on first use', () => {
    const regions = getRegions();
    expect(regions.length).toBeGreaterThan(80);
    expect(lookupPhoneNumber('+74951234567').valid).toBe(true); // fixed-line
    expect(lookupPhoneNumber('+79161234567').valid).toBe(true); // mobile
  });

  it('initRuPhoneBase reconfigures the default instance for subsequent module-level calls', () => {
    initRuPhoneBase({ include: ['mobile'] });

    expect(lookupPhoneNumber('+79161234567').valid).toBe(true); // mobile still works

    const fixedResult = lookupPhoneNumber('+74951234567');
    expect(fixedResult.valid).toBe(false);
    expect(fixedResult).toMatchObject({ reason: 'unassigned' }); // fixed table no longer loaded
  });
});
