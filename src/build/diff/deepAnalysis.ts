import type { AllocationChange, AllocationDiffResult } from './diffAllocations.js';
import type { DecodedAllocation } from './decodeTable.js';

/**
 * `diffAllocations`'s `added`/`removed`/`changed` lists are keyed on the exact
 * post-merge block range `(type, code, from, to)` (see its doc comment). A
 * registry-wide event that doesn't touch ranges directly - e.g. re-casing one
 * operator's legal name - still shifts where `buildRangeIndex` merges adjacent
 * blocks, so it can explode into large added+removed pairs instead of a
 * handful of "changed" entries. This module looks past that: it classifies
 * `changed` entries into real vs. cosmetic events, and computes each
 * operator's net capacity change directly from the two full allocation lists
 * (not from added/removed/changed), which cancels the merge-boundary noise
 * automatically - a block that got fragmented but stayed with the same
 * operator nets to zero for that operator either way.
 */

export const CHANGE_CATEGORIES = [
  'inn-change',
  'region-change',
  'case-only',
  'name-change',
  'settlement-wording',
  'case-and-settlement',
  'name-and-settlement',
  'other',
] as const;

export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

const CHANGE_CATEGORY_LABELS: Record<ChangeCategory, string> = {
  'inn-change': 'real handover to another operator (INN changed)',
  'region-change': 'region reassigned (same INN)',
  'case-only': 'cosmetic: operator name re-cased only',
  'name-change': 'operator renamed (not just casing)',
  'settlement-wording': 'cosmetic: settlement wording only',
  'case-and-settlement': 'cosmetic: name casing + settlement wording',
  'name-and-settlement': 'operator renamed + settlement wording changed',
  other: 'unclassified',
};

/** Classifies a same-key allocation change as a real reassignment or registry housekeeping. Checked in this order: INN, then region, then operator-name/settlement wording. */
export function classifyChange(change: AllocationChange): ChangeCategory {
  const { before: b, after: a } = change;
  if (b.inn !== a.inn) return 'inn-change';
  if (regionsKey(b.regions) !== regionsKey(a.regions)) return 'region-change';

  const nameSameExact = b.operator === a.operator;
  const nameSameCaseInsensitive = b.operator.toLowerCase() === a.operator.toLowerCase();
  const settlementSameExact = (b.settlement ?? null) === (a.settlement ?? null);

  if (nameSameExact && settlementSameExact) return 'other'; // unreachable given diffAllocations' dataSignature, kept as a defensive fallback
  if (settlementSameExact) return nameSameCaseInsensitive ? 'case-only' : 'name-change';
  if (nameSameExact) return 'settlement-wording';
  return nameSameCaseInsensitive ? 'case-and-settlement' : 'name-and-settlement';
}

function regionsKey(regions: string[]): string {
  return [...regions].sort().join(',');
}

export interface ChangeCategorySummary {
  total: number;
  counts: Record<ChangeCategory, number>;
  byCategory: Record<ChangeCategory, AllocationChange[]>;
}

export function summarizeChangeCategories(changed: AllocationChange[]): ChangeCategorySummary {
  const byCategory = Object.fromEntries(CHANGE_CATEGORIES.map((cat) => [cat, [] as AllocationChange[]])) as Record<
    ChangeCategory,
    AllocationChange[]
  >;
  for (const change of changed) {
    byCategory[classifyChange(change)].push(change);
  }
  const counts = Object.fromEntries(CHANGE_CATEGORIES.map((cat) => [cat, byCategory[cat].length])) as Record<
    ChangeCategory,
    number
  >;
  return { total: changed.length, counts, byCategory };
}

interface OperatorCapacity {
  inn: string;
  name: string;
  capacity: number;
  blocks: number;
}

function capacityByInn(allocations: DecodedAllocation[]): Map<string, OperatorCapacity> {
  const map = new Map<string, OperatorCapacity>();
  for (const a of allocations) {
    const size = a.to - a.from + 1;
    const existing = map.get(a.inn);
    if (existing) {
      existing.capacity += size;
      existing.blocks += 1;
      existing.name = a.operator; // prefer the most recent name seen (matters when iterating the "new" list)
    } else {
      map.set(a.inn, { inn: a.inn, name: a.operator, capacity: size, blocks: 1 });
    }
  }
  return map;
}

export interface OperatorCapacityMover {
  inn: string;
  name: string;
  capacityBefore: number;
  capacityAfter: number;
  blocksBefore: number;
  blocksAfter: number;
  net: number;
  /** Percent change relative to `capacityBefore`. `null` for a brand-new operator (capacityBefore is 0 - percent change is meaningless there). */
  percentChange: number | null;
}

/**
 * Net capacity change per operator (by INN), computed directly from the two
 * full decoded allocation lists rather than from `diffAllocations`'s
 * added/removed/changed output - see the module doc comment for why that
 * sidesteps the block-merge-boundary artifact. Only operators with a nonzero
 * net are returned, sorted by `|net|` descending.
 */
