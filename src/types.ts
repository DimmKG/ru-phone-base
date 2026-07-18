/** `[start, end, operatorIdx, regionSetIdx]` or `[start, end, operatorIdx, regionSetIdx, settlementIdx]`. */
export type Block =
  | [s: number, e: number, o: number, r: number]
  | [s: number, e: number, o: number, r: number, p: number];

/** On-disk/compiled table shape - single-letter keys, array-of-tuples throughout, to minimize the published JSON size. */
export interface CompiledCodeTable {
  /** Interned operator INNs - block operatorIdx points here; resolve the display name via `Dataset.operators[inn]`. */
  o: string[];
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

/** Canonical operator name keyed by INN - the on-disk `operators.json` shape. */
export type OperatorsIndex = Record<string, string>;

/** An operator (legal entity) as returned by `getOperators()` / `getOperatorByInn()`. */
export interface OperatorInfo {
  name: string;
  inn: string;
}

/** The two optional lookup tables - pick which ones to load/include; see `LoadDatasetOptions`/`RuPhoneBaseOptions`. */
export type TableName = 'fixed' | 'mobile';

export interface Dataset {
  /** ABC-3xx/4xx/8xx (fixed-line). Omit to exclude fixed-line lookups entirely (e.g. to skip loading/bundling `fixed.json`, by far the largest table). */
  fixed?: CompiledCodeTable;
  /** DEF-9xx (mobile). Omit to exclude mobile lookups. */
  mobile?: CompiledCodeTable;
  regions: FederalSubject[];
  /** Canonical operator names keyed by INN (one entry per legal entity across fixed + mobile). */
  operators: OperatorsIndex;
  timezones: Record<string, TimezoneEntry>;
  meta: DatasetMeta;
}

/**
 * On-disk format version written into `meta.json`. Bump when the compiled
 * JSON shape changes in a way that older library builds cannot read (or vice
 * versa). Checked by `loadDataset` / `createRuPhoneBaseFromData`.
 */
export const DATASET_VERSION = 1;

export interface DatasetMeta {
  /** Must equal `DATASET_VERSION` of the library loading this dataset. */
  version: number;
  /**
   * SHA-256 digests of the compiled data files (everything except `meta.json`
   * itself). Verified by `loadDataset` against on-disk bytes.
   */
  files: { file: string; sha256: string }[];
  builtAt?: string;
  sourceFiles?: { file: string; sha256: string }[];
  rowCounts?: Record<string, number>;
  timezones?: {
    matchedFromOsm?: number;
    filledFromFallback?: number;
    unresolved?: string[];
  };
  [key: string]: unknown;
}

/** Compiled data files whose SHA-256 is recorded in `meta.files` (meta.json is excluded). */
export const DATASET_DATA_FILES = [
  'fixed.json',
  'mobile.json',
  'regions.json',
  'operators.json',
  'operators-fixed.json',
  'operators-mobile.json',
  'timezones.json',
] as const;

export type DatasetDataFile = (typeof DATASET_DATA_FILES)[number];

export class DatasetVersionError extends Error {
  readonly expected: number;
  readonly actual: number | undefined;

  constructor(actual: number | undefined) {
    const detail =
      actual === undefined
        ? 'dataset meta.version is missing (rebuild with a current ru-phone-base-build, or upgrade the library)'
        : `dataset meta.version is ${actual}, but this library expects ${DATASET_VERSION}`;
    super(detail);
    this.name = 'DatasetVersionError';
    this.expected = DATASET_VERSION;
    this.actual = actual;
  }
}

export class DatasetIntegrityError extends Error {
  readonly file?: string;
  readonly expected?: string;
  readonly actual?: string;

