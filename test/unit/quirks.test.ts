import { describe, it, expect, vi } from 'vitest';
import type { FlatEntry } from '../../src/build/compile/buildRangeIndex.js';
import { applyOrganizationNameQuirks, applyAllocationFieldQuirks, type Quirk } from '../../src/build/compile/quirks.js';

function entry(overrides: Partial<FlatEntry>): FlatEntry {
  return {
    code: '495',
    from: 100,
    to: 199,
    operator: 'Operator A',
    inn: '1234567890',
    regions: ['moscow'],
    sourceFile: 'ABC-4xx',
    ...overrides,
  };
}

describe('applyOrganizationNameQuirks', () => {
  it('overrides the auto-picked canonical name and records a before/after application', () => {
    const quirks: Quirk[] = [
      { kind: 'organization-name', inn: '6661079603', to: 'ООО "ЕКАТЕРИНБУРГ-2000"', reason: 'missing space' },
    ];
    const canonicalNames = new Map([['6661079603', 'ООО"ЕКАТЕРИНБУРГ-2000"']]);

    const { canonicalNames: fixed, applications } = applyOrganizationNameQuirks(canonicalNames, quirks);

    expect(fixed.get('6661079603')).toBe('ООО "ЕКАТЕРИНБУРГ-2000"');
    expect(applications).toEqual([
      {
        kind: 'organization-name',
        inn: '6661079603',
        before: 'ООО"ЕКАТЕРИНБУРГ-2000"',
        after: 'ООО "ЕКАТЕРИНБУРГ-2000"',
        reason: 'missing space',
      },
    ]);
  });

  it('does not mutate the input map', () => {
    const quirks: Quirk[] = [{ kind: 'organization-name', inn: '1111111111', to: 'Fixed Name', reason: 'r' }];
    const canonicalNames = new Map([['1111111111', 'Broken Name']]);

    applyOrganizationNameQuirks(canonicalNames, quirks);

    expect(canonicalNames.get('1111111111')).toBe('Broken Name');
  });

  it('warns and leaves the map untouched when the INN has no entry in the canonical-name map', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quirks: Quirk[] = [{ kind: 'organization-name', inn: '0000000000', to: 'X', reason: 'r' }];

    const { canonicalNames: result, applications } = applyOrganizationNameQuirks(new Map(), quirks);

    expect(result.size).toBe(0);
    expect(applications).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('0000000000'));
    warn.mockRestore();
  });

  it('warns and skips (no application logged) when the quirk is already a no-op', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quirks: Quirk[] = [{ kind: 'organization-name', inn: '1111111111', to: 'Already Correct', reason: 'r' }];
    const canonicalNames = new Map([['1111111111', 'Already Correct']]);

    const { applications } = applyOrganizationNameQuirks(canonicalNames, quirks);

    expect(applications).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('applies an organization-name-rule to every matching INN and reports each as a separate application', () => {
    const rule: Quirk = {
      kind: 'organization-name-rule',
      id: 'oao-to-pao',
      reason: 'ОАО упразднена, действующий аналог ПАО',
      apply: (names) => {
        const result = new Map(names);
        for (const [inn, name] of names) {
          if (name.startsWith('ОАО ')) result.set(inn, 'ПАО ' + name.slice(4));
        }
        return result;
      },
    };
    const canonicalNames = new Map([
      ['1111111111', 'ОАО "РЖД"'],
      ['2222222222', 'ООО "Ромашка"'],
    ]);

    const { canonicalNames: fixed, applications } = applyOrganizationNameQuirks(canonicalNames, [rule]);

    expect(fixed.get('1111111111')).toBe('ПАО "РЖД"');
    expect(fixed.get('2222222222')).toBe('ООО "Ромашка"');
    expect(applications).toEqual([
      {
        kind: 'organization-name-rule',
        rule: 'oao-to-pao',
        inn: '1111111111',
        before: 'ОАО "РЖД"',
        after: 'ПАО "РЖД"',
        reason: 'ОАО упразднена, действующий аналог ПАО',
      },
    ]);
  });

  it('warns (without throwing or logging an application) when an organization-name-rule matches nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rule: Quirk = {
      kind: 'organization-name-rule',
      id: 'noop-rule',
      reason: 'r',
      apply: (names) => names,
    };
    const canonicalNames = new Map([['1111111111', 'ООО "Ромашка"']]);

    const { canonicalNames: result, applications } = applyOrganizationNameQuirks(canonicalNames, [rule]);

    expect(result.get('1111111111')).toBe('ООО "Ромашка"');
    expect(applications).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('noop-rule'));
    warn.mockRestore();
  });

  it('chains an individual override after a rule so both are reflected in the result', () => {
    const rule: Quirk = {
      kind: 'organization-name-rule',
      id: 'zao-to-ao',
      reason: 'ЗАО упразднена',
      apply: (names) => {
        const result = new Map(names);
        for (const [inn, name] of names) {
          if (name.startsWith('ЗАО ')) result.set(inn, 'АО ' + name.slice(4));
        }
        return result;
      },
    };
    const override: Quirk = { kind: 'organization-name', inn: '2222222222', to: 'ООО "Ромашка Плюс"', reason: 'r' };
    const canonicalNames = new Map([
      ['1111111111', 'ЗАО "Восток"'],
      ['2222222222', 'ООО "Ромашка"'],
    ]);

    const { canonicalNames: fixed } = applyOrganizationNameQuirks(canonicalNames, [rule, override]);

    expect(fixed.get('1111111111')).toBe('АО "Восток"');
    expect(fixed.get('2222222222')).toBe('ООО "Ромашка Плюс"');
  });
});

