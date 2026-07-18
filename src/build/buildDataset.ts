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
  findDuplicateInnOperators,
  resolveCanonicalOperatorNames,
  applyCanonicalOperatorNames,
} from './compile/discrepancies.js';
import { QUIRKS, applyOrganizationNameQuirks, applyAllocationFieldQuirks } from './compile/quirks.js';
import { loadUserQuirks } from './compile/loadQuirks.js';
import { fetchSubjectTimezones } from './osm/fetchSubjectTimezones.js';
import type { NormalizedRow, SourceFile } from './parse/types.js';
import { DATASET_VERSION } from '../types.js';

export interface BuildOptions {
  /** Download missing raw CSVs from opendata.digital.gov.ru before parsing. Default: true. */
  download?: boolean;
  /** Force re-download even if files already exist locally. */
  forceDownload?: boolean;
  /** OSM Overpass response cache directory. Defaults to a `ru-phone-base-osm-cache` folder under the OS temp directory. */
  osmCacheDir?: string;
  /** Re-fetch OSM timezone data instead of using the on-disk cache. */
  refreshTimezones?: boolean;
  /** Path to a .json/.js/.ts file exporting extra quirks (see loadQuirks.ts) - applied after the built-in ones in quirks.ts. */
  userQuirksFile?: string;
}

export interface BuildReport {
  unmappedRegions: string[];
  discrepancies: unknown[];
  quirks: unknown[];
}

const FIXED_FILES: { file: string; sourceFile: SourceFile }[] = [
  { file: 'ABC-3xx.csv', sourceFile: 'ABC-3xx' },
  { file: 'ABC-4xx.csv', sourceFile: 'ABC-4xx' },
  { file: 'ABC-8xx.csv', sourceFile: 'ABC-8xx' },
];
const MOBILE_FILE = { file: 'DEF-9xx.csv', sourceFile: 'DEF-9xx' as const };

const STAGE_COUNT = 6;

function logStage(n: number, message: string): void {
  console.log(`[${n}/${STAGE_COUNT}] ${message}`);
}

