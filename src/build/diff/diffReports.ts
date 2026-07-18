export interface KindCounts {
  before: number;
  after: number;
  delta: number;
}

export function diffDiscrepancyCounts(
  oldList: { kind: string }[],
  newList: { kind: string }[],
): Record<string, KindCounts> {
  const before = countByKind(oldList);
  const after = countByKind(newList);
  const kinds = new Set([...before.keys(), ...after.keys()]);
  const result: Record<string, KindCounts> = {};
  for (const kind of kinds) {
    const b = before.get(kind) ?? 0;
    const a = after.get(kind) ?? 0;
    result[kind] = { before: b, after: a, delta: a - b };
  }
  return result;
}

function countByKind(list: { kind: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return counts;
}

export interface UnmappedRegionsDiff {
  before: number;
  after: number;
  newlyUnmapped: string[];
  newlyResolved: string[];
}

export function diffUnmappedRegions(oldTokens: string[], newTokens: string[]): UnmappedRegionsDiff {
  const oldSet = new Set(oldTokens);
  const newSet = new Set(newTokens);
  return {
    before: oldTokens.length,
    after: newTokens.length,
    newlyUnmapped: newTokens.filter((t) => !oldSet.has(t)).sort((a, b) => a.localeCompare(b, 'ru')),
    newlyResolved: oldTokens.filter((t) => !newSet.has(t)).sort((a, b) => a.localeCompare(b, 'ru')),
  };
}
