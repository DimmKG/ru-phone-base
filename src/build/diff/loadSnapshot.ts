import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CompiledCodeTable, Dataset } from '../../types.js';
import { decodeTable, type DecodedAllocation } from './decodeTable.js';

export interface SnapshotMeta {
  builtAt: string;
  sourceFiles: { file: string; sha256: string }[];
}

export interface DatasetSnapshot {
  meta: SnapshotMeta;
  /** fixed + mobile combined. */
  allocations: DecodedAllocation[];
  /** Undefined when `reportsDir` wasn't supplied at all - distinct from "compared and found zero". */
  discrepancies?: { kind: string; [k: string]: unknown }[];
  unmappedRegions?: string[];
}

const EMPTY_SNAPSHOT: DatasetSnapshot = {
  meta: { builtAt: '', sourceFiles: [] },
  allocations: [],
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

/**
 * Loads a compiled dataset + (optionally) its reports into decoded, diff-ready
 * form. If `dataDir` has no meta.json (e.g. a genuinely first-ever run with no
 * prior baseline), returns an empty snapshot with a warning instead of
 * throwing - every allocation on the "new" side then shows up as added.
 *
 * `reportsDir` is optional - pass nothing to skip discrepancy/unmapped-region
 * comparison entirely (e.g. when only the compiled dataset is available, not
 * the sibling reports/ directory).
 */
export function loadSnapshot(dataDir: string, reportsDir?: string): DatasetSnapshot {
  if (!existsSync(path.join(dataDir, 'meta.json'))) {
    console.warn(`No dataset found at ${dataDir} - treating as an empty baseline.`);
    return EMPTY_SNAPSHOT;
  }
  const fixed = readJson<CompiledCodeTable>(path.join(dataDir, 'fixed.json'));
  const mobile = readJson<CompiledCodeTable>(path.join(dataDir, 'mobile.json'));
  const timezones = readJson<Dataset['timezones']>(path.join(dataDir, 'timezones.json'));
  const meta = readJson<SnapshotMeta>(path.join(dataDir, 'meta.json'));
  const allocations = [...decodeTable(fixed, 'fixed', timezones), ...decodeTable(mobile, 'mobile', timezones)];
  const discrepancies =
    reportsDir && existsSync(path.join(reportsDir, 'discrepancies.json'))
      ? readJson<{ kind: string; [k: string]: unknown }[]>(path.join(reportsDir, 'discrepancies.json'))
      : undefined;
  const unmappedRegions =
    reportsDir && existsSync(path.join(reportsDir, 'unmapped-regions.json'))
      ? readJson<string[]>(path.join(reportsDir, 'unmapped-regions.json'))
      : undefined;
  return { meta, allocations, discrepancies, unmappedRegions };
}
