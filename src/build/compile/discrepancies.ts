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

export interface DuplicateInnEntry {
  kind: 'duplicate-inn';
  inn: string;
  /** The name kept for this INN - the first encountered variant that isn't ALL-CAPS, or the first encountered variant if every one of them is. */
  canonicalName: string;
  /** Other names the registry uses for the same INN, sorted for stable output. */
  otherNames: string[];
  /** True when every entry in `otherNames` is just a case variant of `canonicalName` (safe to fold away); false means at least one name genuinely differs (e.g. an abbreviation) and needs a human look. */
  caseOnly: boolean;
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

function isAllCaps(name: string): boolean {
  return name === name.toUpperCase();
}

/** First non-ALL-CAPS name in registry-encounter order, or the first name if every variant is ALL-CAPS. No attempt is made to reconstruct "proper" casing. */
function pickCanonicalName(names: string[]): string {
  return names.find((name) => !isAllCaps(name)) ?? names[0];
}

/** Groups the distinct operator names seen for each INN, in first-encountered order. */
function collectNamesByInn(entries: FlatEntry[]): Map<string, string[]> {
  const namesByInn = new Map<string, string[]>();
  const seenByInn = new Map<string, Set<string>>();
  for (const entry of entries) {
    let seenNames = seenByInn.get(entry.inn);
    if (!seenNames) {
      seenNames = new Set();
      seenByInn.set(entry.inn, seenNames);
      namesByInn.set(entry.inn, []);
    }
    if (!seenNames.has(entry.operator)) {
      seenNames.add(entry.operator);
      namesByInn.get(entry.inn)!.push(entry.operator);
    }
  }
  return namesByInn;
}

/**
 * Finds INNs claimed under more than one distinct operator name across the
 * whole registry - typically an ALL-CAPS vs mixed-case spelling of the same
 * legal entity, occasionally a genuine abbreviation/alternate name. This is
 * the audit trail for what `resolveCanonicalOperatorNames` folds away when
 * compiling the operators table: it only records the conflict against the
 * original (pre-fold) entries, it does not merge or rewrite anything itself.
 */
export function findDuplicateInnOperators(entries: FlatEntry[]): DuplicateInnEntry[] {
  const namesByInn = collectNamesByInn(entries);

  const result: DuplicateInnEntry[] = [];
  for (const [inn, names] of namesByInn) {
    if (names.length < 2) continue;
    const canonicalName = pickCanonicalName(names);
    const otherNames = names.filter((name) => name !== canonicalName).sort((a, b) => a.localeCompare(b, 'ru'));
    const caseOnly = otherNames.every((name) => name.toUpperCase() === canonicalName.toUpperCase());
    result.push({ kind: 'duplicate-inn', inn, canonicalName, otherNames, caseOnly });
  }
  return result.sort((a, b) => a.inn.localeCompare(b.inn));
}

/**
 * Maps every INN in the registry to a single canonical operator name (see
 * `pickCanonicalName`), so the operators table gets one entry per real-world
 * entity instead of one per spelling. Apply to entries *before*
 * `buildRangeIndex`/`flattenRows`-derived tables are compiled; run
 * `findDuplicateInnOperators` on the original entries first if you need the
 * audit trail of what got folded.
 */
export function resolveCanonicalOperatorNames(entries: FlatEntry[]): Map<string, string> {
  const namesByInn = collectNamesByInn(entries);
  const canonicalNames = new Map<string, string>();
  for (const [inn, names] of namesByInn) {
    canonicalNames.set(inn, pickCanonicalName(names));
  }
  return canonicalNames;
}

/** Rewrites each entry's `operator` to its INN's canonical spelling (see `resolveCanonicalOperatorNames`); leaves everything else untouched. */
export function applyCanonicalOperatorNames(entries: FlatEntry[], canonicalNames: Map<string, string>): FlatEntry[] {
  return entries.map((entry) => {
    const canonical = canonicalNames.get(entry.inn);
    return canonical !== undefined && canonical !== entry.operator ? { ...entry, operator: canonical } : entry;
  });
}
