import { describe, it, expect } from 'vitest';
import { listOperators, findOperatorByInn, getDatasetInfo } from '../../src/lookup.js';
import type { Dataset } from '../../src/types.js';

function dataset(operators: Record<string, string>): Dataset {
  return {
    regions: [],
    operators,
    timezones: {},
    meta: { version: 1, files: [] },
  };
}

describe('listOperators / findOperatorByInn', () => {
  it('lists operators sorted by name, then INN', () => {
    const result = listOperators(
      dataset({
        '2222222222': 'Бета',
        '1111111111': 'Альфа',
        '3333333333': 'Альфа',
      }),
    );
    expect(result).toEqual([
      { name: 'Альфа', inn: '1111111111' },
      { name: 'Альфа', inn: '3333333333' },
      { name: 'Бета', inn: '2222222222' },
    ]);
  });

  it('finds an operator by INN', () => {
    const ds = dataset({ '7707083893': 'ПАО "МТС"' });
    expect(findOperatorByInn(ds, '7707083893')).toEqual({ name: 'ПАО "МТС"', inn: '7707083893' });
    expect(findOperatorByInn(ds, '0000000000')).toBeUndefined();
  });
});

describe('getDatasetInfo', () => {
  it('returns the dataset meta as-is', () => {
    const ds = dataset({});
    ds.meta = { version: 1, files: [], builtAt: '2026-08-21T17:19:53.798Z', rowCounts: { 'DEF-9xx': 17059 } };
    expect(getDatasetInfo(ds)).toBe(ds.meta);
  });
});
