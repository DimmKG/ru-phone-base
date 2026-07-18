import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadUserQuirks } from '../../src/build/compile/loadQuirks.js';

describe('loadUserQuirks', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ru-phone-base-quirks-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads data-only quirks from a .json file', async () => {
    const filePath = path.join(root, 'quirks.json');
    writeFileSync(
      filePath,
      JSON.stringify([
        { kind: 'organization-name', inn: '1111111111', to: 'ООО "Ромашка"', reason: 'typo' },
        {
          kind: 'allocation-field',
          match: { sourceFile: 'ABC-4xx', code: '495', from: 100, to: 199, inn: '1111111111' },
          changes: { settlement: 'Somewhere' },
          reason: 'wrong settlement',
        },
      ]),
    );

    const quirks = await loadUserQuirks(filePath);

    expect(quirks).toHaveLength(2);
    expect(quirks[0]).toMatchObject({ kind: 'organization-name', inn: '1111111111' });
    expect(quirks[1]).toMatchObject({ kind: 'allocation-field' });
  });

  it('throws when the .json file does not contain an array', async () => {
    const filePath = path.join(root, 'quirks.json');
    writeFileSync(filePath, JSON.stringify({ kind: 'organization-name' }));

    await expect(loadUserQuirks(filePath)).rejects.toThrow(/JSON array/);
  });

  it('throws when a .json quirk uses a rule kind (which needs a function)', async () => {
    const filePath = path.join(root, 'quirks.json');
    writeFileSync(filePath, JSON.stringify([{ kind: 'organization-name-rule', id: 'x', reason: 'r' }]));

    await expect(loadUserQuirks(filePath)).rejects.toThrow(/organization-name-rule/);
  });

  it('throws when the file does not exist', async () => {
    await expect(loadUserQuirks(path.join(root, 'missing.json'))).rejects.toThrow(/not found/);
  });

  it('loads quirks from a .mjs module default export, including rule-based quirks', async () => {
    const filePath = path.join(root, 'quirks.mjs');
    writeFileSync(
      filePath,
      `export default [
        {
          kind: 'organization-name-rule',
          id: 'test-rule',
          reason: 'test',
          apply: (names) => names,
        },
      ];`,
    );

    const quirks = await loadUserQuirks(filePath);
    const [quirk] = quirks;

    expect(quirks).toHaveLength(1);
    expect(quirk.kind).toBe('organization-name-rule');
    expect(typeof (quirk as { apply?: unknown }).apply).toBe('function');
  });

  it('loads quirks from a named QUIRKS export when there is no default export', async () => {
    const filePath = path.join(root, 'quirks.mjs');
    writeFileSync(
      filePath,
      `export const QUIRKS = [{ kind: 'organization-name', inn: '2222222222', to: 'ООО "Тест"', reason: 'r' }];`,
    );

    const quirks = await loadUserQuirks(filePath);

    expect(quirks).toEqual([{ kind: 'organization-name', inn: '2222222222', to: 'ООО "Тест"', reason: 'r' }]);
  });

  it('throws when a module file exports neither default nor QUIRKS as an array', async () => {
    const filePath = path.join(root, 'quirks.mjs');
    writeFileSync(filePath, `export const somethingElse = 42;`);

    await expect(loadUserQuirks(filePath)).rejects.toThrow(/must export an array/);
  });
});