  constructor(
    kind: 'missing-manifest' | 'missing-hash' | 'mismatch',
    file?: string,
    expected?: string,
    actual?: string,
  ) {
    let detail: string;
    if (kind === 'missing-manifest') {
      detail = 'dataset meta.files is missing or empty (rebuild with a current ru-phone-base-build)';
    } else if (kind === 'missing-hash') {
      detail = `dataset meta.files has no sha256 for ${file}`;
    } else {
      detail = `dataset file ${file} sha256 mismatch (expected ${expected}, got ${actual})`;
    }
    super(detail);
    this.name = 'DatasetIntegrityError';
    this.file = file;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Thrown when the operators index does not cover INNs referenced by the loaded
 * fixed/mobile tables — typically because the wrong operators mini-base was
 * paired with a table (e.g. `operators-mobile.json` with `fixed.json`).
 */
export class DatasetOperatorsError extends Error {
  readonly tables: TableName[];
  readonly missingInn: string;

  constructor(tables: TableName[], missingInn: string) {
    super(
      `operators index is missing INN ${missingInn} required by the loaded ${tables.join('+')} table(s) ` +
        `(wrong operators mini-base?)`,
    );
    this.name = 'DatasetOperatorsError';
    this.tables = tables;
    this.missingInn = missingInn;
  }
}

/** Throws `DatasetVersionError` when `meta.version` is missing or does not match `DATASET_VERSION`. */
export function assertDatasetVersion(meta: { version?: unknown } | null | undefined): asserts meta is DatasetMeta {
  const actual = meta && typeof meta === 'object' ? meta.version : undefined;
  if (typeof actual !== 'number' || actual !== DATASET_VERSION) {
    throw new DatasetVersionError(typeof actual === 'number' ? actual : undefined);
  }
}

/**
 * Ensures every INN referenced by the loaded fixed/mobile tables exists in
 * `dataset.operators`. Throws on the first missing INN (wrong operators mini-base).
 */
export function assertOperatorsCoverTables(dataset: Dataset): void {
  const tables: TableName[] = [
    ...(dataset.fixed ? (['fixed'] as const) : []),
    ...(dataset.mobile ? (['mobile'] as const) : []),
  ];
  for (const table of [dataset.fixed, dataset.mobile]) {
    if (!table) continue;
    for (const inn of table.o) {
      if (dataset.operators[inn] === undefined) {
        throw new DatasetOperatorsError(tables, inn);
      }
    }
  }
}

export type NumberType = 'fixed' | 'mobile';

/** A federal subject (or the non-geographic "all-russia" pseudo-entry), as returned by `getRegions()` and embedded in lookup results. */
export interface RegionInfo {
  slug: string;
  name: string;
  nameLatin: string;
  timezone?: string;
}

export interface PhoneNumberInfo {
  type: NumberType;
  /** 3-digit ABC/DEF code. */
  code: string;
  operator: string;
  inn: string;
  /**
   * Federal subject(s) this allocation applies to. Empty when `nationwide` is
   * true and the registry names no specific subject at all; otherwise, for
   * a nationwide number, may still list a broad, non-authoritative set of
   * subjects the registry happens to record for this block - either way it
   * is not a reliable "home region" for the number and should be treated as
   * informational only.
   */
  region: RegionInfo[];
  /** Settlement/locality name (city, town, village...), when the source row named one specific installation location. Never set when `nationwide` is true. */
  settlement?: string;
  /** True for federal/non-geographic numbers under codes 800-809 (8-800 toll-free, televoting, etc.) - these have no single home region, so `region`/`settlement` are not meaningful and `timezone` is never set. */
  nationwide: boolean;
  /** Resolved timezone for this allocation - every real allocation observed in the registry falls within a single timezone (see resolveTimezone in lookup.ts). Unset for nationwide numbers or when no region resolves to a known timezone. */
  timezone?: string;
}

export interface LookupSuccess {
  input: string;
  /** 11-digit normalized number (e.g. "74951234567"). */
  normalized: string;
  valid: true;
  /** The resolved region/operator/timezone info for the number. */
  data: PhoneNumberInfo;
}

export interface LookupFailure {
  input: string;
  /** 11-digit normalized number, or null if the input couldn't even be parsed into one. */
  normalized: string | null;
  valid: false;
  reason: 'invalid-format' | 'unassigned';
}

/** Discriminate on `valid`: when true, `data` is guaranteed present; when false, `data` doesn't exist on the type at all. */
export type LookupResult = LookupSuccess | LookupFailure;
