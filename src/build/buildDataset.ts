import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { downloadRawData, RAW_DATA_FILES } from './download.js';
import { parseAbcDef, type CapacityMismatch } from './parse/parseAbcDef.js';
import { FEDERAL_SUBJECTS } from './parse/federalSubjects.js';
import { flattenRows, buildRangeIndex, type CompiledCodeTable, type CompiledBlock } from './compile/buildRangeIndex.js';
import {
  findIntraFileConflicts,
  findParallelAllocationConflicts,
  collectRegionMismatches,
} from './compile/discrepancies.js';
import { fetchSubjectTimezones } from './osm/fetchSubjectTimezones.js';
import type { NormalizedRow, SourceFile } from './parse/types.js';

export interface BuildOptions {
  /** Download missing raw CSVs from opendata.digital.gov.ru before parsing. Default: true. */
  download?: boolean;
  /** Force re-download even if files already exist locally. */
  forceDownload?: boolean;
  /** OSM Overpass response cache directory. Defaults to a `ru-phone-base-osm-cache` folder under the OS temp directory. */
  osmCacheDir?: string;
  /** Re-fetch OSM timezone data instead of using the on-disk cache. */
  refreshTimezones?: boolean;
}

export interface BuildReport {
  unmappedRegions: string[];
  discrepancies: unknown[];
}

const FIXED_FILES: { file: string; sourceFile: SourceFile }[] = [
  { file: 'ABC-3xx.csv', sourceFile: 'ABC-3xx' },
  { file: 'ABC-4xx.csv', sourceFile: 'ABC-4xx' },
  { file: 'ABC-8xx.csv', sourceFile: 'ABC-8xx' },
];
const MOBILE_FILE = { file: 'DEF-9xx.csv', sourceFile: 'DEF-9xx' as const };

export async function buildDataset(
  inputDir: string,
  outputDir: string,
  options: BuildOptions = {},
): Promise<BuildReport> {
  const { download = true, forceDownload = false, osmCacheDir, refreshTimezones = false } = options;

  if (forceDownload) {
    await downloadRawData(inputDir, { force: true });
  } else if (download) {
    await downloadRawData(inputDir);
  }

  const fixedParsed = FIXED_FILES.map(({ file, sourceFile }) => parseAbcDef(path.join(inputDir, file), sourceFile));
  const mobileParsed = parseAbcDef(path.join(inputDir, MOBILE_FILE.file), MOBILE_FILE.sourceFile);

  const allRowSets = [...fixedParsed.map((p) => p.rows), mobileParsed.rows];
  const unmappedRegions = collectUnmapped(allRowSets);

  const fixedEntrySets = fixedParsed.map((p) => flattenRows(p.rows));
  const mobileEntries = flattenRows(mobileParsed.rows);

  const fixed = mergeCodeTables(fixedEntrySets.map(buildRangeIndex));
  const mobile = buildRangeIndex(mobileEntries);

  const capacityMismatches: CapacityMismatch[] = [...fixedParsed, mobileParsed].flatMap((p) => p.capacityMismatches);

  const discrepancies: unknown[] = [
    ...capacityMismatches,
    ...fixedEntrySets.flatMap(findParallelAllocationConflicts),
    ...findParallelAllocationConflicts(mobileEntries),
    ...fixedEntrySets.flatMap(findIntraFileConflicts),
    ...findIntraFileConflicts(mobileEntries),
    ...fixedEntrySets.flatMap(collectRegionMismatches),
    ...collectRegionMismatches(mobileEntries),
  ];

  const timezoneResult = await fetchSubjectTimezones({ cacheDir: osmCacheDir, refresh: refreshTimezones });

  mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputDir, 'fixed.json'), fixed);
  writeJson(path.join(outputDir, 'mobile.json'), mobile);
  // PSEUDO_SUBJECTS (the internal "all-russia" marker) is deliberately excluded here -
  // it's not a real listable region, so getRegions() never surfaces it (see lookup.ts,
  // which also strips it out of any result's `region` array).
  writeJson(
    path.join(outputDir, 'regions.json'),
    FEDERAL_SUBJECTS.map((s) => ({ slug: s.slug, name: s.name, nameLatin: s.nameLatin })),
  );
  writeJson(path.join(outputDir, 'timezones.json'), timezoneResult.timezones);
  writeJson(path.join(outputDir, 'meta.json'), {
    builtAt: new Date().toISOString(),
    sourceFiles: RAW_DATA_FILES.map((file) => fileMeta(path.join(inputDir, file), file)),
    rowCounts: {
      ...Object.fromEntries(FIXED_FILES.map(({ sourceFile }, i) => [sourceFile, fixedParsed[i].rows.length])),
      'DEF-9xx': mobileParsed.rows.length,
    },
    timezones: {
      matchedFromOsm: timezoneResult.matchedFromOsm.length,
      filledFromFallback: timezoneResult.filledFromFallback.length,
      unresolved: timezoneResult.unresolved,
    },
  });

  // Sibling of outputDir, not nested inside it - the build only copies outputDir
  // (e.g. src/data -> dist/data) into the published package, so keeping reports
  // out of that tree means they never ship, while still being written
  // somewhere predictable for local inspection/commit.
  const reportsDir = path.join(path.dirname(outputDir), 'reports');
  mkdirSync(reportsDir, { recursive: true });
  writeJson(path.join(reportsDir, 'unmapped-regions.json'), unmappedRegions);
  writeJson(path.join(reportsDir, 'discrepancies.json'), discrepancies);

  return { unmappedRegions, discrepancies };
}

function collectUnmapped(rowSets: NormalizedRow[][]): string[] {
  const unmapped = new Set<string>();
  for (const rows of rowSets) {
    for (const row of rows) {
      for (const token of row.unmapped) unmapped.add(token);
    }
  }
  return [...unmapped].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Merges several compiled code tables (e.g. ABC-3xx/4xx/8xx) into one, offsetting string-table indices. Codes are expected not to overlap between tables (each ABC/DEF file covers a disjoint set of 3-digit codes). */
function mergeCodeTables(tables: CompiledCodeTable[]): CompiledCodeTable {
  const merged: CompiledCodeTable = { o: [], r: [], p: [], c: {} };
  for (const table of tables) {
    const operatorOffset = merged.o.length;
    const regionSetOffset = merged.r.length;
    const settlementOffset = merged.p.length;
    merged.o.push(...table.o);
    merged.r.push(...table.r);
    merged.p.push(...table.p);
    for (const [code, blocks] of Object.entries(table.c)) {
      merged.c[code] = blocks.map((block): CompiledBlock => {
        if (block.length === 5) {
          return [
            block[0],
            block[1],
            block[2] + operatorOffset,
            block[3] + regionSetOffset,
            block[4] + settlementOffset,
          ];
        }
        return [block[0], block[1], block[2] + operatorOffset, block[3] + regionSetOffset];
      });
    }
  }
  return merged;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data));
}

function fileMeta(filePath: string, name: string): { file: string; sha256: string } {
  const content = readFileSync(filePath);
  return { file: name, sha256: createHash('sha256').update(content).digest('hex') };
}
