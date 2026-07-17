import { loadDataset } from './dataLoader.js';
import { lookupPhoneNumber as lookupInDataset, listRegions } from './lookup.js';
import { normalizePhoneNumber } from './phone.js';
import type { Dataset, LookupResult, RegionInfo, TableName } from './types.js';

export type {
  Dataset,
  LookupResult,
  NumberType,
  RegionInfo,
  CompiledCodeTable,
  Block,
  TimezoneEntry,
  SakhaDistrictOverride,
  FederalSubject,
  TableName,
} from './types.js';
export { normalizePhoneNumber } from './phone.js';
export type { LoadDatasetOptions } from './dataLoader.js';

export interface RuPhoneBase {
  lookupPhoneNumber(input: string): LookupResult;
  normalizePhoneNumber(input: string): string | null;
  /** Every federal subject known to the dataset (plus the non-geographic "all-russia" pseudo-entry), each with its resolved timezone. */
  getRegions(): RegionInfo[];
}

/** Builds a lookup instance from an already-loaded dataset - the browser/bundler-friendly path: import the JSON under `data/` yourself and pass it here, no `fs` access involved. Omit `fixed`/`mobile` on the dataset to exclude that table entirely (e.g. don't import `fixed.json` at all to keep it out of a browser bundle). */
export function createRuPhoneBaseFromData(dataset: Dataset): RuPhoneBase {
  return {
    lookupPhoneNumber: (input: string) => lookupInDataset(dataset, input),
    normalizePhoneNumber,
    getRegions: () => listRegions(dataset),
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

const defaultInstance = createRuPhoneBase();

/** Looks up region/operator/timezone for a Russian phone number, using the bundled default dataset. */
export const lookupPhoneNumber = defaultInstance.lookupPhoneNumber;
/** Every federal subject known to the bundled default dataset, each with its resolved timezone. */
export const getRegions = defaultInstance.getRegions;
