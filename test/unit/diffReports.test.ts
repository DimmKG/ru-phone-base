import { describe, it, expect } from 'vitest';
import { diffDiscrepancyCounts, diffUnmappedRegions } from '../../src/build/diff/diffReports.js';

describe('diffDiscrepancyCounts', () => {
  it('reports before/after/delta for a kind present in both lists with different counts', () => {
    const before = [{ kind: 'intra-file' }, { kind: 'intra-file' }];
    const after = [{ kind: 'intra-file' }];
    const result = diffDiscrepancyCounts(before, after);
    expect(result['intra-file']).toEqual({ before: 2, after: 1, delta: -1 });
  });

  it('reports after:0 for a kind that only existed before (fully resolved)', () => {
    const result = diffDiscrepancyCounts([{ kind: 'gar-region-mismatch' }], []);
    expect(result['gar-region-mismatch']).toEqual({ before: 1, after: 0, delta: -1 });
  });

  it('reports before:0 for a kind that only appears after (newly introduced)', () => {
    const result = diffDiscrepancyCounts([], [{ kind: 'parallel-allocation' }]);
    expect(result['parallel-allocation']).toEqual({ before: 0, after: 1, delta: 1 });
  });
});

describe('diffUnmappedRegions', () => {
  it('excludes tokens present in both lists from newlyUnmapped/newlyResolved', () => {
    const result = diffUnmappedRegions(['токен а'], ['токен а']);
    expect(result.newlyUnmapped).toEqual([]);
    expect(result.newlyResolved).toEqual([]);
  });

  it('classifies a token only in the new list as newly unmapped', () => {
    const result = diffUnmappedRegions([], ['новый токен']);
    expect(result.newlyUnmapped).toEqual(['новый токен']);
    expect(result.newlyResolved).toEqual([]);
  });

  it('classifies a token only in the old list as newly resolved', () => {
    const result = diffUnmappedRegions(['старый токен'], []);
    expect(result.newlyResolved).toEqual(['старый токен']);
    expect(result.newlyUnmapped).toEqual([]);
  });

  it('reports before/after counts matching input lengths', () => {
    const result = diffUnmappedRegions(['a', 'b'], ['b', 'c', 'd']);
    expect(result.before).toBe(2);
    expect(result.after).toBe(3);
  });
});
