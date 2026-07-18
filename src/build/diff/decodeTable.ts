import type { CompiledCodeTable, Dataset, NumberType } from '../../types.js';
import { decodeBlock, timezoneFor } from '../../lookup.js';

export interface DecodedAllocation {
  type: NumberType;
  code: string;
  from: number;
  to: number;
  operator: string;
  inn: string;
  /** Sorted region slugs, excluding the "all-russia" pseudo-slug. */
  regions: string[];
  settlement?: string;
  nationwide: boolean;
  /** Resolved timezone, mirroring lookup.ts's resolveTimezone: unset for nationwide allocations or when no listed region resolves to a known timezone. */
  timezone?: string;
}

/** Decodes every block of a compiled table into a flat, human-readable allocation list - the counterpart to buildRangeIndex, used to diff two dataset snapshots. */
export function decodeTable(
  table: CompiledCodeTable,
  type: NumberType,
  timezones: Dataset['timezones'],
): DecodedAllocation[] {
  const result: DecodedAllocation[] = [];
  for (const [code, blocks] of Object.entries(table.c)) {
    for (const block of blocks) {
      const decoded = decodeBlock(table, block, code);
      const timezone = decoded.nationwide
        ? undefined
        : firstTimezone(decoded.regionSlugs, decoded.settlement, timezones);
      result.push({
        type,
        code,
        from: block[0],
        to: block[1],
        operator: decoded.operator,
        inn: decoded.inn,
        regions: decoded.regionSlugs,
        ...(decoded.settlement !== undefined ? { settlement: decoded.settlement } : {}),
        nationwide: decoded.nationwide,
        ...(timezone !== undefined ? { timezone } : {}),
      });
    }
  }
  return result;
}

function firstTimezone(
  slugs: string[],
  settlement: string | undefined,
  timezones: Dataset['timezones'],
): string | undefined {
  for (const slug of slugs) {
    const tz = timezoneFor(timezones, slug, settlement);
    if (tz) return tz;
  }
  return undefined;
}
