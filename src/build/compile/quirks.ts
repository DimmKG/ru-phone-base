import type { FlatEntry } from './buildRangeIndex.js';

/**
 * Manual, hand-verified corrections for source-registry mistakes that no
 * automatic heuristic can safely infer (a missing space, stray text baked
 * into a name, an obsolete legal form, a wrong region on one specific row,
 * ...). Add new entries to `QUIRKS` below as they're found - nothing else
 * needs to change; every quirk is matched and applied generically by
 * `applyOrganizationNameQuirks` / `applyAllocationFieldQuirks`. A quirk that
 * stops matching anything (e.g. a raw-data refresh already fixed it
 * upstream) doesn't fail the build - it's logged as a console warning, so
 * stale entries are visible without being able to block a release. Project
 * maintainers can also extend this list from an external file without
 * touching this one - see `loadQuirks.ts`.
 */

/** Corrects the canonical name used for every allocation under `inn` - overrides whatever `resolveCanonicalOperatorNames` would have auto-picked. */
export interface OrganizationNameQuirk {
  kind: 'organization-name';
  inn: string;
  to: string;
  reason: string;
}

/**
 * A bulk rename rule for organization names, for corrections that apply to
 * many INNs at once (e.g. an obsolete legal-form prefix) rather than one
 * specific entity. `apply` receives the full INN -> name map and returns a
 * new one; anything it doesn't want to touch it should pass through
 * unchanged. Keeping the function is what lets a rule match on more than
 * just a single name string later (prefix, regex, cross-referencing other
 * entries, ...) without changing the quirk shape again.
 */
export interface OrganizationNameRuleQuirk {
  kind: 'organization-name-rule';
  id: string;
  reason: string;
  apply: (canonicalNames: Map<string, string>) => Map<string, string>;
}

/** Identifies a single allocation row: one [sourceFile, code, from, to] slot, `inn` included as a safety check against a stale match. */
export interface AllocationMatch {
  sourceFile: string;
  code: string;
  from: number;
  to: number;
  inn: string;
}

/** Overrides specific fields on the one allocation row identified by `match`. */
export interface AllocationFieldQuirk {
  kind: 'allocation-field';
  match: AllocationMatch;
  changes: Partial<Pick<FlatEntry, 'operator' | 'inn' | 'regions' | 'settlement'>>;
  reason: string;
}

/**
 * A bulk rule over every allocation row at once - for corrections that
 * follow a pattern (e.g. "every row in code 812 tagged with settlement X
 * belongs to region Y") rather than one specific row. `apply` receives the
 * full entry list and must return the same number of entries, in the same
 * order (only `operator`/`inn`/`regions`/`settlement` may differ per entry);
 * anything it doesn't want to touch it should pass through unchanged.
 */
export interface AllocationFieldRuleQuirk {
  kind: 'allocation-field-rule';
  id: string;
  reason: string;
  apply: (entries: FlatEntry[]) => FlatEntry[];
}

export type Quirk = OrganizationNameQuirk | OrganizationNameRuleQuirk | AllocationFieldQuirk | AllocationFieldRuleQuirk;

/** Renames every name equal to (or starting with) the `from` legal-form prefix to `to`, leaving the rest of the name untouched. Only matches at the very start of the name, followed by a space/quote/end-of-string, so it can't clip a prefix out of an unrelated word. */
function renameLegalFormPrefix(names: Map<string, string>, from: string, to: string): Map<string, string> {
  const result = new Map(names);
  for (const [inn, name] of names) {
    const boundary = name[from.length];
    const isPrefixMatch = name.startsWith(from) && (boundary === undefined || boundary === ' ' || boundary === '"');
    if (isPrefixMatch) {
      result.set(inn, to + name.slice(from.length));
    }
  }
  return result;
}

export const QUIRKS: Quirk[] = [
  {
    kind: 'organization-name',
    inn: '6661079603',
    to: 'ООО "ЕКАТЕРИНБУРГ-2000"',
    reason: 'Пропущенный пробел после ООО',
  },
  {
    kind: 'organization-name',
    inn: '7802594898',
    to: 'ООО "ПТФ"',
    reason: 'Лишняя надпись ИНН в названии',
  },
  {
    kind: 'organization-name-rule',
    id: 'oao-to-pao',
    reason: 'ОАО как организационно-правовая форма упразднена с 1 сентября 2014 года - действующий аналог ПАО',
    apply: (names) => renameLegalFormPrefix(names, 'ОАО', 'ПАО'),
  },
  {
    kind: 'organization-name-rule',
    id: 'zao-to-ao',
    reason: 'ЗАО как организационно-правовая форма упразднена с 1 сентября 2014 года - действующий аналог просто АО',
    apply: (names) => renameLegalFormPrefix(names, 'ЗАО', 'АО'),
  },
];

export interface OrganizationNameQuirkApplication {
  kind: 'organization-name';
  inn: string;
  before: string;
  after: string;
  reason: string;
}

export interface OrganizationNameRuleApplication {
  kind: 'organization-name-rule';
  rule: string;
  inn: string;
  before: string;
  after: string;
  reason: string;
}

export interface AllocationFieldQuirkApplication {
  kind: 'allocation-field';
  match: AllocationMatch;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}

export interface AllocationFieldRuleApplication {
  kind: 'allocation-field-rule';
  rule: string;
  match: AllocationMatch;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}

export type QuirkApplication =
  | OrganizationNameQuirkApplication
  | OrganizationNameRuleApplication
  | AllocationFieldQuirkApplication
  | AllocationFieldRuleApplication;

