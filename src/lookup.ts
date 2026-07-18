import type {
  Block,
  CompiledCodeTable,
  Dataset,
  FederalSubject,
  LookupResult,
  NumberType,
  PhoneNumberInfo,
  RegionInfo,
} from './types.js';
import { normalizePhoneNumber } from './phone.js';

function findBlock(blocks: Block[], n: number): Block | undefined {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const block = blocks[mid];
    if (n < block[0]) hi = mid - 1;
    else if (n > block[1]) lo = mid + 1;
    else return block;
  }
  return undefined;
}

// Matches PSEUDO_SUBJECTS' "all-russia" slug in src/build/parse/federalSubjects.ts
// (nationwide, non-geographic blocks - e.g. 8-800 hotline numbers).
const NATIONWIDE_SLUG = 'all-russia';

// Codes 800-809 ("80*") are federal/non-geographic resources - 8-800 toll-free
// plus adjacent things like televoting (803) - nationwide by construction,
// regardless of which region(s) a given row happens to list (the registry
// sometimes names a broad multi-region list here, e.g. a set of Far East
// subjects, instead of the literal "Российская Федерация"). Does not affect
// 810+ (ordinary geographic codes, including the newer DNR/LNR/Zaporizhzhia/
// Kherson territory codes like 856/857/860) - only 800-809 match.
const FEDERAL_CODE_PREFIX = '80';

function isFederalCode(code: string): boolean {
  return code.startsWith(FEDERAL_CODE_PREFIX);
}

// Keep district name only, remove the prefix
function districtKeyFromSettlement(settlement: string): string {
  return settlement.replace(/^(м\.р-н|р-н|улус)\.?\s+/iu, '').trim();
}

export function timezoneFor(timezones: Dataset['timezones'], slug: string, settlement?: string): string | undefined {
  const entry = timezones[slug];
  if (!entry) return undefined; // non-geographic pseudo-subjects (e.g. "all-russia") deliberately have no timezone entry
  if (typeof entry === 'string') return entry;
  if (settlement) {
    const districtTz = entry.byDistrict[districtKeyFromSettlement(settlement)];
    if (districtTz) return districtTz;
  }
  return entry.default;
}

function regionIndex(dataset: Dataset): Map<string, FederalSubject> {
  return new Map(dataset.regions.map((r) => [r.slug, r]));
}

function regionInfo(
  dataset: Dataset,
  regions: Map<string, FederalSubject>,
  slug: string,
  settlement?: string,
): RegionInfo {
  const subject = regions.get(slug);
  const timezone = timezoneFor(dataset.timezones, slug, settlement);
  return {
    slug,
    name: subject?.name ?? slug,
    nameLatin: subject?.nameLatin ?? slug,
    ...(timezone !== undefined ? { timezone } : {}),
  };
}

/**
 * Returns every federal subject known to the dataset, each with its resolved timezone.
 * Regions whose timezone varies by district (only Sakha/Yakutia, currently) have no
 * single correct answer without a settlement to disambiguate - `timezone` is left
 * unset there rather than guessing the republic-wide default.
 */
export function listRegions(dataset: Dataset): RegionInfo[] {
  return dataset.regions.map((r) => {
    const entry = dataset.timezones[r.slug];
    const timezone = typeof entry === 'string' ? entry : undefined;
    return {
      slug: r.slug,
      name: r.name,
      nameLatin: r.nameLatin,
      ...(timezone !== undefined ? { timezone } : {}),
    };
  });
}

export interface DecodedBlockAllocation {
  operator: string;
  inn: string;
  /** Region slugs from this block's region-set, excluding NATIONWIDE_SLUG. Already sorted (see buildRangeIndex's regionSetIdx). */
  regionSlugs: string[];
  settlement?: string;
  nationwide: boolean;
}

/** Decodes a compiled block's index references (operator/region-set/settlement) into their actual values - the inverse of buildRangeIndex's interning. Shared with the build-time dataset-diff tooling, which needs the same decoding to compare allocations across dataset rebuilds. */
export function decodeBlock(table: CompiledCodeTable, block: Block, code: string): DecodedBlockAllocation {
  const o = block[2];
  const r = block[3];
  const p = block.length === 5 ? block[4] : undefined;
  const slugs = table.r[r];
  const settlement = p !== undefined ? table.p[p] : undefined;
  const nationwide = isFederalCode(code) || slugs.includes(NATIONWIDE_SLUG);
  const regionSlugs = slugs.filter((slug) => slug !== NATIONWIDE_SLUG);
  const [operator, inn] = table.o[o];
  return { operator, inn, regionSlugs, nationwide, ...(settlement !== undefined ? { settlement } : {}) };
}

function resolveAllocation(
  dataset: Dataset,
  table: CompiledCodeTable,
  block: Block,
  code: string,
  regions: Map<string, FederalSubject>,
): Pick<PhoneNumberInfo, 'operator' | 'inn' | 'region' | 'settlement' | 'nationwide'> {
  const decoded = decodeBlock(table, block, code);
  const region = decoded.regionSlugs.map((slug) => regionInfo(dataset, regions, slug, decoded.settlement));
  return {
    operator: decoded.operator,
    inn: decoded.inn,
    region,
    nationwide: decoded.nationwide,
    ...(decoded.settlement !== undefined ? { settlement: decoded.settlement } : {}),
  };
}

function resolveTimezone(allocation: Pick<PhoneNumberInfo, 'region' | 'nationwide'>): { timezone?: string } {
  if (allocation.nationwide) return {};
  for (const region of allocation.region) {
    if (region.timezone) return { timezone: region.timezone };
  }
  return {};
}

function tryTable(
  dataset: Dataset,
  table: CompiledCodeTable | undefined,
  code: string,
  subscriberNumber: number,
  type: NumberType,
  regions: Map<string, FederalSubject>,
): PhoneNumberInfo | undefined {
  if (!table) return undefined; // this table was excluded from the dataset (see LoadDatasetOptions.include)
  const blocks = table.c[code];
  if (!blocks) return undefined;
  const block = findBlock(blocks, subscriberNumber);
  if (!block) return undefined;

  const allocation = resolveAllocation(dataset, table, block, code, regions);
  const tz = resolveTimezone(allocation);
  return { type, code, ...allocation, ...tz };
}

/**
 * Looks up region/operator/timezone for a Russian phone number against the
 * fixed-line (ABC-3xx/4xx/8xx) and mobile (DEF-9xx) tables.
 */
export function lookupPhoneNumber(dataset: Dataset, input: string): LookupResult {
  const normalized = normalizePhoneNumber(input);
  if (!normalized) {
    return { input, normalized: null, valid: false, reason: 'invalid-format' };
  }

  const code = normalized.slice(1, 4);
  const subscriberNumber = Number(normalized.slice(4));

  const regions = regionIndex(dataset);

  const data =
    tryTable(dataset, dataset.fixed, code, subscriberNumber, 'fixed', regions) ??
    tryTable(dataset, dataset.mobile, code, subscriberNumber, 'mobile', regions);

  if (!data) {
    return { input, normalized, valid: false, reason: 'unassigned' };
  }
  return { input, normalized, valid: true, data };
}
