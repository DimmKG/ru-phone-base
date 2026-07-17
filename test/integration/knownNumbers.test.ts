import { describe, it, expect } from 'vitest';
import { createRuPhoneBase } from '../../src/index.js';
import { loadDataset } from '../../src/dataLoader.js';
import type { CompiledCodeTable } from '../../src/types.js';

const { lookupPhoneNumber, getRegions } = createRuPhoneBase();
const dataset = loadDataset();
// The default load includes all three tables - assert that for the rest of this file.
const fixedTable = dataset.fixed!;
const mobileTable = dataset.mobile!;

/** Builds a real, currently-assigned 11-digit number for `code` from the bundled dataset, so this test stays valid across data regenerations instead of hardcoding numbers that might get reassigned. */
function numberForFirstBlock(table: CompiledCodeTable, code: string): string {
  const block = table.c[code]?.[0];
  if (!block) throw new Error(`No block found for code ${code} - has the bundled dataset changed shape?`);
  const subscriber = String(block[0]).padStart(7, '0');
  return `7${code}${subscriber}`;
}

describe('known real ABC/DEF codes resolve via the bundled dataset', () => {
  it('495 (Moscow, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '495'));
    expect(result.valid).toBe(true);
    expect(result.type).toBe('fixed');
    expect(result.region?.map((r) => r.name)).toContain('город Москва');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('812 (Saint Petersburg, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '812'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.name)).toContain('город Санкт-Петербург');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('343 (Yekaterinburg, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '343'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.name)).toContain('Свердловская область');
    expect(result.timezone).toBe('Asia/Yekaterinburg');
  });

  it('383 (Novosibirsk, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '383'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.name)).toContain('Новосибирская область');
    expect(result.timezone).toBe('Asia/Novosibirsk');
  });

  it('a mobile DEF code resolves with type "mobile"', () => {
    const mobileCode = Object.keys(mobileTable.c)[0];
    const result = lookupPhoneNumber(numberForFirstBlock(mobileTable, mobileCode));
    expect(result.valid).toBe(true);
    expect(result.type).toBe('mobile');
    expect(result.operator).toBeDefined();
  });

  it('a pure 8-800 toll-free number resolves with nationwide:true, an empty region array, no settlement, and no timezone', () => {
    // Codes 800-809 are federal/non-geographic by construction (see isFederalCode
    // in lookup.ts). The registry's own region data for this block is literally
    // "Российская Федерация" - the internal "all-russia" marker behind that is
    // never surfaced, so `region` comes back empty rather than a fake entry.
    const block = fixedTable.c['800']?.[0];
    expect(block).toBeDefined();
    const subscriber = String(block![0]).padStart(7, '0');
    const result = lookupPhoneNumber(`7800${subscriber}`);
    expect(result.valid).toBe(true);
    expect(result.nationwide).toBe(true);
    expect(result.region).toEqual([]);
    expect(result.settlement).toBeUndefined();
    expect(result.timezone).toBeUndefined();
  });

  it('803 (televoting - federal by code prefix even though the row lists specific regions)', () => {
    // Unlike a pure all-russia row, code 803 rows can list a real (if broad and
    // non-authoritative) set of subjects - isFederalCode('803') still forces
    // nationwide:true and suppresses timezone, since the code prefix (80*) is
    // the reliable signal, not whatever regions happen to be listed.
    const result = lookupPhoneNumber('78033510000');
    expect(result.valid).toBe(true);
    expect(result.nationwide).toBe(true);
    expect(result.region!.length).toBeGreaterThan(1);
    expect(result.timezone).toBeUndefined();
  });

  it('an allocation can legitimately span multiple regions (not a "nationwide" case)', () => {
    // Ordinary (non-80*) blocks can still list more than one federal subject
    // under one operator - e.g. a mobile block serving both Moscow and
    // Moscow Oblast.
    const result = lookupPhoneNumber('79001400000');
    expect(result.valid).toBe(true);
    expect(result.nationwide).toBeUndefined();
    expect(result.region?.map((r) => r.slug).sort()).toEqual(['moscow', 'moscow-oblast']);
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('365 (Crimea, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '365'));
    expect(result.valid).toBe(true);
    expect(result.type).toBe('fixed');
    expect(result.region?.map((r) => r.slug)).toContain('crimea');
    expect(result.timezone).toBe('Europe/Simferopol');
  });

  it('810 (Zaporizhzhia, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '810'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.slug)).toContain('zaporizhzhia-oblast');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('856 (Donetsk PR, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '856'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.slug)).toContain('donetsk-pr');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('856 625-30-00 (disputed range: raw "Регион" column says Krasnodar Krai, "Территория ГАР" says Donetsk PR - GAR wins)', () => {
    // Range 6253000-6253999 under code 856 is one of the few rows where the
    // registry's two location columns disagree (see reports/discrepancies.json,
    // kind "gar-region-mismatch"). The operator - ГУП ДНР "РОС", Donetsk PR's
    // own state telecom enterprise - confirms Территория ГАР (Donetsk PR) is
    // correct and Регион (Krasnodar Krai) is the data-entry error
    // vs. Donetsk's Slavyansk/Sloviansk.
    const result = lookupPhoneNumber('78566253000');
    expect(result.valid).toBe(true);
    expect(result.operator).toBe('ГУП ДНР "РОС"');
    expect(result.region?.map((r) => r.slug)).toEqual(['donetsk-pr']);
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('857 (Luhansk PR, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '857'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.slug)).toContain('luhansk-pr');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('860 (Kherson, fixed)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(fixedTable, '860'));
    expect(result.valid).toBe(true);
    expect(result.region?.map((r) => r.slug)).toContain('kherson-oblast');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('949 (Donetsk PR, mobile)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(mobileTable, '949'));
    expect(result.valid).toBe(true);
    expect(result.type).toBe('mobile');
    expect(result.region?.map((r) => r.slug)).toContain('donetsk-pr');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('959 (Luhansk PR, mobile)', () => {
    const result = lookupPhoneNumber(numberForFirstBlock(mobileTable, '959'));
    expect(result.valid).toBe(true);
    expect(result.type).toBe('mobile');
    expect(result.region?.map((r) => r.slug)).toContain('luhansk-pr');
    expect(result.timezone).toBe('Europe/Moscow');
  });

  it('reports unassigned for a code that is not covered anywhere', () => {
    // 000 is never a real ABC/DEF code
    const result = lookupPhoneNumber('70009999999');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unassigned');
  });

  it('reports invalid-format for unparseable input', () => {
    const result = lookupPhoneNumber('not a phone number');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid-format');
    expect(result.normalized).toBeNull();
  });
});

describe('Sakha/Yakutia district-level timezones (code 411)', () => {
  // Sakha Republic genuinely spans several timezones (see
  // timezones.sakha.byDistrict, built from OSM ulus/district tags). The
  // registry's settlement field names the district as "м.р-н <name>", which
  // districtKeyFromSettlement (src/lookup.ts) strips down to match the
  // byDistrict keys - these numbers, one per district, prove that mapping
  // actually gets used end-to-end, not just present in timezones.json.
  it('г.о. город Якутск - the republic default timezone', () => {
    const result = lookupPhoneNumber('74112200000');
    expect(result.valid).toBe(true);
    expect(result.settlement).toBe('г.о. город Якутск');
    expect(result.timezone).toBe('Asia/Yakutsk');
  });

  it('м.р-н Усть-Майский -> Asia/Khandyga', () => {
    const result = lookupPhoneNumber('74114021000');
    expect(result.settlement).toBe('м.р-н Усть-Майский');
    expect(result.timezone).toBe('Asia/Khandyga');
  });

  it('м.р-н Томпонский -> Asia/Khandyga', () => {
    const result = lookupPhoneNumber('74115323100');
    expect(result.settlement).toBe('м.р-н Томпонский');
    expect(result.timezone).toBe('Asia/Khandyga');
  });

  it('м.р-н Оймяконский -> Asia/Ust-Nera', () => {
    const result = lookupPhoneNumber('74115420000');
    expect(result.settlement).toBe('м.р-н Оймяконский');
    expect(result.timezone).toBe('Asia/Ust-Nera');
  });

  it('м.р-н Момский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115021000');
    expect(result.settlement).toBe('м.р-н Момский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });

  it('м.р-н Среднеколымский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115623000');
    expect(result.settlement).toBe('м.р-н Среднеколымский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });

  it('м.р-н Нижнеколымский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115722000');
    expect(result.settlement).toBe('м.р-н Нижнеколымский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });

  it('м.р-н Аллаиховский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115820000');
    expect(result.settlement).toBe('м.р-н Аллаиховский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });

  it('м.р-н Абыйский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115920000');
    expect(result.settlement).toBe('м.р-н Абыйский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });

  it('м.р-н Верхнеколымский -> Asia/Srednekolymsk', () => {
    const result = lookupPhoneNumber('74115525000');
    expect(result.settlement).toBe('м.р-н Верхнеколымский');
    expect(result.timezone).toBe('Asia/Srednekolymsk');
  });
});

describe('getRegions', () => {
  it('lists every federal subject with a slug, name, and (usually) a resolved timezone', () => {
    const regions = getRegions();
    expect(regions.length).toBeGreaterThan(80);

    const moscow = regions.find((r) => r.slug === 'moscow');
    expect(moscow).toMatchObject({
      slug: 'moscow',
      name: 'город Москва',
      nameLatin: 'Moscow',
      timezone: 'Europe/Moscow',
    });

    const sakha = regions.find((r) => r.slug === 'sakha');
    expect(sakha?.nameLatin).toBe('Republic of Sakha (Yakutia)');
    expect(sakha?.timezone).toBe('Asia/Yakutsk');
  });

  it('does not list the internal non-geographic "all-russia" marker - it is not a real region', () => {
    const allRussia = getRegions().find((r) => r.slug === 'all-russia');
    expect(allRussia).toBeUndefined();
  });
});
