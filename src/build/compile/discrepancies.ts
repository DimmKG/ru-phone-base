import type { FlatEntry } from './buildRangeIndex.js';

export interface IntraFileConflict {
  kind: 'intra-file';
  sourceFile: string;
  code: string;
  from: number;
  to: number;
  region: string;
  operators: { operator: string; inn: string }[];
}

export interface ParallelAllocationConflict {
  kind: 'parallel-allocation';
  sourceFile: string;
  code: string;
  from: number;
  to: number;
  kept: { operator: string; inn: string; regions: string[]; settlement?: string };
  dropped: { operator: string; inn: string; regions: string[]; settlement?: string }[];
}

export interface RegionMismatchEntry {
  kind: 'gar-region-mismatch';
  sourceFile: string;
  code: string;
  from: number;
  to: number;
  garRegion: string;
  regionColumnValue: string;
}

function allocationSignature(entry: FlatEntry): string {
  return JSON.stringify({
    operator: entry.operator,
    inn: entry.inn,
    regions: [...entry.regions].sort(),
    settlement: entry.settlement ?? null,
  });
}

/**
 * Finds the exact same [code, from, to] slot claimed by more than one distinct
 * allocation in registry order. The build keeps the first row and drops the
 * rest (see buildRangeIndex.ts).
 */
export function findParallelAllocationConflicts(entries: FlatEntry[]): ParallelAllocationConflict[] {
  const bySlot = new Map<string, FlatEntry[]>();
  for (const entry of entries) {
    const key = `${entry.code} ${entry.from}-${entry.to}`;
    let list = bySlot.get(key);
    if (!list) {
      list = [];
      bySlot.set(key, list);
    }
    list.push(entry);
  }

  const conflicts: ParallelAllocationConflict[] = [];
  for (const list of bySlot.values()) {
    const signatures = new Map<string, FlatEntry>();
    for (const entry of list) {
      signatures.set(allocationSignature(entry), entry);
    }
    if (signatures.size < 2) continue;

    const unique = [...signatures.values()];
    const [kept, ...dropped] = unique;
    conflicts.push({
      kind: 'parallel-allocation',
      sourceFile: kept.sourceFile,
      code: kept.code,
      from: kept.from,
      to: kept.to,
      kept: {
        operator: kept.operator,
        inn: kept.inn,
        regions: kept.regions,
        ...(kept.settlement !== undefined ? { settlement: kept.settlement } : {}),
      },
      dropped: dropped.map((entry) => ({
        operator: entry.operator,
        inn: entry.inn,
        regions: entry.regions,
        ...(entry.settlement !== undefined ? { settlement: entry.settlement } : {}),
      })),
    });
  }
  return conflicts;
}

/**
 * Finds ranges where the *same specific region* is claimed by more than one
 * operator within the same source file, for the exact same [from, to] slot -
 * a genuine contradiction, since one region's slice of a range can't
 * legitimately belong to two operators at once.
 */
export function findIntraFileConflicts(entries: FlatEntry[]): IntraFileConflict[] {
  const bySlot = new Map<string, FlatEntry[]>();
  for (const entry of entries) {
    const key = `${entry.code} ${entry.from}-${entry.to}`;
    let list = bySlot.get(key);
    if (!list) {
      list = [];
      bySlot.set(key, list);
    }
    list.push(entry);
  }

  const conflicts: IntraFileConflict[] = [];
  for (const list of bySlot.values()) {
    if (list.length < 2) continue;

    const operatorsByRegion = new Map<string, Map<string, { operator: string; inn: string }>>();
    for (const entry of list) {
      for (const region of entry.regions) {
        let ops = operatorsByRegion.get(region);
        if (!ops) {
          ops = new Map();
          operatorsByRegion.set(region, ops);
        }
        ops.set(`${entry.operator}|${entry.inn}`, { operator: entry.operator, inn: entry.inn });
      }
    }

    const [first] = list;
    for (const [region, ops] of operatorsByRegion) {
      if (ops.size > 1) {
        conflicts.push({
          kind: 'intra-file',
          sourceFile: first.sourceFile,
          code: first.code,
          from: first.from,
          to: first.to,
          region,
          operators: [...ops.values()],
        });
      }
    }
  }
  return conflicts;
}

/** Collects the Территория-ГАР-vs-Регион disagreements already flagged per-row during normalization (see regionNormalize.ts / parseAbcDef.ts). */
export function collectRegionMismatches(entries: FlatEntry[]): RegionMismatchEntry[] {
  const result: RegionMismatchEntry[] = [];
  for (const entry of entries) {
    if (!entry.regionMismatch) continue;
    result.push({
      kind: 'gar-region-mismatch',
      sourceFile: entry.sourceFile,
      code: entry.code,
      from: entry.from,
      to: entry.to,
      garRegion: entry.regionMismatch.zoneToken,
      regionColumnValue: entry.regionMismatch.placeToken,
    });
  }
  return result;
}
