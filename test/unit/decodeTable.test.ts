import { describe, it, expect } from 'vitest';
import { buildRangeIndex, type FlatEntry } from '../../src/build/compile/buildRangeIndex.js';
import { decodeTable } from '../../src/build/diff/decodeTable.js';
import type { Dataset } from '../../src/types.js';

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

describe('decodeTable', () => {
  it('decodes a regular block with resolved region and timezone', () => {
    const table = buildRangeIndex([entry({})]);
    const timezones: Dataset['timezones'] = { moscow: 'Europe/Moscow' };
    const [alloc] = decodeTable(table, 'fixed', timezones);
    expect(alloc).toMatchObject({
      type: 'fixed',
      code: '495',
      from: 100,
      to: 199,
      operator: 'Operator A',
      inn: '1234567890',
      regions: ['moscow'],
      nationwide: false,
      timezone: 'Europe/Moscow',
    });
  });

  it('marks a federal-prefix code as nationwide with no timezone, regardless of listed regions', () => {
    const table = buildRangeIndex([entry({ code: '801', regions: ['moscow'] })]);
    const timezones: Dataset['timezones'] = { moscow: 'Europe/Moscow' };
    const [alloc] = decodeTable(table, 'fixed', timezones);
    expect(alloc.nationwide).toBe(true);
    expect(alloc.timezone).toBeUndefined();
  });

  it('strips the "all-russia" pseudo-slug from regions but keeps nationwide true', () => {
    const table = buildRangeIndex([entry({ code: '495', regions: ['moscow', 'all-russia'] })]);
    const [alloc] = decodeTable(table, 'fixed', {});
    expect(alloc.nationwide).toBe(true);
    expect(alloc.regions).toEqual(['moscow']);
  });

  it('carries settlement through and resolves a Sakha-style district timezone override', () => {
    const table = buildRangeIndex([entry({ code: '411', regions: ['sakha'], settlement: 'м.р-н Оймяконский' })]);
    const timezones: Dataset['timezones'] = {
      sakha: { default: 'Asia/Yakutsk', byDistrict: { Оймяконский: 'Asia/Ust-Nera' } },
    };
    const [alloc] = decodeTable(table, 'fixed', timezones);
    expect(alloc.settlement).toBe('м.р-н Оймяконский');
    expect(alloc.timezone).toBe('Asia/Ust-Nera');
  });

  it('leaves timezone undefined when no listed region resolves to a known timezone', () => {
    const table = buildRangeIndex([entry({ regions: ['unknown-region'] })]);
    const [alloc] = decodeTable(table, 'fixed', {});
    expect(alloc.timezone).toBeUndefined();
  });
});
