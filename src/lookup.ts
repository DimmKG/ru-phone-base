import type {
  Block,
  CompiledCodeTable,
  Dataset,
  FederalSubject,
  LookupResult,
  NumberType,
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

function timezoneFor(dataset: Dataset, slug: string, settlement?: string): string | undefined {
  const entry = dataset.timezones[slug];
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
  const timezone = timezoneFor(dataset, slug, settlement);
  return {
    slug,
    name: subject?.name ?? slug,
    nameLatin: subject?.nameLatin ?? slug,
    ...(timezone !== undefined ? { timezone } : {}),
  };
}

/** Returns every federal subject known to the dataset, each with its resolved timezone. */
export function listRegions(dataset: Dataset): RegionInfo[] {
  const regions = regionIndex(dataset);
  return dataset.regions.map((r) => regionInfo(dataset, regions, r.slug));
}

function resolveAllocation(
  dataset: Dataset,
  table: CompiledCodeTable,
  block: Block,
  code: string,
  regions: Map<string, FederalSubject>,
): Pick<LookupResult, 'operator' | 'inn' | 'region' | 'settlement' | 'nationwide'> {
  const o = block[2];
  const r = block[3];
  const p = block.length === 5 ? block[4] : undefined;
  const slugs = table.r[r];
  const settlement = p !== undefined ? table.p[p] : undefined;
  const nationwide = isFederalCode(code) || slugs.includes(NATIONWIDE_SLUG);
  const region = slugs
    .filter((slug) => slug !== NATIONWIDE_SLUG)
    .map((slug) => regionInfo(dataset, regions, slug, settlement));
  const [operator, inn] = table.o[o];
  return {
    operator,
    inn,
    region,
    ...(settlement !== undefined ? { settlement } : {}),
    ...(nationwide ? { nationwide: true } : {}),
  };
}

function resolveTimezone(allocation: Pick<LookupResult, 'region' | 'nationwide'>): { timezone?: string } {
  if (allocation.nationwide) return {};
  for (const region of allocation.region ?? []) {
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
): LookupResult | undefined {
  if (!table) return undefined; // this table was excluded from the dataset (see LoadDatasetOptions.include)
  const blocks = table.c[code];
  if (!blocks) return undefined;
  const block = findBlock(blocks, subscriberNumber);
  if (!block) return undefined;

  const allocation = resolveAllocation(dataset, table, block, code, regions);
  const tz = resolveTimezone(allocation);
  return { input: '', normalized: null, valid: true, type, code, ...allocation, ...tz };
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

  const result =
    tryTable(dataset, dataset.fixed, code, subscriberNumber, 'fixed', regions) ??
    tryTable(dataset, dataset.mobile, code, subscriberNumber, 'mobile', regions);

  if (!result) {
    return { input, normalized, valid: false, code, reason: 'unassigned' };
  }
  return { ...result, input, normalized };
}
