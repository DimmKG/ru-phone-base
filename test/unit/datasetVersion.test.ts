import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DATASET_VERSION,
  DatasetVersionError,
  DatasetIntegrityError,
  assertDatasetVersion,
  createRuPhoneBaseFromData,
} from '../../src/index.js';
import { assertDatasetFileHashes, loadDataset, sha256Hex } from '../../src/dataLoader.js';
import type { Dataset } from '../../src/types.js';

function minimalDataset(meta: Dataset['meta']): Dataset {
  return {
    regions: [],
    operators: {},
    timezones: {},
    meta,
  };
}

function emptyFiles(): Dataset['meta']['files'] {
  return [];
}

describe('dataset version', () => {
  it('accepts the bundled dataset version', () => {
    expect(() => loadDataset()).not.toThrow();
    expect(loadDataset().meta.version).toBe(DATASET_VERSION);
  });

  it('throws when meta.version is missing', () => {
    expect(() => assertDatasetVersion({})).toThrow(DatasetVersionError);
    expect(() => assertDatasetVersion(undefined)).toThrow(/missing/);
    expect(() =>
      createRuPhoneBaseFromData(minimalDataset({ version: undefined as unknown as number, files: emptyFiles() })),
    ).toThrow(DatasetVersionError);
  });

  it('throws when meta.version does not match DATASET_VERSION', () => {
    expect(() => assertDatasetVersion({ version: DATASET_VERSION + 1 })).toThrow(
      new RegExp(`expects ${DATASET_VERSION}`),
    );
    expect(() => createRuPhoneBaseFromData(minimalDataset({ version: 0, files: emptyFiles() }))).toThrow(
      DatasetVersionError,
    );
  });
});

describe('dataset file hashes', () => {
  it('accepts the bundled dataset file digests', () => {
    const dataset = loadDataset();
    expect(dataset.meta.files.length).toBeGreaterThanOrEqual(5);
    expect(dataset.meta.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
  });

  it('throws when meta.files is missing or empty', () => {
    expect(() => assertDatasetFileHashes({ version: 1, files: [] }, [{ file: 'regions.json', content: '{}' }])).toThrow(
      DatasetIntegrityError,
    );
    expect(() =>
      assertDatasetFileHashes({ version: 1, files: undefined as unknown as [] }, [
        { file: 'regions.json', content: '{}' },
      ]),
    ).toThrow(/meta\.files is missing/);
  });

  it('throws when a loaded file hash is missing from the manifest', () => {
    expect(() =>
      assertDatasetFileHashes({ version: 1, files: [{ file: 'other.json', sha256: 'abc' }] }, [
        { file: 'regions.json', content: '{}' },
      ]),
    ).toThrow(/no sha256 for regions\.json/);
  });

  it('throws when a file digest does not match', () => {
    const content = Buffer.from('{"ok":true}');
    const expected = sha256Hex(content);
    expect(() =>
      assertDatasetFileHashes({ version: 1, files: [{ file: 'regions.json', sha256: expected }] }, [
        { file: 'regions.json', content: Buffer.from('{"tampered":true}') },
      ]),
    ).toThrow(/sha256 mismatch/);
  });

  it('rejects a tampered on-disk dataset via loadDataset', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ru-phone-base-hash-'));
    try {
      const bundled = path.join(process.cwd(), 'src/data');
      for (const name of [
        'meta.json',
        'fixed.json',
        'mobile.json',
        'regions.json',
        'operators.json',
        'timezones.json',
      ]) {
        // copy via read/write - keep hashes valid first, then tamper regions
        writeFileSync(path.join(root, name), readFileSync(path.join(bundled, name)));
      }
      writeFileSync(path.join(root, 'regions.json'), Buffer.from('[]'));
      expect(() => loadDataset({ dataDir: root, include: ['mobile'] })).toThrow(DatasetIntegrityError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
