import { describe, it, expect } from 'vitest';
import type { FlatEntry } from '../../src/build/compile/buildRangeIndex.js';
import { findIntraFileConflicts, collectRegionMismatches } from '../../src/build/compile/discrepancies.js';

function entry(overrides: Partial<FlatEntry>): FlatEntry {
  return {
    code: '495',
    from: 100,
    to: 199,
    operator: 'Operator A',
    inn: '1234567890',
    regions: ['moscow'],
    sourceFile: 'ABC-4xx',
    ...overrides,
  };
}

describe('findIntraFileConflicts', () => {
  it('does not flag two different ranges', () => {
    const conflicts = findIntraFileConflicts([entry({ from: 100, to: 199 }), entry({ from: 200, to: 299 })]);
    expect(conflicts).toEqual([]);
  });

  it('does not flag the same exact range allocated to different operators in different regions', () => {
    const conflicts = findIntraFileConflicts([
      entry({ operator: 'Operator A', regions: ['altai-krai'] }),
      entry({ operator: 'Operator B', regions: ['irkutsk-oblast'] }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('flags the same specific region claimed by two different operators at the same exact range', () => {
    const conflicts = findIntraFileConflicts([
      entry({ operator: 'Operator A', inn: '1111111111', regions: ['moscow'] }),
      entry({ operator: 'Operator B', inn: '2222222222', regions: ['moscow'] }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'intra-file', code: '495', from: 100, to: 199, region: 'moscow' });
    expect(conflicts[0].operators).toHaveLength(2);
  });

  it('does not flag a single entry', () => {
    expect(findIntraFileConflicts([entry({})])).toEqual([]);
  });
});

describe('collectRegionMismatches', () => {
  it('collects only entries flagged with a regionMismatch', () => {
    const mismatches = collectRegionMismatches([
      entry({ regionMismatch: { zoneToken: 'khanty-mansi-ao', placeToken: 'tyumen-oblast' } }),
      entry({}),
    ]);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      kind: 'gar-region-mismatch',
      garRegion: 'khanty-mansi-ao',
      regionColumnValue: 'tyumen-oblast',
    });
  });
});
