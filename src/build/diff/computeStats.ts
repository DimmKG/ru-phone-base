import type { AllocationCounts, AllocationDiffResult } from './diffAllocations.js';
import type { KindCounts, UnmappedRegionsDiff } from './diffReports.js';
import type { DatasetSnapshot } from './loadSnapshot.js';

export interface DiffStats {
  generatedAt: string;
  /** Date portion of the new build's meta.builtAt - the closest available proxy for "registry snapshot date," since the raw CSVs carry no explicit as-of date of their own. */
  snapshotDate: string;
  sourceFiles: { file: string; shaBefore: string | null; shaAfter: string; changed: boolean }[];
  allocations: {
    fixed: AllocationCounts;
    mobile: AllocationCounts;
    total: AllocationCounts;
  };
  /** Undefined when reports weren't available for both snapshots being compared - see loadSnapshot's `reportsDir`. */
  discrepancies?: Record<string, KindCounts>;
  unmappedRegions?: UnmappedRegionsDiff;
}

export function computeStats(
  oldSnapshot: DatasetSnapshot,
  newSnapshot: DatasetSnapshot,
  allocDiff: AllocationDiffResult,
  discrepancyStats: Record<string, KindCounts> | undefined,
  unmappedStats: UnmappedRegionsDiff | undefined,
): DiffStats {
  const oldByFile = new Map(oldSnapshot.meta.sourceFiles.map((f) => [f.file, f.sha256]));
  const sourceFiles = newSnapshot.meta.sourceFiles.map((f) => {
    const shaBefore = oldByFile.get(f.file) ?? null;
    return { file: f.file, shaBefore, shaAfter: f.sha256, changed: shaBefore !== f.sha256 };
  });
  return {
    generatedAt: new Date().toISOString(),
    snapshotDate: (newSnapshot.meta.builtAt || new Date().toISOString()).slice(0, 10),
    sourceFiles,
    allocations: {
      fixed: allocDiff.countsByType.fixed,
      mobile: allocDiff.countsByType.mobile,
      total: sumCounts(allocDiff.countsByType.fixed, allocDiff.countsByType.mobile),
    },
    ...(discrepancyStats !== undefined ? { discrepancies: discrepancyStats } : {}),
    ...(unmappedStats !== undefined ? { unmappedRegions: unmappedStats } : {}),
  };
}

function sumCounts(a: AllocationCounts, b: AllocationCounts): AllocationCounts {
  return {
    added: a.added + b.added,
    removed: a.removed + b.removed,
    changedData: a.changedData + b.changedData,
    changedTimezone: a.changedTimezone + b.changedTimezone,
    unchanged: a.unchanged + b.unchanged,
  };
}
