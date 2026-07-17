/** `[start, end, operatorIdx, regionSetIdx]` or `[start, end, operatorIdx, regionSetIdx, settlementIdx]`. */
export type Block =
  | [s: number, e: number, o: number, r: number]
  | [s: number, e: number, o: number, r: number, p: number];

/** On-disk/compiled table shape - single-letter keys, array-of-tuples throughout, to minimize the published JSON size. */
export interface CompiledCodeTable {
  /** operators, as [name, inn] tuples */
  o: [string, string][];
  /** deduped region-slug sets */
  r: string[][];
  /** deduped settlement names */
  p: string[];
  /** 3-digit ABC/DEF code -> sorted, merged blocks */
  c: Record<string, Block[]>;
}

export interface SakhaDistrictOverride {
  default: string;
  byDistrict: Record<string, string>;
}

export type TimezoneEntry = string | SakhaDistrictOverride;

export interface FederalSubject {
  slug: string;
  name: string;
  nameLatin: string;
}

/** The two optional lookup tables - pick which ones to load/include; see `LoadDatasetOptions`/`RuPhoneBaseOptions`. */
export type TableName = 'fixed' | 'mobile';

export interface Dataset {
  /** ABC-3xx/4xx/8xx (fixed-line). Omit to exclude fixed-line lookups entirely (e.g. to skip loading/bundling `fixed.json`, by far the largest table). */
  fixed?: CompiledCodeTable;
  /** DEF-9xx (mobile). Omit to exclude mobile lookups. */
  mobile?: CompiledCodeTable;
  regions: FederalSubject[];
  timezones: Record<string, TimezoneEntry>;
  meta: Record<string, unknown>;
}

export type NumberType = 'fixed' | 'mobile';

/** A federal subject (or the non-geographic "all-russia" pseudo-entry), as returned by `getRegions()` and embedded in lookup results. */
export interface RegionInfo {
  slug: string;
  name: string;
  nameLatin: string;
  timezone?: string;
}

export interface LookupResult {
  input: string;
  /** 11-digit normalized number (e.g. "74951234567"), or null if the input couldn't be parsed. */
  normalized: string | null;
  valid: boolean;
  type?: NumberType;
  /** 3-digit ABC/DEF code. */
  code?: string;
  operator?: string;
  inn?: string;
  /**
   * Federal subject(s) this allocation applies to. Empty when `nationwide` is
   * true and the registry names no specific subject at all; otherwise, for
   * a nationwide number, may still list a broad, non-authoritative set of
   * subjects the registry happens to record for this block - either way it
   * is not a reliable "home region" for the number and should be treated as
   * informational only.
   */
  region?: RegionInfo[];
  /** Settlement/locality name (city, town, village...), when the source row named one specific installation location. Never set when `nationwide` is true. */
  settlement?: string;
  /** True for federal/non-geographic numbers under codes 800-809 (8-800 toll-free, televoting, etc.) - these have no single home region, so `region`/`settlement` are not meaningful and `timezone` is never set. */
  nationwide?: boolean;
  /** Resolved timezone for this allocation - every real allocation observed in the registry falls within a single timezone (see resolveTimezone in lookup.ts). Unset for nationwide numbers or when no region resolves to a known timezone. */
  timezone?: string;
  reason?: 'invalid-format' | 'unassigned';
}
