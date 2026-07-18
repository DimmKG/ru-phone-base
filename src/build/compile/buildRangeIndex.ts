import type { NormalizedRow } from '../parse/types.js';
import type { RegionMismatch } from '../parse/regionNormalize.js';
import type { Block, CompiledCodeTable } from '../../types.js';

// The compiled/on-disk shape (Block, CompiledCodeTable) is defined once in
// src/types.ts - the runtime module that actually reads this data - and reused
// here, so the builder and the reader can never drift apart.
export type { CompiledCodeTable };
export type CompiledBlock = Block;

/** One allocation range, flattened out of a NormalizedRow's `codes[]`. */
export interface FlatEntry {
  code: string;
  from: number;
  to: number;
  operator: string;
  inn: string;
  regions: string[];
  settlement?: string;
  sourceFile: NormalizedRow['sourceFile'];
  regionMismatch?: RegionMismatch;
}

export function flattenRows(rows: NormalizedRow[]): FlatEntry[] {
  const entries: FlatEntry[] = [];
  for (const row of rows) {
    for (const code of row.codes) {
      entries.push({
        code,
        from: row.range.from,
        to: row.range.to,
        operator: row.operator,
        inn: row.inn,
        regions: row.regions,
        settlement: row.settlement,
        sourceFile: row.sourceFile,
        regionMismatch: row.regionMismatch,
      });
    }
  }
  return entries;
}

interface WorkingAllocation {
  from: number;
  to: number;
  o: number;
  r: number;
  p?: number;
}

function allocationKey(item: Pick<WorkingAllocation, 'o' | 'r' | 'p'>): string {
  return `${item.o}:${item.r}:${item.p ?? ''}`;
}

function toCompiledBlock(item: WorkingAllocation): CompiledBlock {
  return item.p !== undefined ? [item.from, item.to, item.o, item.r, item.p] : [item.from, item.to, item.o, item.r];
}

/**
 * Compiles flattened per-code allocation ranges into a sorted, merged array
 * of blocks per code, with operator/region/settlement string tables deduped.
 * `От`/`До` in the source registry are already explicit inclusive ranges (no
 * decade math needed) and were verified not to overlap within a code across
 * the sampled files; entries sharing the *exact same* range keep the first
 * allocation in registry order (see findParallelAllocationConflicts).
 */
export function buildRangeIndex(entries: FlatEntry[]): CompiledCodeTable {
  const operators: string[] = [];
  const operatorIndex = new Map<string, number>();
  const regionSets: string[][] = [];
  const regionSetIndex = new Map<string, number>();
  const settlements: string[] = [];
  const settlementIndex = new Map<string, number>();

  function operatorIdx(inn: string): number {
    let idx = operatorIndex.get(inn);
    if (idx === undefined) {
      idx = operators.length;
      operators.push(inn);
      operatorIndex.set(inn, idx);
    }
    return idx;
  }

  function regionSetIdx(regions: string[]): number {
    const sorted = [...regions].sort();
    const key = sorted.join(',');
    let idx = regionSetIndex.get(key);
    if (idx === undefined) {
      idx = regionSets.length;
      regionSets.push(sorted);
      regionSetIndex.set(key, idx);
    }
    return idx;
  }

  function settlementIdx(settlement: string): number {
    let idx = settlementIndex.get(settlement);
    if (idx === undefined) {
      idx = settlements.length;
      settlements.push(settlement);
      settlementIndex.set(settlement, idx);
    }
    return idx;
  }

  const perCode = new Map<string, FlatEntry[]>();
  for (const entry of entries) {
    let list = perCode.get(entry.code);
    if (!list) {
      list = [];
      perCode.set(entry.code, list);
    }
    list.push(entry);
  }

  const codes: Record<string, CompiledBlock[]> = {};
  for (const [code, list] of perCode) {
    list.sort((a, b) => a.from - b.from || a.to - b.to);

    const byRange = new Map<string, WorkingAllocation>();
    for (const entry of list) {
      const o = operatorIdx(entry.inn);
      const r = regionSetIdx(entry.regions);
      const p = entry.settlement ? settlementIdx(entry.settlement) : undefined;
      const key = `${entry.from}-${entry.to}`;
      const alloc: WorkingAllocation = { from: entry.from, to: entry.to, o, r, p };
      const existing = byRange.get(key);
      if (!existing) {
        byRange.set(key, alloc);
      } else if (allocationKey(existing) !== allocationKey(alloc)) {
        continue; // parallel allocation - first registry row wins; logged via findParallelAllocationConflicts
      }
    }

    const groups = [...byRange.values()].sort((a, b) => a.from - b.from);
    const blocks: WorkingAllocation[] = [];
    for (const group of groups) {
      const last = blocks[blocks.length - 1];
      if (last && last.to === group.from - 1 && allocationKey(last) === allocationKey(group)) {
        last.to = group.to;
      } else {
        blocks.push({ ...group });
      }
    }
    codes[code] = blocks.map(toCompiledBlock);
  }

  return { o: operators, r: regionSets, p: settlements, c: codes };
}

/** Binary search for the block covering `n` within a code's sorted blocks. */
export function findBlock(blocks: CompiledBlock[], n: number): CompiledBlock | undefined {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const block = blocks[mid];
    if (n < block[0]) hi = mid - 1;
    else if (n > block[1]) lo = mid + 1;
    else return block;
  }
  return undefined;
}
