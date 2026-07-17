import { describe, it, expect } from 'vitest';
import { buildRangeIndex, findBlock, type FlatEntry } from '../../src/build/compile/buildRangeIndex.js';

function entry(overrides: Partial<FlatEntry>): FlatEntry {
  return {
    code: '495',
    from: 1000,
    to: 1099,
    operator: 'Operator A',
    inn: '1234567890',
    regions: ['moscow'],
    sourceFile: 'ABC-4xx',
    ...overrides,
  };
}

describe('buildRangeIndex', () => {
  it('merges adjacent ranges with identical operator+region into one block', () => {
    const table = buildRangeIndex([entry({ from: 100, to: 199 }), entry({ from: 200, to: 299 })]);
    expect(table.c['495']).toEqual([[100, 299, 0, 0]]);
  });

  it('does not merge across a gap between ranges', () => {
    const table = buildRangeIndex([entry({ from: 100, to: 199 }), entry({ from: 300, to: 399 })]);
    expect(table.c['495']).toHaveLength(2);
    expect(table.c['495'][0].slice(0, 2)).toEqual([100, 199]);
    expect(table.c['495'][1].slice(0, 2)).toEqual([300, 399]);
  });

  it('does not merge adjacent ranges with different operators', () => {
    const table = buildRangeIndex([
      entry({ from: 100, to: 199, operator: 'Operator A' }),
      entry({ from: 200, to: 299, operator: 'Operator B' }),
    ]);
    expect(table.c['495']).toHaveLength(2);
  });

  it('keeps the first allocation when the exact same range has competing entries', () => {
    const table = buildRangeIndex([
      entry({ from: 100, to: 199, operator: 'Operator A', regions: ['altai-krai'] }),
      entry({ from: 100, to: 199, operator: 'Operator B', regions: ['irkutsk-oblast'] }),
    ]);
    expect(table.c['495']).toEqual([[100, 199, 0, 0]]);
    expect(table.o[0][0]).toBe('Operator A');
    expect(table.r[0]).toEqual(['altai-krai']);
  });

  it('deduplicates operator and region-set string tables', () => {
    const table = buildRangeIndex([entry({ from: 100, to: 199 }), entry({ from: 300, to: 399 })]);
    expect(table.o).toHaveLength(1);
    expect(table.r).toHaveLength(1);
  });

  it('carries settlement through when present, omitting it from the tuple when absent', () => {
    const table = buildRangeIndex([entry({ from: 100, to: 199, settlement: 'г. Москва' })]);
    expect(table.p).toEqual(['г. Москва']);
    expect(table.c['495'][0]).toEqual([100, 199, 0, 0, 0]);
  });

  it('omits the settlement slot entirely when there is none', () => {
    const table = buildRangeIndex([entry({ from: 100, to: 199, settlement: undefined })]);
    expect(table.c['495'][0]).toEqual([100, 199, 0, 0]);
    expect(table.c['495'][0]).toHaveLength(4);
  });

  describe('findBlock (binary search)', () => {
    const blocks = buildRangeIndex([
      entry({ from: 100, to: 199 }),
      entry({ from: 200, to: 299 }),
      entry({ from: 1000, to: 1000 }),
    ]).c['495'];

    it('finds the block at a range boundary', () => {
      expect(findBlock(blocks, 100)?.slice(0, 2)).toEqual([100, 299]);
      expect(findBlock(blocks, 299)?.slice(0, 2)).toEqual([100, 299]);
    });

    it('finds a single-number block', () => {
      expect(findBlock(blocks, 1000)?.slice(0, 2)).toEqual([1000, 1000]);
    });

    it('returns undefined for a number in a gap', () => {
      expect(findBlock(blocks, 500)).toBeUndefined();
      expect(findBlock(blocks, 0)).toBeUndefined();
      expect(findBlock(blocks, 9999999)).toBeUndefined();
    });
  });
});