export async function buildDataset(
  inputDir: string,
  outputDir: string,
  options: BuildOptions = {},
): Promise<BuildReport> {
  const { download = true, forceDownload = false, osmCacheDir, refreshTimezones = false, userQuirksFile } = options;

  // User-supplied quirks (see loadQuirks.ts) are appended after the built-in
  // ones, so they're applied last and can override/extend them.
  const allQuirks = userQuirksFile ? [...QUIRKS, ...(await loadUserQuirks(userQuirksFile))] : QUIRKS;

  if (forceDownload) {
    await downloadRawData(inputDir, { force: true });
  } else if (download) {
    await downloadRawData(inputDir);
  }

  logStage(1, `Parsing raw registry CSVs from ${inputDir}...`);
  const fixedParsed = FIXED_FILES.map(({ file, sourceFile }) => parseAbcDef(path.join(inputDir, file), sourceFile));
  const mobileParsed = parseAbcDef(path.join(inputDir, MOBILE_FILE.file), MOBILE_FILE.sourceFile);
  const totalRows = fixedParsed.reduce((sum, p) => sum + p.rows.length, 0) + mobileParsed.rows.length;
  console.log(`  parsed ${totalRows} rows across ${FIXED_FILES.length + 1} files`);

  const allRowSets = [...fixedParsed.map((p) => p.rows), mobileParsed.rows];
  const unmappedRegions = collectUnmapped(allRowSets);

  const fixedEntrySets = fixedParsed.map((p) => flattenRows(p.rows));
  const mobileEntries = flattenRows(mobileParsed.rows);

  const capacityMismatches: CapacityMismatch[] = [...fixedParsed, mobileParsed].flatMap((p) => p.capacityMismatches);

  // Duplicate-INN check runs over the whole registry (fixed + mobile combined),
  // not per source file - the same legal entity's INN can show up under
  // slightly different spellings in both tables (e.g. Ростелеком).
  const allEntries = [...fixedEntrySets.flat(), ...mobileEntries];

  logStage(
    2,
    'Checking for discrepancies (parallel allocations, intra-file conflicts, region mismatches, duplicate INNs)...',
  );
  const discrepancies: unknown[] = [
    ...capacityMismatches,
    ...fixedEntrySets.flatMap(findParallelAllocationConflicts),
    ...findParallelAllocationConflicts(mobileEntries),
    ...fixedEntrySets.flatMap(findIntraFileConflicts),
    ...findIntraFileConflicts(mobileEntries),
    ...fixedEntrySets.flatMap(collectRegionMismatches),
    ...collectRegionMismatches(mobileEntries),
    ...findDuplicateInnOperators(allEntries),
  ];
  console.log(`  found ${discrepancies.length} discrepanc(y/ies), ${unmappedRegions.length} unmapped region token(s)`);

  logStage(3, 'Resolving canonical operator names and applying quirks...');
  // Fold same-INN spelling variants (ALL-CAPS vs mixed-case, abbreviations, ...)
  // into one canonical operator name per INN before compiling the operators
  // table, so the published dataset has a single entry per real-world entity.
  // The variants themselves are only preserved in the discrepancies report above.
  const autoCanonicalNames = resolveCanonicalOperatorNames(allEntries);
  // Hand-verified overrides on top of the auto-picked names (see quirks.ts) -
  // for cases the case-based heuristic can't get right on its own.
  const { canonicalNames, applications: organizationNameQuirks } = applyOrganizationNameQuirks(
    autoCanonicalNames,
    allQuirks,
  );

  const namedFixedEntrySets = fixedEntrySets.map((entries) => applyCanonicalOperatorNames(entries, canonicalNames));
  const namedMobileEntries = applyCanonicalOperatorNames(mobileEntries, canonicalNames);

  // Per-row overrides (wrong region/settlement/etc on one specific allocation)
  // are matched by [sourceFile, code, from, to, inn], so they're applied over
  // the combined fixed+mobile list, then split back into the original
  // per-source-file groups buildRangeIndex/mergeCodeTables expect.
  const namedEntrySetSizes = [...namedFixedEntrySets.map((entries) => entries.length), namedMobileEntries.length];
  const { entries: quirkedEntries, applications: allocationFieldQuirks } = applyAllocationFieldQuirks(
    [...namedFixedEntrySets.flat(), ...namedMobileEntries],
    allQuirks,
  );
  const quirkedGroups = splitAt(quirkedEntries, namedEntrySetSizes);
  const quirkedFixedEntrySets = quirkedGroups.slice(0, -1);
  const quirkedMobileEntries = quirkedGroups[quirkedGroups.length - 1];

  const quirks: unknown[] = [...organizationNameQuirks, ...allocationFieldQuirks];
  console.log(`  applied ${quirks.length} quirk(s)`);

  logStage(4, 'Compiling range-index tables (fixed/mobile)...');
  const fixed = mergeCodeTables(quirkedFixedEntrySets.map(buildRangeIndex));
  const mobile = buildRangeIndex(quirkedMobileEntries);
  console.log(`  ${fixed.o.length} fixed-line operator(s), ${mobile.o.length} mobile operator(s)`);

  logStage(5, 'Resolving timezones (OSM Overpass, cached on disk)...');
  const timezoneResult = await fetchSubjectTimezones({ cacheDir: osmCacheDir, refresh: refreshTimezones });
  console.log(
    `  ${timezoneResult.matchedFromOsm.length} matched from OSM, ${timezoneResult.filledFromFallback.length} filled from fallback, ${timezoneResult.unresolved.length} unresolved`,
  );

  logStage(6, `Writing dataset to ${outputDir} and reports alongside it...`);
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
  // One canonical name per INN across both tables - the public operators index
  // (getOperators / getOperatorByInn). Sorted by INN for stable diffs between rebuilds.
  writeJson(
    path.join(outputDir, 'operators.json'),
    Object.fromEntries([...canonicalNames.entries()].sort(([a], [b]) => a.localeCompare(b))),
  );
  writeJson(path.join(outputDir, 'timezones.json'), timezoneResult.timezones);
  const dataFiles = ['fixed.json', 'mobile.json', 'regions.json', 'operators.json', 'timezones.json'] as const;
  writeJson(path.join(outputDir, 'meta.json'), {
    version: DATASET_VERSION,
    builtAt: new Date().toISOString(),
    files: dataFiles.map((file) => fileMeta(path.join(outputDir, file), file)),
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
  writeFormattedJson(path.join(reportsDir, 'unmapped-regions.json'), unmappedRegions);
  writeFormattedJson(path.join(reportsDir, 'discrepancies.json'), discrepancies);
  writeFormattedJson(path.join(reportsDir, 'quirks.json'), quirks);

  return { unmappedRegions, discrepancies, quirks };
}

/** Splits `items` into consecutive groups of the given `sizes`, in order. */
function splitAt<T>(items: T[], sizes: number[]): T[][] {
  let offset = 0;
  return sizes.map((size) => {
    const group = items.slice(offset, offset + size);
    offset += size;
    return group;
  });
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

/** Merges several compiled code tables (e.g. ABC-3xx/4xx/8xx) into one, remapping string-table indices. Operator INNs are deduped across tables; region-sets and settlements are concatenated with offsets. Codes are expected not to overlap between tables (each ABC/DEF file covers a disjoint set of 3-digit codes). */
function mergeCodeTables(tables: CompiledCodeTable[]): CompiledCodeTable {
  const merged: CompiledCodeTable = { o: [], r: [], p: [], c: {} };
  const operatorIndex = new Map<string, number>();

  function remapOperator(inn: string): number {
    let idx = operatorIndex.get(inn);
    if (idx === undefined) {
      idx = merged.o.length;
      merged.o.push(inn);
      operatorIndex.set(inn, idx);
    }
    return idx;
  }

  for (const table of tables) {
    const operatorRemap = table.o.map(remapOperator);
    const regionSetOffset = merged.r.length;
    const settlementOffset = merged.p.length;
    merged.r.push(...table.r);
    merged.p.push(...table.p);
    for (const [code, blocks] of Object.entries(table.c)) {
      merged.c[code] = blocks.map((block): CompiledBlock => {
        const o = operatorRemap[block[2]];
        if (block.length === 5) {
          return [block[0], block[1], o, block[3] + regionSetOffset, block[4] + settlementOffset];
        }
        return [block[0], block[1], o, block[3] + regionSetOffset];
      });
    }
  }
  return merged;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data));
}

/** For reports/*.json (not the published dataset) - these are read by humans, not bundled, so pretty-print them. */
function writeFormattedJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function fileMeta(filePath: string, name: string): { file: string; sha256: string } {
  const content = readFileSync(filePath);
  return { file: name, sha256: createHash('sha256').update(content).digest('hex') };
}
