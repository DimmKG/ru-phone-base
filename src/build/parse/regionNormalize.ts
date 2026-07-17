import aliasesJson from './regionAliases.json' with { type: 'json' };

type AliasMap = Record<string, string | string[] | null>;
const aliases = aliasesJson as unknown as AliasMap;

export interface ResolvedTokens {
  slugs: string[];
  unmapped: string[];
}

export interface RegionMismatch {
  zoneToken: string;
  placeToken: string;
}

export interface RowRegionResult extends ResolvedTokens {
  /** Set when a single-region zone value resolved to a different subject than
   *  the (preferred) place value - a genuine registry inconsistency worth
   *  surfacing, not silently picking a winner and moving on. */
  mismatch?: RegionMismatch;
}

/**
 * Splits a zone/place cell into region tokens. Cells mix two notations: a
 * flat comma-list of region names (a block spanning several subjects), and/or
 * a `|`-delimited city|district|subject hierarchy (a single location) -
 * sometimes as the *only* comma-item. Handle both uniformly: split on comma,
 * then for each piece take the last `|`-segment.
 */
export function tokensFromField(cell: string | undefined): string[] {
  if (!cell || cell === '-') return [];
  return cell
    .split(',')
    .map((piece) => {
      const segments = piece.split('|');
      return segments[segments.length - 1].trim();
    })
    .filter(Boolean);
}

export function resolveTokens(tokens: string[]): ResolvedTokens {
  const slugs = new Set<string>();
  const unmapped: string[] = [];
  for (const token of tokens) {
    if (!(token in aliases)) {
      unmapped.push(token);
      continue;
    }
    const mapped = aliases[token];
    if (mapped === null) continue; // known-ambiguous, intentionally left unresolved
    for (const slug of Array.isArray(mapped) ? mapped : [mapped]) slugs.add(slug);
  }
  return { slugs: [...slugs], unmapped };
}

/**
 * A handful of federal subjects are "matryoshka"-nested inside a broader
 * subject in the registry's zone field (a historical/administrative
 * grouping), even though they're independent federal subjects in their own
 * right: Khanty-Mansi AO and Yamalo-Nenets AO both nest inside "Тюменская
 * область", Nenets AO nests inside "Архангельская область". When the zone
 * names the parent but the (more granular) place names the actual nested
 * subject, the place value is the correct, more specific answer.
 */
const NESTING_OVERRIDES: Record<string, Set<string>> = {
  'tyumen-oblast': new Set(['khanty-mansi-ao', 'yamalo-nenets-ao']),
  'arkhangelsk-oblast': new Set(['nenets-ao']),
};

/**
 * Resolves the federal subject(s) for one registry row from its four
 * location-ish cells.
 *
 * The zone ("Зона обслуживания[ ГАР]") cell is the authoritative source for
 * *which subject a number block is allocated to* - this matters a lot for
 * mobile (ni-11-p) rows, where "Место установки" is the operator's often
 * centralized core-network location (e.g. a hub city like Nizhny Novgorod
 * or Rostov serving many surrounding subjects) and is NOT a reliable
 * indicator of the subject the numbers belong to. So:
 *  - A zone resolving to MORE THAN ONE subject is an authoritative
 *    multi-region service area - used as-is.
 *  - A zone resolving to exactly one subject is used as-is UNLESS it's a
 *    known matryoshka parent (see NESTING_OVERRIDES above) and place names
 *    the nested child - then the more specific place value wins, silently
 *    (this is the expected/normal case, not a data anomaly).
 *  - Any other single-subject disagreement between zone and place is kept
 *    as zone's answer, but flagged via `mismatch` for visibility - it's a
 *    genuine registry inconsistency, not something to silently paper over.
 *  - If zone is empty/unmapped, falls back to place.
 */
export function resolveRowRegion(cells: {
  zone?: string;
  zoneGar?: string;
  place?: string;
  placeGar?: string;
}): RowRegionResult {
  const zoneSource = cells.zoneGar && cells.zoneGar !== '-' ? cells.zoneGar : cells.zone;
  const zoneResolved = resolveTokens(tokensFromField(zoneSource));

  if (zoneResolved.slugs.length > 1) {
    return zoneResolved;
  }

  const placeSource = cells.placeGar && cells.placeGar !== '-' ? cells.placeGar : cells.place;
  const placeResolved = resolveTokens(tokensFromField(placeSource));

  if (zoneResolved.slugs.length === 0) {
    return placeResolved.slugs.length > 0 ? placeResolved : zoneResolved;
  }

  const zoneSlug = zoneResolved.slugs[0];
  const placeSlug = placeResolved.slugs[0];

  if (placeSlug && placeSlug !== zoneSlug) {
    if (NESTING_OVERRIDES[zoneSlug]?.has(placeSlug)) {
      return { slugs: [placeSlug], unmapped: placeResolved.unmapped };
    }
    return { ...zoneResolved, mismatch: { zoneToken: zoneSlug, placeToken: placeSlug } };
  }

  return zoneResolved;
}

/**
 * Extracts the settlement/locality name (city, town, village...) from the
 * *first* segment of the place hierarchy - the counterpart to
 * `tokensFromField`'s "take the last segment" for the federal subject. Only
 * meaningful for a single-location row (fixed-line installation address);
 * for a multi-region comma list there's no one settlement to name, so this
 * only looks at the first comma-item. Requires an actual `city|...|subject`
 * hierarchy (at least one `|`) - a bare single-segment value (a federal
 * subject name alone, or the nationwide `"Российская Федерация"` sentinel
 * for non-geographic toll-free blocks) is not a settlement and would just
 * duplicate the resolved region.
 */
export function extractSettlement(cells: { place?: string; placeGar?: string }): string | undefined {
  const source = cells.placeGar && cells.placeGar !== '-' ? cells.placeGar : cells.place;
  if (!source || source === '-') return undefined;
  const firstItem = source.split(',')[0];
  if (!firstItem.includes('|')) return undefined;
  const firstSegment = firstItem.split('|')[0].trim();
  return firstSegment || undefined;
}
