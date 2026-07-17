import { runOverpassQuery } from './overpassClient.js';
import { SUBJECT_ISO_CODES } from './subjectIsoCodes.js';
import { FEDERAL_SUBJECTS } from '../parse/federalSubjects.js';

const RUSSIA_RELATION_ID = 60189;
const SAKHA_RELATION_ID = 151234;

const MAIN_QUERY = `
[out:json][timeout:180];
area(${3600000000 + RUSSIA_RELATION_ID})->.ru;
relation(area.ru)["boundary"="administrative"]["admin_level"="4"]["timezone"];
out tags;
`.trim();

const SAKHA_DISTRICTS_QUERY = `
[out:json][timeout:120];
area(${3600000000 + SAKHA_RELATION_ID})->.sakha;
relation(area.sakha)["boundary"="administrative"]["admin_level"="6"]["timezone"];
out tags;
`.trim();

/**
 * Subjects with no admin_level=4 `timezone` tag in OSM at all (evidently
 * mappers mostly bother tagging it for non-obvious/non-Moscow zones) - see
 * README notes in this file's companion report. Filled in from well
 * documented, stable Russian timezone assignments.
 */
const FALLBACK_TIMEZONES: Record<string, string> = {
  moscow: 'Europe/Moscow',
  'saint-petersburg': 'Europe/Moscow',
  'vladimir-oblast': 'Europe/Moscow',
  'voronezh-oblast': 'Europe/Moscow',
  'ivanovo-oblast': 'Europe/Moscow',
  'kostroma-oblast': 'Europe/Moscow',
  'murmansk-oblast': 'Europe/Moscow',
  'novgorod-oblast': 'Europe/Moscow',
  'nizhny-novgorod-oblast': 'Europe/Moscow',
  'penza-oblast': 'Europe/Moscow',
  'rostov-oblast': 'Europe/Moscow',
  'ryazan-oblast': 'Europe/Moscow',
  'tambov-oblast': 'Europe/Moscow',
  'vologda-oblast': 'Europe/Moscow',
  'yaroslavl-oblast': 'Europe/Moscow',
  adygea: 'Europe/Moscow',
  'krasnodar-krai': 'Europe/Moscow',
  'stavropol-krai': 'Europe/Moscow',
  dagestan: 'Europe/Moscow',
  ingushetia: 'Europe/Moscow',
  'kabardino-balkaria': 'Europe/Moscow',
  'karachay-cherkessia': 'Europe/Moscow',
  'north-ossetia-alania': 'Europe/Moscow',
  kalmykia: 'Europe/Moscow',
  mordovia: 'Europe/Moscow',
  chuvashia: 'Europe/Moscow',
  'mari-el': 'Europe/Moscow',
  tatarstan: 'Europe/Moscow',
  karelia: 'Europe/Moscow',
  'jewish-ao': 'Asia/Vladivostok',
  'khabarovsk-krai': 'Asia/Vladivostok',
  'primorsky-krai': 'Asia/Vladivostok',
  'amur-oblast': 'Asia/Yakutsk',
  'sakhalin-oblast': 'Asia/Sakhalin',
  buryatia: 'Asia/Irkutsk',
};

/**
 * Subjects/entries where an OSM Russian-administration relation isn't
 * available at all (the 2022-annexed territories aren't represented as a
 * distinct Russian-administration admin_level=4 boundary in OSM), or where
 * the number belongs to a special-status resource rather than a normal
 * federal subject (Baikonur, leased to Kazakhstan but run on Moscow time by
 * Russian-Kazakh treaty; see ni-00 "international network" notes). Handled
 * last/lowest-priority per explicit product decision - these are rare edge
 * cases, not the common path.
 */
const SPECIAL_CASE_TIMEZONES: Record<string, string> = {
  baikonur: 'Europe/Moscow',
  'donetsk-pr': 'Europe/Moscow',
  'luhansk-pr': 'Europe/Moscow',
  'zaporizhzhia-oblast': 'Europe/Moscow',
  'kherson-oblast': 'Europe/Moscow',
};

const CRIMEA_SEVASTOPOL_NAMES: Record<string, string> = {
  crimea: 'Республика Крым',
  sevastopol: 'Севастополь',
};

export interface SakhaDistrictOverride {
  default: string;
  byDistrict: Record<string, string>;
}

export type TimezoneEntry = string | SakhaDistrictOverride;

export interface FetchResult {
  timezones: Record<string, TimezoneEntry>;
  matchedFromOsm: string[];
  filledFromFallback: string[];
  unresolved: string[];
}

export async function fetchSubjectTimezones(
  options: { cacheDir?: string; refresh?: boolean } = {},
): Promise<FetchResult> {
  const elements = await runOverpassQuery(MAIN_QUERY, options);

  const byIso = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const el of elements) {
    const iso = el.tags['ISO3166-2'];
    const tz = el.tags.timezone;
    const name = el.tags['name:ru'] ?? el.tags.name;
    if (!tz) continue;
    // Prefer the Russian-administration relation when both a `UA-*` and a
    // Russian one exist for the same disputed territory (only relevant for
    // name-based matches below - ISO-tagged ones are unambiguous).
    if (iso && !iso.startsWith('UA-')) byIso.set(iso, tz);
    if (name && !byName.has(name)) byName.set(name, tz);
    else if (name && iso && !iso.startsWith('UA-')) byName.set(name, tz); // Russian relation wins on name collision
  }

  const timezones: Record<string, TimezoneEntry> = {};
  const matchedFromOsm: string[] = [];
  const filledFromFallback: string[] = [];
  const unresolved: string[] = [];

  for (const subject of FEDERAL_SUBJECTS) {
    if (subject.slug === 'sakha') continue; // handled separately below (district-level override)

    if (SPECIAL_CASE_TIMEZONES[subject.slug]) {
      timezones[subject.slug] = SPECIAL_CASE_TIMEZONES[subject.slug];
      continue;
    }

    const iso = SUBJECT_ISO_CODES[subject.slug];
    const crimeaName = CRIMEA_SEVASTOPOL_NAMES[subject.slug];

    let tz: string | undefined;
    if (iso && byIso.has(iso)) {
      tz = byIso.get(iso);
    } else if (crimeaName && byName.has(crimeaName)) {
      tz = byName.get(crimeaName);
    }

    if (tz) {
      timezones[subject.slug] = tz;
      matchedFromOsm.push(subject.slug);
      continue;
    }

    if (FALLBACK_TIMEZONES[subject.slug]) {
      timezones[subject.slug] = FALLBACK_TIMEZONES[subject.slug];
      filledFromFallback.push(subject.slug);
      continue;
    }

    unresolved.push(subject.slug);
  }

  // Sakha/Yakutia genuinely spans several zones; OSM tags this at ulus
  // (district) level rather than on the republic itself.
  const sakhaDistricts = await runOverpassQuery(SAKHA_DISTRICTS_QUERY, options);
  const byDistrict: Record<string, string> = {};
  for (const el of sakhaDistricts) {
    const name = el.tags['name:ru'] ?? el.tags.name;
    const tz = el.tags.timezone;
    if (name && tz) byDistrict[normalizeDistrictName(name)] = tz;
  }
  timezones.sakha = { default: 'Asia/Yakutsk', byDistrict };

  return { timezones, matchedFromOsm, filledFromFallback, unresolved };
}

/** Strips the "улус"/"район" administrative suffix so lookup can match place-hierarchy tokens loosely. */
export function normalizeDistrictName(name: string): string {
  return name.replace(/\s+(улус|район)$/iu, '').trim();
}