describe('applyAllocationFieldQuirks', () => {
  it('overrides only the matching entry, leaving others untouched', () => {
    const quirks: Quirk[] = [
      {
        kind: 'allocation-field',
        match: { sourceFile: 'ABC-4xx', code: '495', from: 100, to: 199, inn: '1234567890' },
        changes: { regions: ['moscow-oblast'] },
        reason: 'wrong region in the registry',
      },
    ];
    const entries = [entry({}), entry({ from: 200, to: 299 })];

    const { entries: result, applications } = applyAllocationFieldQuirks(entries, quirks);

    expect(result[0].regions).toEqual(['moscow-oblast']);
    expect(result[1].regions).toEqual(['moscow']);
    expect(applications).toEqual([
      {
        kind: 'allocation-field',
        match: quirks[0].kind === 'allocation-field' ? quirks[0].match : undefined,
        before: { regions: ['moscow'] },
        after: { regions: ['moscow-oblast'] },
        reason: 'wrong region in the registry',
      },
    ]);
  });

  it('leaves entries untouched when there are no allocation-field quirks', () => {
    const entries = [entry({})];
    const { entries: result, applications } = applyAllocationFieldQuirks(entries, []);
    expect(result).toEqual(entries);
    expect(applications).toEqual([]);
  });

  it('warns and leaves entries untouched when a quirk matches no entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quirks: Quirk[] = [
      {
        kind: 'allocation-field',
        match: { sourceFile: 'ABC-4xx', code: '999', from: 1, to: 2, inn: '0000000000' },
        changes: { settlement: 'Somewhere' },
        reason: 'r',
      },
    ];
    const entries = [entry({})];

    const { entries: result, applications } = applyAllocationFieldQuirks(entries, quirks);

    expect(result).toEqual(entries);
    expect(applications).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('matches no entries'));
    warn.mockRestore();
  });

  it('applies an allocation-field-rule across every matching entry and reports each as a separate application', () => {
    const rule: Quirk = {
      kind: 'allocation-field-rule',
      id: 'moscow-to-moscow-oblast-for-343',
      reason: 'code 343 was misfiled under moscow instead of moscow-oblast',
      apply: (entries) =>
        entries.map((e) =>
          e.code === '343' && e.regions.includes('moscow') ? { ...e, regions: ['moscow-oblast'] } : e,
        ),
    };
    const entries = [
      entry({ code: '343', from: 100, to: 199, regions: ['moscow'] }),
      entry({ code: '495', from: 100, to: 199, regions: ['moscow'] }),
    ];

    const { entries: result, applications } = applyAllocationFieldQuirks(entries, [rule]);

    expect(result[0].regions).toEqual(['moscow-oblast']);
    expect(result[1].regions).toEqual(['moscow']);
    expect(applications).toEqual([
      {
        kind: 'allocation-field-rule',
        rule: 'moscow-to-moscow-oblast-for-343',
        match: { sourceFile: 'ABC-4xx', code: '343', from: 100, to: 199, inn: '1234567890' },
        before: { regions: ['moscow'] },
        after: { regions: ['moscow-oblast'] },
        reason: 'code 343 was misfiled under moscow instead of moscow-oblast',
      },
    ]);
  });

  it('warns (without throwing or logging an application) when an allocation-field-rule changes nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rule: Quirk = {
      kind: 'allocation-field-rule',
      id: 'noop-rule',
      reason: 'r',
      apply: (entries) => entries,
    };
    const entries = [entry({})];

    const { entries: result, applications } = applyAllocationFieldQuirks(entries, [rule]);

    expect(result).toEqual(entries);
    expect(applications).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('noop-rule'));
    warn.mockRestore();
  });

  it('throws when an allocation-field-rule changes the entry count', () => {
    const rule: Quirk = {
      kind: 'allocation-field-rule',
      id: 'bad-rule',
      reason: 'r',
      apply: (entries) => entries.slice(1),
    };
    expect(() => applyAllocationFieldQuirks([entry({}), entry({ from: 200, to: 299 })], [rule])).toThrow(/bad-rule/);
  });

  it('chains an individual override after a rule so both are reflected in the result', () => {
    const rule: Quirk = {
      kind: 'allocation-field-rule',
      id: 'settlement-rule',
      reason: 'r',
      apply: (entries) => entries.map((e) => (e.code === '343' ? { ...e, settlement: 'Somewhere' } : e)),
    };
    const override: Quirk = {
      kind: 'allocation-field',
      match: { sourceFile: 'ABC-4xx', code: '343', from: 100, to: 199, inn: '1234567890' },
      changes: { regions: ['moscow-oblast'] },
      reason: 'r',
    };
    const entries = [entry({ code: '343', from: 100, to: 199 })];

    const { entries: result } = applyAllocationFieldQuirks(entries, [rule, override]);

    expect(result[0].settlement).toBe('Somewhere');
    expect(result[0].regions).toEqual(['moscow-oblast']);
  });
});
