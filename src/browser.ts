import { lookupPhoneNumber as lookupInDataset, listRegions, listOperators, findOperatorByInn } from './lookup.js';
import { normalizePhoneNumber } from './phone.js';
import {
  assertDatasetVersion,
  assertOperatorsCoverTables,
  DatasetIntegrityError,
  type Dataset,
  type DatasetMeta,
  type LookupResult,
  type OperatorInfo,
  type RegionInfo,
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

/**
 * This module has no `node:*` imports (nothing from `fs`/`path`/`url`/`crypto`)
 * - it's the entry point for bundler-built browser apps. Import from here
 * (`ru-phone-base/browser`) rather than the package root when targeting the
 * browser: unlike the root entry, a bundler never needs to resolve or
 * tree-shake away Node built-ins to build cleanly, which matters for
 * bundlers (e.g. webpack) that fail the build on an unresolvable `node:`
 * import even in code that would otherwise be dead-code-eliminated.
 */
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

/**
 * SHA-256 of `content`, hex-encoded - the Web Crypto (`crypto.subtle`)
 * counterpart to `sha256Hex`/`assertDatasetFileHashes` from the Node entry's
 * `dataLoader.ts`. Node's `node:crypto` is sync and unavailable in a browser
 * bundle; `crypto.subtle` is the browser (and Node) equivalent, but it's
 * async - so this, and `assertDatasetFileHashesAsync` below, are async too.
 */
export async function sha256HexAsync(content: string | ArrayBuffer | ArrayBufferView): Promise<string> {
  const bytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies SHA-256 digests of fetched dataset files against `meta.files` -
 * call this on the *raw* fetched bytes/text, before `JSON.parse`, since
 * verification has to run against exactly what was hashed at build time.
 * `createRuPhoneBaseFromData` itself never sees raw bytes (it takes
 * already-parsed JSON), so it can't do this check for you - call this first
 * if you want the same integrity guarantee the Node entry's `loadDataset`
 * gets for free from disk reads.
 *
 * Throws `DatasetIntegrityError` when the manifest is missing, a hash is
 * absent, or a digest mismatches.
 */
export async function assertDatasetFileHashesAsync(
  meta: DatasetMeta,
  files: { file: string; content: string | ArrayBuffer | ArrayBufferView }[],
): Promise<void> {
  if (!Array.isArray(meta.files) || meta.files.length === 0) {
    throw new DatasetIntegrityError('missing-manifest');
  }
  const byName = new Map(meta.files.map((f) => [f.file, f.sha256]));
  for (const { file, content } of files) {
    const expected = byName.get(file);
    if (typeof expected !== 'string' || expected.length === 0) {
      throw new DatasetIntegrityError('missing-hash', file);
    }
    const actual = await sha256HexAsync(content);
    if (actual !== expected) {
      throw new DatasetIntegrityError('mismatch', file, expected, actual);
    }
  }
}
