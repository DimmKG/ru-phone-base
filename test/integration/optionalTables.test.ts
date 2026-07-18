import { describe, it, expect } from 'vitest';
import {
  createRuPhoneBase,
  createRuPhoneBaseFromData,
  DatasetOperatorsError,
  assertOperatorsCoverTables,
} from '../../src/index.js';
import { loadDataset } from '../../src/dataLoader.js';

describe('optional lookup tables', () => {
  const full = createRuPhoneBase();
  const mobileOnly = createRuPhoneBase({ include: ['mobile'] });
  const fixedOnly = createRuPhoneBase({ include: ['fixed'] });

  it('mobile-only instance resolves mobile numbers', () => {
    const number = '+79161234567';
    const result = mobileOnly.lookupPhoneNumber(number);
    const expected = full.lookupPhoneNumber(number);

    expect(result.valid).toBe(true);
    if (!result.valid || !expected.valid) throw new Error('unreachable');
    expect(result.data.type).toBe('mobile');
    expect(result.data.operator).toBe(expected.data.operator);
  });

  it('mobile-only instance rejects fixed numbers as unassigned', () => {
    const result = mobileOnly.lookupPhoneNumber('+74951234567');
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('unreachable');
    expect(result.reason).toBe('unassigned');
  });

  it('fixed-only instance rejects mobile numbers as unassigned', () => {
    const result = fixedOnly.lookupPhoneNumber('+79161234567');
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('unreachable');
    expect(result.reason).toBe('unassigned');
  });

  it('createRuPhoneBaseFromData works with a mobile-only dataset', () => {
    const dataset = loadDataset({ include: ['mobile'] });
    expect(dataset.fixed).toBeUndefined();
    expect(dataset.mobile).toBeDefined();

    const instance = createRuPhoneBaseFromData(dataset);
    expect(instance.lookupPhoneNumber('+79161234567').valid).toBe(true);
  });

  it('mobile-only load uses the mobile operators mini-base', () => {
    const fullDs = loadDataset();
    const mobileOnlyDs = loadDataset({ include: ['mobile'] });
    const fixedOnlyDs = loadDataset({ include: ['fixed'] });

    expect(Object.keys(mobileOnlyDs.operators).length).toBeLessThan(Object.keys(fullDs.operators).length);
    expect(Object.keys(fixedOnlyDs.operators).length).toBeLessThan(Object.keys(fullDs.operators).length);
    expect(Object.keys(mobileOnlyDs.operators).length).toBeLessThan(100);
    expect(Object.keys(fixedOnlyDs.operators).length).toBeGreaterThan(500);

    for (const inn of mobileOnlyDs.mobile!.o) {
      expect(mobileOnlyDs.operators[inn]).toBeDefined();
    }
    for (const inn of fixedOnlyDs.fixed!.o) {
      expect(fixedOnlyDs.operators[inn]).toBeDefined();
    }
  });

  it('throws when operators-mobile is paired with the fixed table', () => {
    const mobile = loadDataset({ include: ['mobile'] });
    const fixed = loadDataset({ include: ['fixed'] });
    const mismatched = { ...fixed, operators: mobile.operators };

    expect(() => assertOperatorsCoverTables(mismatched)).toThrow(DatasetOperatorsError);
    expect(() => createRuPhoneBaseFromData(mismatched)).toThrow(/wrong operators mini-base/);
  });

  it('throws when operators-fixed is paired with the mobile table', () => {
    const mobile = loadDataset({ include: ['mobile'] });
    const fixed = loadDataset({ include: ['fixed'] });
    const mismatched = { ...mobile, operators: fixed.operators };

    expect(() => createRuPhoneBaseFromData(mismatched)).toThrow(DatasetOperatorsError);
  });
});
