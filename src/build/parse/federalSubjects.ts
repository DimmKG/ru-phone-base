/**
 * Canonical registry of Russian federal subjects used as the normalization
 * target for the messy region names found in the raw CSVs. `osmRelationId`
 * is filled in by `src/build/osm/fetchSubjectTimezones.ts` (resolved once,
 * by hand-verified `admin_level=4` Overpass lookups) and cached there -
 * this file only carries the stable identity (slug + canonical display
 * name) plus which subjects are candidates for multi-timezone handling.
 */
export interface FederalSubject {
  slug: string;
  name: string;
  /** Latin-script display name (English exonym or standard transliteration). */
  nameLatin: string;
  /** Seed list for the OSM build step's multi-timezone auto-detection; not a guarantee. */
  multiTzCandidate?: boolean;
}

export const FEDERAL_SUBJECTS: FederalSubject[] = [
  // Federal cities
  { slug: 'moscow', name: 'город Москва', nameLatin: 'Moscow' },
  { slug: 'saint-petersburg', name: 'город Санкт-Петербург', nameLatin: 'Saint Petersburg' },
  { slug: 'sevastopol', name: 'город Севастополь', nameLatin: 'Sevastopol' },
  // Special status
  { slug: 'baikonur', name: 'город Байконур', nameLatin: 'Baikonur' },

  // Krais
  { slug: 'altai-krai', name: 'Алтайский край', nameLatin: 'Altai Krai' },
  { slug: 'zabaykalsky-krai', name: 'Забайкальский край', nameLatin: 'Zabaykalsky Krai' },
  { slug: 'kamchatka-krai', name: 'Камчатский край', nameLatin: 'Kamchatka Krai' },
  { slug: 'krasnodar-krai', name: 'Краснодарский край', nameLatin: 'Krasnodar Krai' },
  { slug: 'krasnoyarsk-krai', name: 'Красноярский край', nameLatin: 'Krasnoyarsk Krai', multiTzCandidate: true },
  { slug: 'perm-krai', name: 'Пермский край', nameLatin: 'Perm Krai' },
  { slug: 'primorsky-krai', name: 'Приморский край', nameLatin: 'Primorsky Krai' },
  { slug: 'stavropol-krai', name: 'Ставропольский край', nameLatin: 'Stavropol Krai' },
  { slug: 'khabarovsk-krai', name: 'Хабаровский край', nameLatin: 'Khabarovsk Krai' },

  // Oblasts
  { slug: 'amur-oblast', name: 'Амурская область', nameLatin: 'Amur Oblast' },
  { slug: 'arkhangelsk-oblast', name: 'Архангельская область', nameLatin: 'Arkhangelsk Oblast' },
  { slug: 'astrakhan-oblast', name: 'Астраханская область', nameLatin: 'Astrakhan Oblast' },
  { slug: 'belgorod-oblast', name: 'Белгородская область', nameLatin: 'Belgorod Oblast' },
  { slug: 'bryansk-oblast', name: 'Брянская область', nameLatin: 'Bryansk Oblast' },
  { slug: 'vladimir-oblast', name: 'Владимирская область', nameLatin: 'Vladimir Oblast' },
  { slug: 'volgograd-oblast', name: 'Волгоградская область', nameLatin: 'Volgograd Oblast' },
  { slug: 'vologda-oblast', name: 'Вологодская область', nameLatin: 'Vologda Oblast' },
  { slug: 'voronezh-oblast', name: 'Воронежская область', nameLatin: 'Voronezh Oblast' },
  { slug: 'ivanovo-oblast', name: 'Ивановская область', nameLatin: 'Ivanovo Oblast' },
  { slug: 'irkutsk-oblast', name: 'Иркутская область', nameLatin: 'Irkutsk Oblast' },
  { slug: 'kaliningrad-oblast', name: 'Калининградская область', nameLatin: 'Kaliningrad Oblast' },
  { slug: 'kaluga-oblast', name: 'Калужская область', nameLatin: 'Kaluga Oblast' },
  { slug: 'kemerovo-oblast', name: 'Кемеровская область - Кузбасс', nameLatin: 'Kemerovo Oblast–Kuzbass' },
  { slug: 'kirov-oblast', name: 'Кировская область', nameLatin: 'Kirov Oblast' },
  { slug: 'kostroma-oblast', name: 'Костромская область', nameLatin: 'Kostroma Oblast' },
  { slug: 'kurgan-oblast', name: 'Курганская область', nameLatin: 'Kurgan Oblast' },
  { slug: 'kursk-oblast', name: 'Курская область', nameLatin: 'Kursk Oblast' },
  { slug: 'leningrad-oblast', name: 'Ленинградская область', nameLatin: 'Leningrad Oblast' },
  { slug: 'lipetsk-oblast', name: 'Липецкая область', nameLatin: 'Lipetsk Oblast' },
  { slug: 'magadan-oblast', name: 'Магаданская область', nameLatin: 'Magadan Oblast' },
  { slug: 'moscow-oblast', name: 'Московская область', nameLatin: 'Moscow Oblast' },
  { slug: 'murmansk-oblast', name: 'Мурманская область', nameLatin: 'Murmansk Oblast' },
  { slug: 'nizhny-novgorod-oblast', name: 'Нижегородская область', nameLatin: 'Nizhny Novgorod Oblast' },
  { slug: 'novgorod-oblast', name: 'Новгородская область', nameLatin: 'Novgorod Oblast' },
  { slug: 'novosibirsk-oblast', name: 'Новосибирская область', nameLatin: 'Novosibirsk Oblast' },
  { slug: 'omsk-oblast', name: 'Омская область', nameLatin: 'Omsk Oblast' },
  { slug: 'orenburg-oblast', name: 'Оренбургская область', nameLatin: 'Orenburg Oblast' },
  { slug: 'oryol-oblast', name: 'Орловская область', nameLatin: 'Oryol Oblast' },
  { slug: 'penza-oblast', name: 'Пензенская область', nameLatin: 'Penza Oblast' },
  { slug: 'pskov-oblast', name: 'Псковская область', nameLatin: 'Pskov Oblast' },
  { slug: 'rostov-oblast', name: 'Ростовская область', nameLatin: 'Rostov Oblast' },
  { slug: 'ryazan-oblast', name: 'Рязанская область', nameLatin: 'Ryazan Oblast' },
  { slug: 'samara-oblast', name: 'Самарская область', nameLatin: 'Samara Oblast' },
  { slug: 'saratov-oblast', name: 'Саратовская область', nameLatin: 'Saratov Oblast' },
  { slug: 'sakhalin-oblast', name: 'Сахалинская область', nameLatin: 'Sakhalin Oblast' },
  { slug: 'sverdlovsk-oblast', name: 'Свердловская область', nameLatin: 'Sverdlovsk Oblast' },
  { slug: 'smolensk-oblast', name: 'Смоленская область', nameLatin: 'Smolensk Oblast' },
  { slug: 'tambov-oblast', name: 'Тамбовская область', nameLatin: 'Tambov Oblast' },
  { slug: 'tver-oblast', name: 'Тверская область', nameLatin: 'Tver Oblast' },
  { slug: 'tomsk-oblast', name: 'Томская область', nameLatin: 'Tomsk Oblast' },
  { slug: 'tula-oblast', name: 'Тульская область', nameLatin: 'Tula Oblast' },
  { slug: 'tyumen-oblast', name: 'Тюменская область', nameLatin: 'Tyumen Oblast' },
  { slug: 'ulyanovsk-oblast', name: 'Ульяновская область', nameLatin: 'Ulyanovsk Oblast' },
  { slug: 'chelyabinsk-oblast', name: 'Челябинская область', nameLatin: 'Chelyabinsk Oblast' },
  { slug: 'yaroslavl-oblast', name: 'Ярославская область', nameLatin: 'Yaroslavl Oblast' },

  // Republics
  { slug: 'adygea', name: 'Республика Адыгея', nameLatin: 'Republic of Adygea' },
  { slug: 'altai-republic', name: 'Республика Алтай', nameLatin: 'Altai Republic' },
  { slug: 'bashkortostan', name: 'Республика Башкортостан', nameLatin: 'Republic of Bashkortostan' },
  { slug: 'buryatia', name: 'Республика Бурятия', nameLatin: 'Republic of Buryatia' },
  { slug: 'dagestan', name: 'Республика Дагестан', nameLatin: 'Republic of Dagestan' },
  { slug: 'ingushetia', name: 'Республика Ингушетия', nameLatin: 'Republic of Ingushetia' },
  { slug: 'kabardino-balkaria', name: 'Кабардино-Балкарская Республика', nameLatin: 'Kabardino-Balkarian Republic' },
  { slug: 'kalmykia', name: 'Республика Калмыкия', nameLatin: 'Republic of Kalmykia' },
  { slug: 'karachay-cherkessia', name: 'Карачаево-Черкесская Республика', nameLatin: 'Karachay-Cherkess Republic' },
  { slug: 'karelia', name: 'Республика Карелия', nameLatin: 'Republic of Karelia' },
  { slug: 'komi', name: 'Республика Коми', nameLatin: 'Komi Republic' },
  { slug: 'crimea', name: 'Республика Крым', nameLatin: 'Republic of Crimea' },
  { slug: 'mari-el', name: 'Республика Марий Эл', nameLatin: 'Mari El Republic' },
  { slug: 'mordovia', name: 'Республика Мордовия', nameLatin: 'Republic of Mordovia' },
  { slug: 'sakha', name: 'Республика Саха (Якутия)', nameLatin: 'Republic of Sakha (Yakutia)', multiTzCandidate: true },
  {
    slug: 'north-ossetia-alania',
    name: 'Республика Северная Осетия - Алания',
    nameLatin: 'Republic of North Ossetia–Alania',
  },
  { slug: 'tatarstan', name: 'Республика Татарстан', nameLatin: 'Republic of Tatarstan' },
  { slug: 'tyva', name: 'Республика Тыва', nameLatin: 'Tyva Republic' },
  { slug: 'udmurtia', name: 'Удмуртская Республика', nameLatin: 'Udmurt Republic' },
  { slug: 'khakassia', name: 'Республика Хакасия', nameLatin: 'Republic of Khakassia' },
  { slug: 'chechnya', name: 'Чеченская Республика', nameLatin: 'Chechen Republic' },
  { slug: 'chuvashia', name: 'Чувашская Республика', nameLatin: 'Chuvash Republic' },

  // Autonomous oblast / okrugs
  { slug: 'jewish-ao', name: 'Еврейская автономная область', nameLatin: 'Jewish Autonomous Oblast' },
  { slug: 'nenets-ao', name: 'Ненецкий автономный округ', nameLatin: 'Nenets Autonomous Okrug' },
  {
    slug: 'khanty-mansi-ao',
    name: 'Ханты-Мансийский автономный округ - Югра',
    nameLatin: 'Khanty-Mansi Autonomous Okrug–Yugra',
  },
  { slug: 'yamalo-nenets-ao', name: 'Ямало-Ненецкий автономный округ', nameLatin: 'Yamalo-Nenets Autonomous Okrug' },
  { slug: 'chukotka-ao', name: 'Чукотский автономный округ', nameLatin: 'Chukotka Autonomous Okrug' },

  // Territories claimed/administered by Russia since 2022, as they appear in the registry
  { slug: 'donetsk-pr', name: 'Донецкая Народная Республика', nameLatin: "Donetsk People's Republic" },
  { slug: 'luhansk-pr', name: 'Луганская Народная Республика', nameLatin: "Luhansk People's Republic" },
  { slug: 'zaporizhzhia-oblast', name: 'Запорожская область', nameLatin: 'Zaporizhzhia Oblast' },
  { slug: 'kherson-oblast', name: 'Херсонская область', nameLatin: 'Kherson Oblast' },
];

export const FEDERAL_SUBJECT_SLUGS = new Set(FEDERAL_SUBJECTS.map((s) => s.slug));

/**
 * Non-geographic pseudo-entries: display-name-only, deliberately excluded
 * from FEDERAL_SUBJECTS (and thus never looked up in OSM Overpass or given a
 * timezones.json entry). `all-russia` represents nationwide non-geographic
 * blocks (e.g. 8-800 toll-free ABC-8xx rows with `Территория ГАР ==
 * "Российская Федерация"`) - such a number genuinely has no single home
 * region or timezone, and the runtime deliberately leaves `timezone` unset
 * for it rather than guessing one (see resolveTimezones in src/lookup.ts).
 */
export const PSEUDO_SUBJECTS: FederalSubject[] = [
  { slug: 'all-russia', name: 'Российская Федерация', nameLatin: 'Russian Federation' },
];
