import { describe, it, expect } from 'vitest';
import { renderSummaryMarkdown } from '../../tools/renderSummary.js';
import type { DiffStats } from '../../src/build/diff/computeStats.js';

function counts(overrides: Partial<DiffStats['allocations']['total']> = {}): DiffStats['allocations']['total'] {
  return { added: 0, removed: 0, changedData: 0, changedTimezone: 0, unchanged: 0, ...overrides };
}

function stats(overrides: Partial<DiffStats> = {}): DiffStats {
  return {
    generatedAt: '2026-07-20T00:00:00.000Z',
    snapshotDate: '2026-07-20',
    sourceFiles: [{ file: 'ABC-3xx.csv', shaBefore: 'aaa', shaAfter: 'bbb', changed: true }],
    allocations: {
      fixed: counts({ added: 3 }),
      mobile: counts(),
      total: counts({ added: 3 }),
    },
    discrepancies: { 'intra-file': { before: 1, after: 2, delta: 1 } },
    unmappedRegions: { before: 0, after: 1, newlyUnmapped: ['токен'], newlyResolved: [] },
    ...overrides,
  };
}

describe('renderSummaryMarkdown', () => {
  it('includes the snapshot date, allocation counts, discrepancy kinds, and unmapped tokens', () => {
    const md = renderSummaryMarkdown(stats());
    expect(md).toContain('2026-07-20');
    expect(md).toContain('| Добавлено | 3 | 0 | 3 |');
    expect(md).toContain('intra-file');
    expect(md).toContain('токен');
  });

  it('omits the newly-unmapped/newly-resolved lines when both are empty', () => {
    const md = renderSummaryMarkdown(
      stats({ unmappedRegions: { before: 0, after: 0, newlyUnmapped: [], newlyResolved: [] } }),
    );
    expect(md).not.toContain('Новые несопоставленные');
    expect(md).not.toContain('Теперь сопоставлены');
  });
});
