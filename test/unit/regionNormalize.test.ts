import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  tokensFromField,
  resolveTokens,
  resolveRowRegion,
  extractSettlement,
} from '../../src/build/parse/regionNormalize.js';
import { readRegistryCsv } from '../../src/build/parse/csv.js';
import { RAW_DATA_FILES } from '../../src/build/download.js';

describe('tokensFromField', () => {
  it('returns [] for empty/dash cells', () => {
    expect(tokensFromField('-')).toEqual([]);
    expect(tokensFromField('')).toEqual([]);
    expect(tokensFromField(undefined)).toEqual([]);
  });

  it('takes the last pipe-segment of a single hierarchical location', () => {
    expect(tokensFromField('г. Когалым|Ханты-Мансийский автономный округ - Югра')).toEqual([
      'Ханты-Мансийский автономный округ - Югра',
    ]);
  });

  it('splits a flat comma list of region names', () => {
    expect(tokensFromField('Архангельская область, Вологодская область')).toEqual([
      'Архангельская область',
      'Вологодская область',
    ]);
  });

  it('handles a comma list where one item is itself a pipe hierarchy', () => {
    expect(tokensFromField('г. Казань|Республика Татарстан')).toEqual(['Республика Татарстан']);
  });
});

describe('resolveTokens', () => {
  it('resolves known aliases and collects unmapped tokens', () => {
    const result = resolveTokens(['Московская область', 'Totally Unknown Token']);
    expect(result.slugs).toEqual(['moscow-oblast']);
    expect(result.unmapped).toEqual(['Totally Unknown Token']);
  });

  it('supports alias entries mapping to multiple slugs', () => {
    const result = resolveTokens(['Республика Крым и г. Севастополь']);
    expect(result.slugs.sort()).toEqual(['crimea', 'sevastopol']);
  });
});

describe('resolveRowRegion', () => {
  it('prefers the more specific place value for known matryoshka nesting (Tyumen -> Khanty-Mansi AO)', () => {
    const result = resolveRowRegion({
      zone: 'Тюменская обл.',
      zoneGar: 'Тюменская область',
      place: 'г. Когалым|Ханты-Мансийский Автономный округ - Югра АО',
      placeGar: 'г. Когалым|г.о. Когалым|Ханты-Мансийский автономный округ - Югра',
    });
    expect(result.slugs).toEqual(['khanty-mansi-ao']);
    expect(result.mismatch).toBeUndefined();
  });

  it('keeps the zone answer and flags a mismatch for an unexplained disagreement', () => {
    const result = resolveRowRegion({
      zone: 'Тверская область',
      zoneGar: 'Тверская область',
      place: 'г. Москва',
      placeGar: 'Город Москва',
    });
    expect(result.slugs).toEqual(['tver-oblast']);
    expect(result.mismatch).toEqual({ zoneToken: 'tver-oblast', placeToken: 'moscow' });
  });

  it('uses zone as-is when it names more than one subject', () => {
    const result = resolveRowRegion({
      zone: 'Архангельская область, Вологодская область',
      place: 'г. Санкт-Петербург',
    });
    expect(result.slugs.sort()).toEqual(['arkhangelsk-oblast', 'vologda-oblast']);
  });

  it('falls back to place when zone is empty', () => {
    const result = resolveRowRegion({ zone: '-', place: 'г. Москва' });
    expect(result.slugs).toEqual(['moscow']);
  });
});

describe('extractSettlement', () => {
  it('takes the first segment of the place hierarchy', () => {
    expect(extractSettlement({ place: 'г. Когалым|Ханты-Мансийский автономный округ - Югра' })).toBe('г. Когалым');
  });

  it('prefers placeGar over place', () => {
    expect(
      extractSettlement({
        place: 'г. Когалым|Ханты-Мансийский Автономный округ - Югра АО',
        placeGar: 'г. Когалым|г.о. Когалым|Ханты-Мансийский автономный округ - Югра',
      }),
    ).toBe('г. Когалым');
  });

  it('returns undefined for empty/dash cells', () => {
    expect(extractSettlement({ place: '-' })).toBeUndefined();
    expect(extractSettlement({})).toBeUndefined();
  });
});

// Integration-ish but cheap: only runs against the real raw CSVs when present
// locally (they're gitignored/downloaded on demand, see download.ts) - skips
// otherwise rather than failing CI on their absence.
const rawDataDir = path.resolve('raw-data');
const hasRawData = RAW_DATA_FILES.every((file) => existsSync(path.join(rawDataDir, file)));

describe.skipIf(!hasRawData)('regionAliases.json completeness against real raw-data', () => {
  it('has no unmapped region tokens across all 4 files', () => {
    const unmapped = new Set<string>();

    for (const file of ['ABC-3xx.csv', 'ABC-4xx.csv', 'ABC-8xx.csv', 'DEF-9xx.csv']) {
      const { header, rows } = readRegistryCsv(path.join(rawDataDir, file));
      const regionIdx = header.indexOf('Регион');
      const garIdx = header.indexOf('Территория ГАР');
      for (const row of rows) {
        const { unmapped: u } = resolveRowRegion({ zone: row[garIdx], place: row[regionIdx] });
        for (const t of u) unmapped.add(t);
      }
    }

    expect([...unmapped]).toEqual([]);
  });
});
