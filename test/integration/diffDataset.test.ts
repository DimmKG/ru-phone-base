import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRangeIndex, type FlatEntry } from '../../src/build/compile/buildRangeIndex.js';
import type { DiffStats } from '../../src/build/diff/computeStats.js';
import type { DecodedAllocation } from '../../src/build/diff/decodeTable.js';
import type { AllocationChange, TimezoneChange } from '../../src/build/diff/diffAllocations.js';

function entry(overrides: Partial<FlatEntry>): FlatEntry {
  return {
    code: '495',
    from: 100,
    to: 199,
    operator: 'Operator A',
    inn: '1111111111',
    regions: ['moscow'],
    sourceFile: 'ABC-4xx',
    ...overrides,
  };
}

const EMPTY_TABLE = buildRangeIndex([]);

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data));
}

function writeSnapshot(
  dir: string,
  fixedEntries: FlatEntry[],
  timezones: Record<string, string>,
  builtAt: string,
  sourceFileShas: Record<string, string>,
  discrepancies: { kind: string }[],
  unmappedRegions: string[],
): void {
  const dataDir = path.join(dir, 'data');
  const reportsDir = path.join(dir, 'reports');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  writeJson(path.join(dataDir, 'fixed.json'), buildRangeIndex(fixedEntries));
  writeJson(path.join(dataDir, 'mobile.json'), EMPTY_TABLE);
  writeJson(path.join(dataDir, 'timezones.json'), timezones);
  writeJson(path.join(dataDir, 'meta.json'), {
    builtAt,
    sourceFiles: Object.entries(sourceFileShas).map(([file, sha256]) => ({ file, sha256 })),
  });
  writeJson(path.join(reportsDir, 'discrepancies.json'), discrepancies);
  writeJson(path.join(reportsDir, 'unmapped-regions.json'), unmappedRegions);
}

