import type { DecodedAllocation } from './decodeTable.js';
import type { NumberType } from '../../types.js';

export interface AllocationPayload {
  operator: string;
  inn: string;
  regions: string[];
  settlement?: string;
  nationwide: boolean;
  timezone?: string;
}

export interface AllocationChange {
  type: NumberType;
  code: string;
  from: number;
  to: number;
  before: AllocationPayload;
  after: AllocationPayload;
}

export interface TimezoneChange {
  type: NumberType;
  code: string;
  from: number;
  to: number;
  operator: string;
  inn: string;
  regions: string[];
  settlement?: string;
  timezoneBefore?: string;
  timezoneAfter?: string;
}

export interface AllocationCounts {
  added: number;
  removed: number;
  changedData: number;
  changedTimezone: number;
  unchanged: number;
}

export interface AllocationDiffResult {
  added: DecodedAllocation[];
  removed: DecodedAllocation[];
  changed: AllocationChange[];
  timezoneChanged: TimezoneChange[];
  countsByType: Record<NumberType, AllocationCounts>;
}

function key(a: Pick<DecodedAllocation, 'type' | 'code' | 'from' | 'to'>): string {
  return `${a.type}:${a.code}:${a.from}-${a.to}`;
}

/** Deliberately sorts `regions` defensively even though buildRangeIndex already stores sorted region sets - cheap insurance against that invariant changing upstream. */
function dataSignature(a: DecodedAllocation): string {
  return JSON.stringify({
    operator: a.operator,
    inn: a.inn,
    regions: [...a.regions].sort(),
    settlement: a.settlement ?? null,
  });
}

function toPayload(a: DecodedAllocation): AllocationPayload {
  return {
    operator: a.operator,
    inn: a.inn,
    regions: a.regions,
    nationwide: a.nationwide,
    ...(a.settlement !== undefined ? { settlement: a.settlement } : {}),
    ...(a.timezone !== undefined ? { timezone: a.timezone } : {}),
  };
}

function emptyCounts(): AllocationCounts {
  return { added: 0, removed: 0, changedData: 0, changedTimezone: 0, unchanged: 0 };
}

/**
 * Diffs two decoded allocation lists, keyed by (type, code, from, to).
 *
 * Known limitation: this operates on post-merge compiled blocks (see
 * buildRangeIndex's adjacent-range merging), so a change that shifts a merge
 * boundary - e.g. old [100-199 opA] + [200-299 opB] becoming new
 * [100-299 opA] because the second sub-range's operator changed to match the
 * first - shows up as 2 removed + 1 added, not "one sub-range changed."
 * Fixing this would require persisting a pre-merge row-level snapshot across
 * runs, which is out of scope for this tool.
 */
export function diffAllocations(oldAllocs: DecodedAllocation[], newAllocs: DecodedAllocation[]): AllocationDiffResult {
  const oldByKey = new Map(oldAllocs.map((a) => [key(a), a]));
  const newByKey = new Map(newAllocs.map((a) => [key(a), a]));
  const countsByType: Record<NumberType, AllocationCounts> = { fixed: emptyCounts(), mobile: emptyCounts() };

  const added: DecodedAllocation[] = [];
  const removed: DecodedAllocation[] = [];
  const changed: AllocationChange[] = [];
  const timezoneChanged: TimezoneChange[] = [];

  for (const [k, oldA] of oldByKey) {
    if (!newByKey.has(k)) {
      removed.push(oldA);
      countsByType[oldA.type].removed++;
    }
  }

  for (const [k, newA] of newByKey) {
    const oldA = oldByKey.get(k);
    if (!oldA) {
      added.push(newA);
      countsByType[newA.type].added++;
      continue;
    }
    if (dataSignature(oldA) !== dataSignature(newA)) {
      changed.push({
        type: newA.type,
        code: newA.code,
        from: newA.from,
        to: newA.to,
        before: toPayload(oldA),
        after: toPayload(newA),
      });
      countsByType[newA.type].changedData++;
    } else if (oldA.timezone !== newA.timezone) {
      timezoneChanged.push({
        type: newA.type,
        code: newA.code,
        from: newA.from,
        to: newA.to,
        operator: newA.operator,
        inn: newA.inn,
        regions: newA.regions,
        ...(newA.settlement !== undefined ? { settlement: newA.settlement } : {}),
        timezoneBefore: oldA.timezone,
        timezoneAfter: newA.timezone,
      });
      countsByType[newA.type].changedTimezone++;
    } else {
      countsByType[newA.type].unchanged++;
    }
  }

  return { added, removed, changed, timezoneChanged, countsByType };
}
