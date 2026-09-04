import { describe, it, expect } from 'vitest';
import {
  classifyChange,
  summarizeChangeCategories,
  computeOperatorCapacityMovers,
  diffDiscrepancyEntries,
} from '../../tools/deepDiffAnalysis.js';
import type { AllocationChange, AllocationPayload } from '../../src/build/diff/diffAllocations.js';
import type { DecodedAllocation } from '../../src/build/diff/decodeTable.js';

function payload(overrides: Partial<AllocationPayload> = {}): AllocationPayload {
  return {
    operator: 'ООО "Ромашка"',
    inn: '1111111111',
    regions: ['moscow'],
    nationwide: false,
    ...overrides,
  };
}

function change(before: Partial<AllocationPayload>, after: Partial<AllocationPayload>): AllocationChange {
  return { type: 'fixed', code: '495', from: 100, to: 199, before: payload(before), after: payload(after) };
}

function alloc(overrides: Partial<DecodedAllocation> = {}): DecodedAllocation {
  return {
    type: 'fixed',
    code: '495',
    from: 100,
    to: 199,
    operator: 'ООО "Ромашка"',
    inn: '1111111111',
    regions: ['moscow'],
    nationwide: false,
    ...overrides,
  };
}

describe('classifyChange', () => {
  it('classifies an INN change as inn-change regardless of other fields', () => {
    expect(classifyChange(change({ inn: '1111111111' }, { inn: '2222222222' }))).toBe('inn-change');
  });

  it('classifies a region-set change (same INN) as region-change', () => {
    expect(classifyChange(change({ regions: ['moscow'] }, { regions: ['moscow-oblast'] }))).toBe('region-change');
  });

  it('treats a differently-ordered but same-content region set as unchanged (not region-change)', () => {
    expect(
      classifyChange(change({ regions: ['moscow', 'moscow-oblast'] }, { regions: ['moscow-oblast', 'moscow'] })),
    ).not.toBe('region-change');
  });

  it('classifies a pure operator-name case change as case-only', () => {
    expect(classifyChange(change({ operator: 'ооо "ромашка"' }, { operator: 'ООО "РОМАШКА"' }))).toBe('case-only');
  });

  it('classifies a genuine rename (not just case) as name-change', () => {
    expect(classifyChange(change({ operator: 'ООО "Ромашка"' }, { operator: 'ООО "Василёк"' }))).toBe('name-change');
  });

  it('classifies a settlement wording change with an unchanged operator name as settlement-wording', () => {
    expect(classifyChange(change({ settlement: 'г. Екатеринбург' }, { settlement: 'г.о. город Екатеринбург' }))).toBe(
      'settlement-wording',
    );
  });

  it('classifies a combined case-only + settlement wording change as case-and-settlement', () => {
    expect(
      classifyChange(
        change(
          { operator: 'ооо "ромашка"', settlement: 'г. Екатеринбург' },
          { operator: 'ООО "РОМАШКА"', settlement: 'г.о. город Екатеринбург' },
        ),
      ),
    ).toBe('case-and-settlement');
  });

  it('classifies a combined genuine rename + settlement wording change as name-and-settlement', () => {
    expect(
      classifyChange(
        change(
          { operator: 'ООО "Ромашка"', settlement: 'г. Екатеринбург' },
          { operator: 'ООО "Василёк"', settlement: 'г.о. город Екатеринбург' },
        ),
      ),
    ).toBe('name-and-settlement');
  });
});

describe('summarizeChangeCategories', () => {
  it('buckets changes by category and keeps counts in sync with byCategory', () => {
    const changed = [
      change({ inn: '1' }, { inn: '2' }),
      change({ operator: 'ооо "а"' }, { operator: 'ООО "А"' }),
      change({ operator: 'ооо "а"' }, { operator: 'ООО "А"' }),
    ];
    const summary = summarizeChangeCategories(changed);
    expect(summary.total).toBe(3);
    expect(summary.counts['inn-change']).toBe(1);
    expect(summary.counts['case-only']).toBe(2);
    expect(summary.byCategory['case-only']).toHaveLength(2);
  });
});

describe('computeOperatorCapacityMovers', () => {
  it('nets a fragmented-but-same-operator block to zero, isolating a real transfer', () => {
    // Old: one big block for operator A. New: A's block got fragmented into many
    // tiny sub-ranges (still A) plus a few numbers that moved to operator B -
    // exactly the block-merge-boundary scenario diffAllocations can't see cleanly.
    const oldAllocs = [alloc({ from: 100, to: 199, inn: 'A', operator: 'Operator A' })];
    const newAllocs = [
      alloc({ from: 100, to: 149, inn: 'A', operator: 'Operator A' }),
      alloc({ from: 150, to: 189, inn: 'A', operator: 'Operator A' }),
      alloc({ from: 190, to: 199, inn: 'B', operator: 'Operator B' }),
    ];
    const movers = computeOperatorCapacityMovers(oldAllocs, newAllocs);
    expect(movers).toHaveLength(2);
    const a = movers.find((m) => m.inn === 'A')!;
    const b = movers.find((m) => m.inn === 'B')!;
    expect(a.net).toBe(-10);
    expect(b.net).toBe(10);
  });

  it('reports a brand-new operator with percentChange null', () => {
    const movers = computeOperatorCapacityMovers([], [alloc({ inn: 'NEW', operator: 'New Co' })]);
    expect(movers).toHaveLength(1);
    expect(movers[0]).toMatchObject({
      inn: 'NEW',
      capacityBefore: 0,
      capacityAfter: 100,
      net: 100,
      percentChange: null,
    });
  });

  it('omits operators with zero net change', () => {
    const same = [alloc({})];
    expect(computeOperatorCapacityMovers(same, same)).toEqual([]);
  });

  it('sorts by |net| descending', () => {
    const oldAllocs = [alloc({ inn: 'small', from: 0, to: 9 }), alloc({ inn: 'big', from: 100, to: 999 })];
    const movers = computeOperatorCapacityMovers(oldAllocs, []);
    expect(movers.map((m) => m.inn)).toEqual(['big', 'small']);
  });
});

describe('diffDiscrepancyEntries', () => {
  it('classifies an entry only in the old list as resolved', () => {
    const result = diffDiscrepancyEntries([{ kind: 'duplicate-inn', inn: '1' }], []);
    expect(result.resolved).toEqual([{ kind: 'duplicate-inn', inn: '1' }]);
    expect(result.appeared).toEqual([]);
  });

  it('classifies an entry only in the new list as appeared', () => {
    const result = diffDiscrepancyEntries([], [{ kind: 'gar-region-mismatch', code: '495' }]);
    expect(result.appeared).toEqual([{ kind: 'gar-region-mismatch', code: '495' }]);
    expect(result.resolved).toEqual([]);
  });

  it('ignores key order when matching entries as unchanged', () => {
    const result = diffDiscrepancyEntries([{ kind: 'duplicate-inn', inn: '1' }], [{ inn: '1', kind: 'duplicate-inn' }]);
    expect(result.resolved).toEqual([]);
    expect(result.appeared).toEqual([]);
  });
});