export function computeOperatorCapacityMovers(
  oldAllocations: DecodedAllocation[],
  newAllocations: DecodedAllocation[],
): OperatorCapacityMover[] {
  const before = capacityByInn(oldAllocations);
  const after = capacityByInn(newAllocations);
  const inns = new Set([...before.keys(), ...after.keys()]);

  const movers: OperatorCapacityMover[] = [];
  for (const inn of inns) {
    const b = before.get(inn);
    const a = after.get(inn);
    const capacityBefore = b?.capacity ?? 0;
    const capacityAfter = a?.capacity ?? 0;
    const net = capacityAfter - capacityBefore;
    if (net === 0) continue;
    movers.push({
      inn,
      name: (a ?? b)!.name,
      capacityBefore,
      capacityAfter,
      blocksBefore: b?.blocks ?? 0,
      blocksAfter: a?.blocks ?? 0,
      net,
      percentChange: capacityBefore > 0 ? (net / capacityBefore) * 100 : null,
    });
  }
  return movers.sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
}

export interface DiscrepancyEntryDiff {
  resolved: Record<string, unknown>[];
  appeared: Record<string, unknown>[];
}

function discrepancySignature(entry: Record<string, unknown>): string {
  return JSON.stringify(entry, Object.keys(entry).sort());
}

/**
 * Diffs two `reports/discrepancies.json` lists entry-by-entry (not just
 * per-kind counts like `diffDiscrepancyCounts`) - useful for seeing exactly
 * *which* discrepancies got resolved or newly appeared, e.g. to confirm a
 * `duplicate-inn` count drop was a genuine name-casing fix and not something
 * papering over a real problem.
 */
export function diffDiscrepancyEntries(
  oldList: { kind: string; [k: string]: unknown }[],
  newList: { kind: string; [k: string]: unknown }[],
): DiscrepancyEntryDiff {
  const oldBySig = new Map(oldList.map((d) => [discrepancySignature(d), d]));
  const newBySig = new Map(newList.map((d) => [discrepancySignature(d), d]));
  const resolved = [...oldBySig.entries()].filter(([sig]) => !newBySig.has(sig)).map(([, d]) => d);
  const appeared = [...newBySig.entries()].filter(([sig]) => !oldBySig.has(sig)).map(([, d]) => d);
  return { resolved, appeared };
}

export interface DeepAnalysisResult {
  allocDiff: AllocationDiffResult;
  changeSummary: ChangeCategorySummary;
  movers: OperatorCapacityMover[];
  discrepancyDiff?: DiscrepancyEntryDiff;
}

function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

function formatSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${formatInt(n)}`;
}

export function renderDeepAnalysisText(result: DeepAnalysisResult, options: { topMovers?: number } = {}): string {
  const topMovers = options.topMovers ?? 15;
  const { allocDiff, changeSummary, movers, discrepancyDiff } = result;
  const lines: string[] = [];

  const { fixed, mobile } = allocDiff.countsByType;
  const total = {
    added: fixed.added + mobile.added,
    removed: fixed.removed + mobile.removed,
    changedData: fixed.changedData + mobile.changedData,
  };
  lines.push('=== Raw diffAllocations counts (fixed / mobile / total) ===');
  lines.push(`  added:   ${fixed.added} / ${mobile.added} / ${total.added}`);
  lines.push(`  removed: ${fixed.removed} / ${mobile.removed} / ${total.removed}`);
  lines.push(`  changed: ${fixed.changedData} / ${mobile.changedData} / ${total.changedData}`);
  lines.push('  (added/removed are often inflated by the block-merge-boundary artifact - see below)', '');

  lines.push(`=== Changed-allocation classification (changed, ${changeSummary.total} total) ===`);
  for (const cat of CHANGE_CATEGORIES) {
    const n = changeSummary.counts[cat];
    if (n === 0) continue;
    lines.push(`  ${String(n).padStart(4)}  ${CHANGE_CATEGORY_LABELS[cat]}`);
  }
  lines.push('');

  lines.push(`=== Top ${Math.min(topMovers, movers.length)} operators by |net capacity change| ===`);
  lines.push('(computed directly from decoded blocks, not from added/removed - immune to the merge artifact)');
  for (const m of movers.slice(0, topMovers)) {
    const pct = m.percentChange === null ? 'new' : `${formatSigned(Math.round(m.percentChange))}%`;
    lines.push(
      `  ${formatSigned(m.net).padStart(8)}  (${pct.padStart(6)})  ${formatInt(m.capacityBefore).padStart(7)} -> ${formatInt(
        m.capacityAfter,
      ).padStart(7)}  INN ${m.inn}  ${m.name}`,
    );
  }
  lines.push('');

  if (discrepancyDiff) {
    lines.push('=== Discrepancies (discrepancies.json): resolved / newly appeared ===');
    if (discrepancyDiff.resolved.length === 0 && discrepancyDiff.appeared.length === 0) {
      lines.push('  no change at the individual-entry level');
    }
    for (const d of discrepancyDiff.resolved) {
      lines.push(`  - resolved: ${JSON.stringify(d)}`);
    }
    for (const d of discrepancyDiff.appeared) {
      lines.push(`  + appeared: ${JSON.stringify(d)}`);
    }
  } else {
    lines.push('=== Discrepancies: not compared (reports/ unavailable for one or both snapshots) ===');
  }
  lines.push('');

  return lines.join('\n');
}
