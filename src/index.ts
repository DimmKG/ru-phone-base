import { loadDataset } from './dataLoader.js';
import { createRuPhoneBaseFromData, type RuPhoneBase } from './browser.js';
import type { LookupResult, OperatorInfo, RegionInfo, TableName } from './types.js';

export * from './browser.js';
export type { LoadDatasetOptions } from './dataLoader.js';
export { assertDatasetFileHashes, sha256Hex, operatorsFileForInclude } from './dataLoader.js';

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