describe('diff-dataset CLI (end-to-end)', () => {
  let root: string;
  let oldDir: string;
  let newDir: string;
  let outDir: string;
  let outDirNoReports: string;
  let cliOutput: string;
  let cliOutputNoReports: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ru-phone-base-diff-test-'));
    oldDir = path.join(root, 'old');
    newDir = path.join(root, 'new');
    outDir = path.join(root, 'out');
    outDirNoReports = path.join(root, 'out-no-reports');

    writeSnapshot(
      oldDir,
      [
        entry({ code: '495', from: 100, to: 199, operator: 'Operator A', inn: '1111111111', regions: ['moscow'] }),
        entry({ code: '495', from: 300, to: 399, operator: 'Operator D', inn: '4444444444', regions: ['moscow'] }),
        entry({
          code: '343',
          from: 100,
          to: 199,
          operator: 'Operator C',
          inn: '3333333333',
          regions: ['sverdlovsk-oblast'],
        }),
        entry({ code: '365', from: 100, to: 199, operator: 'Operator F', inn: '6666666666', regions: ['crimea'] }),
      ],
      { moscow: 'Europe/Moscow', 'sverdlovsk-oblast': 'Asia/Yekaterinburg', crimea: 'Europe/Simferopol' },
      '2026-07-10T00:00:00.000Z',
      { 'ABC-3xx.csv': 'sha-old' },
      [{ kind: 'intra-file' }],
      ['unknown1'],
    );

    writeSnapshot(
      newDir,
      [
        entry({ code: '495', from: 100, to: 199, operator: 'Operator A', inn: '1111111111', regions: ['moscow'] }),
        entry({
          code: '495',
          from: 300,
          to: 399,
          operator: 'Operator E',
          inn: '5555555555',
          regions: ['moscow-oblast'],
        }),
        entry({
          code: '812',
          from: 100,
          to: 199,
          operator: 'Operator B',
          inn: '2222222222',
          regions: ['st-petersburg'],
        }),
        entry({ code: '365', from: 100, to: 199, operator: 'Operator F', inn: '6666666666', regions: ['crimea'] }),
      ],
      {
        moscow: 'Europe/Moscow',
        'moscow-oblast': 'Europe/Moscow',
        'st-petersburg': 'Europe/Moscow',
        crimea: 'Europe/Moscow',
      },
      '2026-07-17T00:00:00.000Z',
      { 'ABC-3xx.csv': 'sha-new' },
      [{ kind: 'intra-file' }, { kind: 'intra-file' }],
      ['unknown1', 'unknown2'],
    );

    const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    cliOutput = execFileSync(
      tsxBin,
      [
        'src/bin/diff-dataset.ts',
        '--old',
        oldDir,
        '--new-data',
        path.join(newDir, 'data'),
        '--new-reports',
        path.join(newDir, 'reports'),
        '--output',
        outDir,
      ],
      { cwd: process.cwd(), encoding: 'utf-8', timeout: 30_000 },
    );

    cliOutputNoReports = execFileSync(
      tsxBin,
      [
        'src/bin/diff-dataset.ts',
        '--old',
        oldDir,
        '--new-data',
        path.join(newDir, 'data'),
        '--output',
        outDirNoReports,
      ],
      { cwd: process.cwd(), encoding: 'utf-8', timeout: 30_000 },
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function readOutput<T>(file: string): T {
    return JSON.parse(readFileSync(path.join(outDir, file), 'utf-8')) as T;
  }

  it('writes stats.json with the expected snapshot date and per-file sha diff', () => {
    const stats = readOutput<DiffStats>('stats.json');
    expect(stats.snapshotDate).toBe('2026-07-17');
    expect(stats.sourceFiles).toEqual([
      { file: 'ABC-3xx.csv', shaBefore: 'sha-old', shaAfter: 'sha-new', changed: true },
    ]);
  });

  it('classifies added/removed/changed-data/changed-timezone allocations correctly', () => {
    const stats = readOutput<DiffStats>('stats.json');
    expect(stats.allocations.fixed).toEqual({ added: 1, removed: 1, changedData: 1, changedTimezone: 1, unchanged: 1 });
    expect(stats.allocations.mobile).toEqual({
      added: 0,
      removed: 0,
      changedData: 0,
      changedTimezone: 0,
      unchanged: 0,
    });
  });

  it('reports discrepancy and unmapped-region deltas', () => {
    const stats = readOutput<DiffStats>('stats.json');
    expect(stats.discrepancies).toBeDefined();
    expect(stats.discrepancies?.['intra-file']).toEqual({ before: 1, after: 2, delta: 1 });
    expect(stats.unmappedRegions).toEqual({ before: 1, after: 2, newlyUnmapped: ['unknown2'], newlyResolved: [] });
  });

  it('writes detail files whose lengths match the summary counts', () => {
    const stats = readOutput<DiffStats>('stats.json');
    const added = readOutput<DecodedAllocation[]>('allocations-added.json');
    const removed = readOutput<DecodedAllocation[]>('allocations-removed.json');
    const changed = readOutput<AllocationChange[]>('allocations-changed.json');
    const timezoneChanges = readOutput<TimezoneChange[]>('timezone-changes.json');

    expect(added).toHaveLength(stats.allocations.total.added);
    expect(removed).toHaveLength(stats.allocations.total.removed);
    expect(changed).toHaveLength(stats.allocations.total.changedData);
    expect(timezoneChanges).toHaveLength(stats.allocations.total.changedTimezone);

    expect(added[0]).toMatchObject({ code: '812', operator: 'Operator B' });
    expect(removed[0]).toMatchObject({ code: '343', operator: 'Operator C' });
    expect(changed[0]).toMatchObject({
      code: '495',
      before: { operator: 'Operator D' },
      after: { operator: 'Operator E' },
    });
    expect(timezoneChanges[0]).toMatchObject({
      code: '365',
      timezoneBefore: 'Europe/Simferopol',
      timezoneAfter: 'Europe/Moscow',
    });
  });

  it('prints a brief statistics summary to the console', () => {
    expect(cliOutput).toContain('2026-07-17');
    expect(cliOutput).toMatch(/added:\s+1 \/ 0 \/ 1/);
    expect(cliOutput).toContain('intra-file: 1 -> 2 (+1)');
  });

  it('does not write a PR-ready summary.md - that lives in tools/build-pr-summary.ts', () => {
    expect(() => readFileSync(path.join(outDir, 'summary.md'), 'utf-8')).toThrow();
  });

  it('omits discrepancies/unmappedRegions from stats.json when --new-reports is not passed, without affecting the allocation diff', () => {
    const stats = JSON.parse(readFileSync(path.join(outDirNoReports, 'stats.json'), 'utf-8')) as DiffStats;
    expect(stats.discrepancies).toBeUndefined();
    expect(stats.unmappedRegions).toBeUndefined();
    expect(stats.allocations.fixed).toEqual({ added: 1, removed: 1, changedData: 1, changedTimezone: 1, unchanged: 1 });
    expect(cliOutputNoReports).toContain('not compared');
  });
});

describe('build-pr-summary CLI (tools/, not part of the published package)', () => {
  it('renders stats.json into a PR body with a workflow-run footer link', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ru-phone-base-pr-summary-test-'));
    try {
      const statsPath = path.join(root, 'stats.json');
      const outputPath = path.join(root, 'pr-body.md');
      const stats: DiffStats = {
        generatedAt: '2026-07-17T00:00:00.000Z',
        snapshotDate: '2026-07-17',
        sourceFiles: [{ file: 'ABC-3xx.csv', shaBefore: 'sha-old', shaAfter: 'sha-new', changed: true }],
        allocations: {
          fixed: { added: 1, removed: 0, changedData: 0, changedTimezone: 0, unchanged: 0 },
          mobile: { added: 0, removed: 0, changedData: 0, changedTimezone: 0, unchanged: 0 },
          total: { added: 1, removed: 0, changedData: 0, changedTimezone: 0, unchanged: 0 },
        },
        discrepancies: { 'intra-file': { before: 1, after: 2, delta: 1 } },
        unmappedRegions: { before: 0, after: 0, newlyUnmapped: [], newlyResolved: [] },
      };
      writeJson(statsPath, stats);

      const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
      execFileSync(
        tsxBin,
        [
          'tools/build-pr-summary.ts',
          '--stats',
          statsPath,
          '--run-url',
          'https://example.test/run/1',
          '--output',
          outputPath,
        ],
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 30_000 },
      );

      const body = readFileSync(outputPath, 'utf-8');
      expect(body).toContain('2026-07-17');
      expect(body).toContain('intra-file');
      expect(body).toContain('[запуску workflow](https://example.test/run/1)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