/**
 * Applies every `organization-name`/`organization-name-rule` quirk, in
 * order, on top of an auto-resolved INN -> canonical-name map (see
 * `resolveCanonicalOperatorNames`). A quirk that no longer matches anything
 * (its INN dropped out of the registry, or a rule's pattern no longer
 * exists) is skipped and logged as a console warning rather than failing
 * the build.
 */
export function applyOrganizationNameQuirks(
  canonicalNames: Map<string, string>,
  quirks: Quirk[] = QUIRKS,
): {
  canonicalNames: Map<string, string>;
  applications: (OrganizationNameQuirkApplication | OrganizationNameRuleApplication)[];
} {
  let result = canonicalNames;
  const applications: (OrganizationNameQuirkApplication | OrganizationNameRuleApplication)[] = [];

  for (const quirk of quirks) {
    if (quirk.kind === 'organization-name') {
      const before = result.get(quirk.inn);
      if (before === undefined) {
        console.warn(
          `organization-name quirk for INN ${quirk.inn} matches no entries in the registry anymore - consider removing it from quirks.ts.`,
        );
        continue;
      }
      if (before === quirk.to) {
        console.warn(
          `organization-name quirk for INN ${quirk.inn} is a no-op (already "${quirk.to}") - consider removing it.`,
        );
        continue;
      }

      result = new Map(result).set(quirk.inn, quirk.to);
      applications.push({ kind: 'organization-name', inn: quirk.inn, before, after: quirk.to, reason: quirk.reason });
    } else if (quirk.kind === 'organization-name-rule') {
      const next = quirk.apply(result);
      let matched = false;
      for (const [inn, after] of next) {
        const before = result.get(inn);
        if (before !== undefined && before !== after) {
          matched = true;
          applications.push({
            kind: 'organization-name-rule',
            rule: quirk.id,
            inn,
            before,
            after,
            reason: quirk.reason,
          });
        }
      }
      if (!matched) {
        console.warn(
          `organization-name-rule "${quirk.id}" matches no entries in the registry anymore - consider removing it from quirks.ts.`,
        );
      }
      result = next;
    }
  }

  return { canonicalNames: result, applications };
}

function matchesAllocation(match: AllocationMatch, entry: FlatEntry): boolean {
  return (
    match.sourceFile === entry.sourceFile &&
    match.code === entry.code &&
    match.from === entry.from &&
    match.to === entry.to &&
    match.inn === entry.inn
  );
}

function allocationIdentity(entry: FlatEntry): AllocationMatch {
  return { sourceFile: entry.sourceFile, code: entry.code, from: entry.from, to: entry.to, inn: entry.inn };
}

function pickFields<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = obj[key];
  return result;
}

const RULE_TRACKED_FIELDS: (keyof FlatEntry)[] = ['operator', 'inn', 'regions', 'settlement'];

/** Diffs the fields an `allocation-field-rule` is allowed to touch; returns undefined when none of them changed. */
function diffTrackedFields(
  before: FlatEntry,
  after: FlatEntry,
): { before: Record<string, unknown>; after: Record<string, unknown> } | undefined {
  const beforeChanged: Record<string, unknown> = {};
  const afterChanged: Record<string, unknown> = {};
  let changed = false;
  for (const field of RULE_TRACKED_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changed = true;
      beforeChanged[field] = before[field];
      afterChanged[field] = after[field];
    }
  }
  return changed ? { before: beforeChanged, after: afterChanged } : undefined;
}

/**
 * Applies every `allocation-field`/`allocation-field-rule` quirk, in order,
 * to `entries`. A quirk that no longer matches anything is skipped and
 * logged as a console warning rather than failing the build. The one thing that *does* still
 * throw is an `allocation-field-rule` returning the wrong number of
 * entries - that's a bug in the rule itself, not a "stopped matching" case.
 */
export function applyAllocationFieldQuirks(
  entries: FlatEntry[],
  quirks: Quirk[] = QUIRKS,
): { entries: FlatEntry[]; applications: (AllocationFieldQuirkApplication | AllocationFieldRuleApplication)[] } {
  let current = entries;
  const applications: (AllocationFieldQuirkApplication | AllocationFieldRuleApplication)[] = [];

  for (const quirk of quirks) {
    if (quirk.kind === 'allocation-field') {
      let matched = false;
      current = current.map((entry) => {
        if (!matchesAllocation(quirk.match, entry)) return entry;
        matched = true;
        const changedFields = Object.keys(quirk.changes) as (keyof FlatEntry)[];
        const updated = { ...entry, ...quirk.changes };
        applications.push({
          kind: 'allocation-field',
          match: quirk.match,
          before: pickFields(entry, changedFields),
          after: pickFields(updated, changedFields),
          reason: quirk.reason,
        });
        return updated;
      });
      if (!matched) {
        console.warn(
          `allocation-field quirk ${JSON.stringify(quirk.match)} matches no entries in the registry anymore - consider removing it from quirks.ts.`,
        );
      }
    } else if (quirk.kind === 'allocation-field-rule') {
      const next = quirk.apply(current);
      if (next.length !== current.length) {
        throw new Error(
          `allocation-field-rule "${quirk.id}" returned ${next.length} entries for ${current.length} input entries - it must return exactly one (possibly modified) entry per input entry, in the same order.`,
        );
      }
      let matched = false;
      current.forEach((before, i) => {
        const diff = diffTrackedFields(before, next[i]);
        if (diff) {
          matched = true;
          applications.push({
            kind: 'allocation-field-rule',
            rule: quirk.id,
            match: allocationIdentity(before),
            ...diff,
            reason: quirk.reason,
          });
        }
      });
      if (!matched) {
        console.warn(
          `allocation-field-rule "${quirk.id}" matches no entries in the registry anymore - consider removing it from quirks.ts.`,
        );
      }
      current = next;
    }
  }

  return { entries: current, applications };
}
