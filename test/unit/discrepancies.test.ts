import { describe, it, expect } from 'vitest';
import type { FlatEntry } from '../../src/build/compile/buildRangeIndex.js';
import {
  findIntraFileConflicts,
  collectRegionMismatches,
  findDuplicateInnOperators,
  resolveCanonicalOperatorNames,
  applyCanonicalOperatorNames,
} from '../../src/build/compile/discrepancies.js';

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

describe('findDuplicateInnOperators', () => {
  it('does not flag a single operator name for an INN', () => {
    expect(findDuplicateInnOperators([entry({ operator: 'ООО "Ромашка"' })])).toEqual([]);
  });

  it('does not flag the same operator name repeated across ranges', () => {
    const conflicts = findDuplicateInnOperators([
      entry({ operator: 'ООО "Ромашка"', from: 100, to: 199 }),
      entry({ operator: 'ООО "Ромашка"', from: 200, to: 299 }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('flags an ALL-CAPS vs mixed-case spelling as case-only, keeping the mixed-case name canonical', () => {
    const conflicts = findDuplicateInnOperators([
      entry({ operator: 'ПАО "Ростелеком"' }),
      entry({ operator: 'ПАО "РОСТЕЛЕКОМ"' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      kind: 'duplicate-inn',
      inn: '1234567890',
      canonicalName: 'ПАО "Ростелеком"',
      otherNames: ['ПАО "РОСТЕЛЕКОМ"'],
      caseOnly: true,
    });
  });

  it('flags a genuinely different name (e.g. an abbreviation) as not case-only', () => {
    const conflicts = findDuplicateInnOperators([
      entry({ operator: 'ООО "Компьютерные Коммуникационные Системы"' }),
      entry({ operator: 'ООО "КОКОС"' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'duplicate-inn',
      canonicalName: 'ООО "Компьютерные Коммуникационные Системы"',
      otherNames: ['ООО "КОКОС"'],
      caseOnly: false,
    });
  });

  it('falls back to the first encountered name when every variant is ALL-CAPS', () => {
    const conflicts = findDuplicateInnOperators([
      entry({ operator: 'ООО "АЛЬФА"' }),
      entry({ operator: 'ООО "БЕТА"' }),
    ]);
    expect(conflicts[0]).toMatchObject({ canonicalName: 'ООО "АЛЬФА"', otherNames: ['ООО "БЕТА"'] });
  });

  it('keeps INNs independent - different INNs with different names are not flagged', () => {
    const conflicts = findDuplicateInnOperators([
      entry({ operator: 'Operator A', inn: '1111111111' }),
      entry({ operator: 'Operator B', inn: '2222222222' }),
    ]);
    expect(conflicts).toEqual([]);
  });
});

describe('resolveCanonicalOperatorNames / applyCanonicalOperatorNames', () => {
  it('maps every INN to its canonical name, including INNs with a single spelling', () => {
    const canonicalNames = resolveCanonicalOperatorNames([
      entry({ operator: 'ПАО "Ростелеком"', inn: '1111111111' }),
      entry({ operator: 'ПАО "РОСТЕЛЕКОМ"', inn: '1111111111' }),
      entry({ operator: 'ООО "Ромашка"', inn: '2222222222' }),
    ]);
    expect(canonicalNames.get('1111111111')).toBe('ПАО "Ростелеком"');
    expect(canonicalNames.get('2222222222')).toBe('ООО "Ромашка"');
  });

  it('rewrites every entry sharing an INN to the canonical spelling, leaving other fields untouched', () => {
    const canonicalNames = new Map([['1111111111', 'ПАО "Ростелеком"']]);
    const entries = [
      entry({ operator: 'ПАО "РОСТЕЛЕКОМ"', inn: '1111111111', code: '812' }),
      entry({ operator: 'ПАО "Ростелеком"', inn: '1111111111', code: '843' }),
    ];
    const normalized = applyCanonicalOperatorNames(entries, canonicalNames);
    expect(normalized.map((e) => e.operator)).toEqual(['ПАО "Ростелеком"', 'ПАО "Ростелеком"']);
    expect(normalized.map((e) => e.code)).toEqual(['812', '843']);
  });

  it('leaves entries for INNs with no canonical mapping unchanged', () => {
    const normalized = applyCanonicalOperatorNames([entry({ operator: 'Operator A', inn: '9999999999' })], new Map());
    expect(normalized[0].operator).toBe('Operator A');
  });
});
