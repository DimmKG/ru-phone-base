import { describe, it, expect } from 'vitest';
import { diffAllocations } from '../../src/build/diff/diffAllocations.js';
import type { DecodedAllocation } from '../../src/build/diff/decodeTable.js';

function alloc(overrides: Partial<DecodedAllocation>): DecodedAllocation {
  return {
    type: 'fixed',
    code: '495',
    from: 100,
    to: 199,
    operator: 'Operator A',
    inn: '1234567890',
    regions: ['moscow'],
    nationwide: false,
    timezone: 'Europe/Moscow',
    ...overrides,
  };
}

describe('diffAllocations', () => {
  it('reports no changes for identical lists', () => {
    const list = [alloc({})];
    const result = diffAllocations(list, list);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.timezoneChanged).toEqual([]);
    expect(result.countsByType.fixed.unchanged).toBe(1);
  });

  it('classifies a key only present in the new list as added', () => {
    const result = diffAllocations([], [alloc({})]);
    expect(result.added).toHaveLength(1);
    expect(result.countsByType.fixed.added).toBe(1);
  });

  it('classifies a key only present in the old list as removed', () => {
    const result = diffAllocations([alloc({})], []);
    expect(result.removed).toHaveLength(1);
    expect(result.countsByType.fixed.removed).toBe(1);
  });

  it('classifies a same-key operator change as changed data, not a timezone change', () => {
    const result = diffAllocations([alloc({ operator: 'Operator A' })], [alloc({ operator: 'Operator B' })]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].before.operator).toBe('Operator A');
    expect(result.changed[0].after.operator).toBe('Operator B');
    expect(result.timezoneChanged).toEqual([]);
    expect(result.countsByType.fixed.changedData).toBe(1);
  });

  it('classifies a same-key region change as changed data', () => {
    const result = diffAllocations([alloc({ regions: ['moscow'] })], [alloc({ regions: ['moscow-oblast'] })]);
    expect(result.changed).toHaveLength(1);
    expect(result.countsByType.fixed.changedData).toBe(1);
  });

  it('classifies a same-key, same-data timezone change separately from a data change', () => {
    const result = diffAllocations([alloc({ timezone: 'Europe/Moscow' })], [alloc({ timezone: 'Europe/Kaliningrad' })]);
    expect(result.changed).toEqual([]);
    expect(result.timezoneChanged).toHaveLength(1);
    expect(result.timezoneChanged[0]).toMatchObject({
      timezoneBefore: 'Europe/Moscow',
      timezoneAfter: 'Europe/Kaliningrad',
    });
    expect(result.countsByType.fixed.changedTimezone).toBe(1);
  });

  it('keeps a fixed and a mobile allocation with the same code/range as two independent entries', () => {
    const oldList = [
      alloc({ type: 'fixed', operator: 'Operator A' }),
      alloc({ type: 'mobile', operator: 'Operator A' }),
    ];
    const newList = [
      alloc({ type: 'fixed', operator: 'Operator B' }),
      alloc({ type: 'mobile', operator: 'Operator A' }),
    ];
    const result = diffAllocations(oldList, newList);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].type).toBe('fixed');
    expect(result.countsByType.mobile.unchanged).toBe(1);
  });

  it('documents the known boundary-merge limitation: a merge from an unrelated data change reports as remove+add, not a single change', () => {
    // Old: two adjacent sub-ranges with different operators, kept separate.
    // New: the second sub-range's operator changed to match the first, so
    // buildRangeIndex merges them into one wider block. Block-level (post-merge)
    // diffing can't see "only the second half changed" - it sees a completely
    // different key set. This is the accepted v1 simplification (see
    // diffAllocations.ts's doc comment).
    const oldList = [
      alloc({ from: 100, to: 199, operator: 'Operator A' }),
      alloc({ from: 200, to: 299, operator: 'Operator B' }),
    ];
    const newList = [alloc({ from: 100, to: 299, operator: 'Operator A' })];
    const result = diffAllocations(oldList, newList);
    expect(result.removed).toHaveLength(2);
    expect(result.added).toHaveLength(1);
    expect(result.changed).toEqual([]);
  });
});
