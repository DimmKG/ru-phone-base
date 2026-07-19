import { loadDataset } from './dataLoader.js';
import { lookupPhoneNumber as lookupInDataset, listRegions, listOperators, findOperatorByInn } from './lookup.js';
import { normalizePhoneNumber } from './phone.js';
import {
  assertDatasetVersion,
  assertOperatorsCoverTables,
  type Dataset,
  type LookupResult,
  type OperatorInfo,
  type RegionInfo,
  type TableName,
} from './types.js';

export type {
  Dataset,
  DatasetMeta,
  LookupResult,
  LookupSuccess,
  LookupFailure,
  PhoneNumberInfo,
  NumberType,
  RegionInfo,
  OperatorInfo,
  OperatorsIndex,
  CompiledCodeTable,
  Block,
  TimezoneEntry,
  SakhaDistrictOverride,
  FederalSubject,
  TableName,
} from './types.js';
export {
  DATASET_VERSION,
  DATASET_DATA_FILES,
  DatasetVersionError,
  DatasetIntegrityError,
  DatasetOperatorsError,
  assertDatasetVersion,
  assertOperatorsCoverTables,
} from './types.js';
export { normalizePhoneNumber } from './phone.js';
export type { LoadDatasetOptions } from './dataLoader.js';
export { assertDatasetFileHashes, sha256Hex, operatorsFileForInclude } from './dataLoader.js';

export interface RuPhoneBase {
  lookupPhoneNumber(input: string): LookupResult;
  normalizePhoneNumber(input: string): string | null;
  /** Every federal subject known to the dataset (plus the non-geographic "all-russia" pseudo-entry), each with its resolved timezone. */
  getRegions(): RegionInfo[];
  /** Every operator (legal entity) in the dataset, one entry per INN, sorted by name. */
  getOperators(): OperatorInfo[];
  /** Looks up a single operator by INN. Returns undefined when the INN is not in the dataset. */
  getOperatorByInn(inn: string): OperatorInfo | undefined;
}

/**
 * Builds a lookup instance from an already-loaded dataset - the browser/bundler-friendly
 * path: import the JSON under `data/` yourself and pass it here, no `fs` access involved.
 * Omit `fixed`/`mobile` on the dataset to exclude that table entirely (e.g. don't import
 * `fixed.json` at all to keep it out of a browser bundle).
 *
 * Throws `DatasetVersionError` if `meta.version` is missing or does not match `DATASET_VERSION`.
 * Throws `DatasetOperatorsError` if `operators` does not cover INNs from the loaded tables
 * (wrong operators mini-base paired with fixed/mobile).
 */
export function createRuPhoneBaseFromData(dataset: Dataset): RuPhoneBase {
  assertDatasetVersion(dataset.meta);
  assertOperatorsCoverTables(dataset);
  return {
    lookupPhoneNumber: (input: string) => lookupInDataset(dataset, input),
    normalizePhoneNumber,
    getRegions: () => listRegions(dataset),
    getOperators: () => listOperators(dataset),
    getOperatorByInn: (inn: string) => findOperatorByInn(dataset, inn),
  };
}

export interface RuPhoneBaseOptions {
  /** Custom dataset directory (e.g. the output of `ru-phone-base-build`) instead of the bundled default. */
  dataDir?: string;
  /** Which of the lookup tables to load - defaults to both. Pass e.g. `['mobile']` to skip loading `fixed.json` (by far the largest table) when only mobile-number lookups are needed. */
  include?: TableName[];
}

/**
 * Builds a lookup instance, optionally from a custom dataset directory and/or
 * a subset of the lookup tables. Uses `fs` to read the dataset - Node-only.
 * See `createRuPhoneBaseFromData` for a browser-friendly alternative.
 */
export function createRuPhoneBase(options: RuPhoneBaseOptions = {}): RuPhoneBase {
  return createRuPhoneBaseFromData(loadDataset(options));
}

let defaultInstance: RuPhoneBase | undefined;

/**
 * (Re)configures the default instance backing the module-level
 * `lookupPhoneNumber`/`getRegions`/`getOperators`/`getOperatorByInn` exports,
 * e.g. to load only `include: ['mobile']` or a custom `dataDir`. Call this
 * before the first lookup if you need non-default options - reading the
 * dataset from disk only happens once `initRuPhoneBase` or one of the
 * module-level exports is actually used, not on import.
 *
 * Optional: if you never call this, the first module-level lookup lazily
 * creates the default instance with default options (both tables, bundled
 * dataset).
 */
export function initRuPhoneBase(options: RuPhoneBaseOptions = {}): RuPhoneBase {
  defaultInstance = createRuPhoneBase(options);
  return defaultInstance;
}

function getDefaultInstance(): RuPhoneBase {
  return (defaultInstance ??= createRuPhoneBase());
}

/** Looks up region/operator/timezone for a Russian phone number, using the bundled default dataset. */
export const lookupPhoneNumber = (input: string): LookupResult => getDefaultInstance().lookupPhoneNumber(input);
/** Every federal subject known to the bundled default dataset, each with its resolved timezone. */
export const getRegions = (): RegionInfo[] => getDefaultInstance().getRegions();
/** Every operator (legal entity) in the bundled default dataset, one entry per INN. */
export const getOperators = (): OperatorInfo[] => getDefaultInstance().getOperators();
/** Looks up a single operator by INN in the bundled default dataset. */
export const getOperatorByInn = (inn: string): OperatorInfo | undefined => getDefaultInstance().getOperatorByInn(inn);
