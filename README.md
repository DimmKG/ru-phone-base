# ru-phone-base

Machine-readable Russian phone numbering plan: look up **region**, **operator**, and **timezone** for any Russian phone number, built from the official numbering registry of Russia's Ministry of Digital Development.

[Русская версия](./README.ru.md)

## Features

- Region, operator, and timezone lookup for fixed-line and mobile Russian numbers
- Built from the full official registry (~450,000 rows, exact number ranges — not an approximation)
- Timezones sourced from OpenStreetMap Overpass, resolved once at build time and cached — no network calls at runtime
- Ships as both ESM and CommonJS, with TypeScript types
- Works in Node.js and in the browser (bring your own JSON)
- Includes a CLI to regenerate the dataset from a fresh copy of the registry

## Install

```bash
npm install ru-phone-base
```

## Quick start

```ts
import { lookupPhoneNumber } from 'ru-phone-base';

const result = lookupPhoneNumber('+7 495 123-45-67');

console.log(result);
// {
//   input: '+7 495 123-45-67',
//   normalized: '74951234567',
//   valid: true,
//   data: {
//     type: 'fixed',
//     code: '495',
//     operator: 'ПАО МГТС',
//     inn: '7710016640',
//     region: [{ slug: 'moscow', name: 'город Москва', nameLatin: 'Moscow', timezone: 'Europe/Moscow' }],
//     settlement: 'Город Москва',
//     nationwide: false,
//     timezone: 'Europe/Moscow',
//   },
// }
```

Accepted input formats: `+7XXXXXXXXXX`, `8XXXXXXXXXX`, `7XXXXXXXXXX`, or a bare 10-digit subscriber number — with any spaces, dashes, dots, or parentheses as separators.

## API

### `lookupPhoneNumber(input: string): LookupResult`

Looks up a phone number using the dataset bundled with the package.

```ts
// Discriminated union on `valid` - narrow with an `if (result.valid)` check
// and TypeScript guarantees `data` is there (and `reason` isn't), or vice versa.
type LookupResult = LookupSuccess | LookupFailure;

interface LookupSuccess {
  input: string;
  normalized: string; // e.g. "74951234567"
  valid: true;
  data: PhoneNumberInfo;
}

interface LookupFailure {
  input: string;
  normalized: string | null; // null only for invalid-format (unparseable input)
  valid: false;
  reason: 'invalid-format' | 'unassigned';
}

interface PhoneNumberInfo {
  type: 'fixed' | 'mobile';
  code: string; // 3-digit ABC/DEF code
  operator: string;
  inn: string;
  region: RegionInfo[];
  settlement?: string; // city/town/village, when the registry names one specific location
  nationwide: boolean; // true for federal/non-geographic numbers (codes 800-809: 8-800 hotlines, televoting, etc.) with no single home region
  timezone?: string; // every real allocation falls within one timezone; unset for nationwide numbers
}

interface RegionInfo {
  slug: string;
  name: string;
  nameLatin: string;
  timezone?: string;
}
```

**Nationwide numbers**: numbers under codes 800–809 (8-800 toll-free, televoting, and similar federal resources) aren't tied to a single region. These always resolve with `nationwide: true` and no `timezone` — regardless of whatever region data the registry happens to record for that particular block, since the code itself is what makes a number nationwide. `region` is often empty for these (`[]`), but may still list one or more subjects the registry recorded — treat it as informational only, never as the number's "home region".

### `normalizePhoneNumber(input: string): string | null`

The normalization step `lookupPhoneNumber` uses internally, exposed standalone.

### `getRegions(): RegionInfo[]`

Lists every federal subject known to the dataset, each with its resolved timezone.

```ts
import { getRegions } from 'ru-phone-base';

getRegions().find((r) => r.slug === 'sakha');
// { slug: 'sakha', name: 'Республика Саха (Якутия)', nameLatin: 'Republic of Sakha (Yakutia)', timezone: 'Asia/Yakutsk' }
```

### Custom dataset location

```ts
import { createRuPhoneBase } from 'ru-phone-base';

const custom = createRuPhoneBase({ dataDir: '/path/to/regenerated/dataset' });
custom.lookupPhoneNumber('+74951234567');
```

Point this at the output of the `ru-phone-base-build` CLI (see below) to use a freshly regenerated dataset without reinstalling the package.

### Optional lookup tables (`fixed` / `mobile`)

The compiled dataset has two lookup tables — fixed-line (`fixed.json`, ~12 MB) and mobile (`mobile.json`, ~450 KB). By default both are loaded; pass `include` to load only the tables you need. The supporting files `regions.json`, `timezones.json`, and `meta.json` are small and always required.

```ts
import { createRuPhoneBase } from 'ru-phone-base';

const mobileOnly = createRuPhoneBase({ include: ['mobile'] });

mobileOnly.lookupPhoneNumber('+79161234567'); // works
mobileOnly.lookupPhoneNumber('+74951234567'); // { valid: false, reason: 'unassigned' }
```

In the browser, pass only the tables you fetched to `createRuPhoneBaseFromData` — omit `fixed` entirely to keep the largest file out of your bundle:

```ts
import { createRuPhoneBaseFromData } from 'ru-phone-base';

async function loadMobileOnly(baseUrl: string) {
  const [mobile, regions, timezones, meta] = await Promise.all([
    fetch(`${baseUrl}/mobile.json`).then((r) => r.json()),
    fetch(`${baseUrl}/regions.json`).then((r) => r.json()),
    fetch(`${baseUrl}/timezones.json`).then((r) => r.json()),
    fetch(`${baseUrl}/meta.json`).then((r) => r.json()),
  ]);
  return createRuPhoneBaseFromData({ mobile, regions, timezones, meta });
}
```

The same pattern works in reverse with `include: ['fixed']` when only fixed-line lookups are needed.

### Browser usage

`createRuPhoneBase` reads the dataset from disk (Node-only) and the dataset itself is large (`fixed.json` is several MB even minified) — **do not statically `import` the JSON files into a browser app**; a bundler would inline the whole dataset into your JS bundle and ship it to every visitor.

**Recommended: look up numbers on your server, send only the result to the browser.** Most apps don't actually need the lookup to happen client-side:

```ts
// server (Node) - unchanged, normal usage
import { lookupPhoneNumber } from 'ru-phone-base';
app.get('/api/phone-lookup', (req, res) => {
  res.json(lookupPhoneNumber(req.query.number));
});
```

```ts
// browser - just calls your API, never touches the dataset
const result = await fetch(`/api/phone-lookup?number=${encodeURIComponent(input)}`).then((r) => r.json());
```

**If the app genuinely needs offline/client-side lookup** (e.g. a PWA), `fetch()` the compiled JSON at runtime instead of bundling it, and cache it (Service Worker, IndexedDB, `Cache` API) so it's only downloaded once:

```ts
import { createRuPhoneBaseFromData } from 'ru-phone-base';

async function loadRuPhoneBase(baseUrl: string) {
  const names = ['fixed', 'mobile', 'regions', 'timezones', 'meta'] as const;
  const files = await Promise.all(names.map((n) => fetch(`${baseUrl}/${n}.json`).then((r) => r.json())));
  return createRuPhoneBaseFromData(Object.fromEntries(names.map((n, i) => [n, files[i]])) as never);
}

const lib = await loadRuPhoneBase('https://your-cdn.example.com/ru-phone-base-data');
lib.lookupPhoneNumber('+74951234567');
```

`baseUrl` is wherever you choose to host the five JSON files from `node_modules/ru-phone-base/dist/data/` — your own static assets/CDN, or served straight off npm via jsDelivr/unpkg. You don't have to fetch all of them: see [Optional lookup tables](#optional-lookup-tables-fixed--mobile) above if you only need mobile or fixed-line lookups.

## Regenerating the dataset

The registry changes over time. The bundled dataset can be regenerated from a fresh copy at any point using the CLI installed alongside the package:

```bash
npx ru-phone-base-build --output ./my-dataset
```

| Flag                  | Description                                                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <dir>`      | **(required)** Directory to write the compiled dataset into. A sibling `reports/` directory (`discrepancies.json`, `unmapped-regions.json`) is written alongside it for inspection — it's not part of the dataset itself and isn't published with the package.                    |
| `--input <dir>`       | Directory with the raw registry CSVs (default: a `ru-phone-base-raw` folder under the OS temp directory). Missing files are downloaded automatically from [opendata.digital.gov.ru](https://opendata.digital.gov.ru/registry/numeric/downloads) unless `--no-download` is passed. |
| `--osm-cache <dir>`   | OSM Overpass response cache directory (default: a `ru-phone-base-osm-cache` folder under the OS temp directory).                                                                                                                                                                  |
| `--download`          | Force re-download of the raw CSVs even if already present.                                                                                                                                                                                                                        |
| `--no-download`       | Fail instead of downloading if a required file is missing.                                                                                                                                                                                                                        |
| `--refresh-timezones` | Bypass the OSM Overpass on-disk cache and re-fetch timezone data.                                                                                                                                                                                                                 |

## Data sources

Built from the [«Российская система и план нумерации» (Russian numbering system and plan)](https://opendata.digital.gov.ru/registry/numeric/downloads) open dataset published by Russia's Ministry of Digital Development:

- `ABC-3xx.csv`, `ABC-4xx.csv`, `ABC-8xx.csv` — fixed-line area codes (e.g. `495`/`499` Moscow, `812` St. Petersburg). Codes 800–~809 are non-geographic toll-free numbers; 810+ are ordinary geographic codes.
- `DEF-9xx.csv` — mobile codes.

Region names are normalized against Russia's 89 federal subjects (handling abbreviation variants, the newer 2022 territories as they appear in the registry, and cross-checking the registry's two location columns against each other. Timezones are resolved from OpenStreetMap Overpass at build time (with Sakha/Yakutia's several internal timezones handled at the district level) and cached in the published dataset.

Not every "region" in the registry is geographically inside Russia: Baikonur (code `336`) is a Russian-administered city leased from Kazakhstan, and is included as its own entry (`город Байконур`, `Europe/Moscow`) the same way any other federal subject is — this is a normal, expected case, not a data error, and there may be other such extraterritorial entries in future registry updates.

## Development

```bash
npm install
npm run build        # compile the library (ESM + CJS + types)
npm run build:data    # regenerate src/data/* (--output src/data, --input raw-data)
npm test              # run the test suite
npm run typecheck
npm run lint          # ESLint (+ Prettier via eslint-plugin-prettier)
npm run format:check  # Prettier only
```

## License

See [LICENSE](./LICENSE) for the full text.

### Code

The dataset build tooling and library are distributed under the MIT license (Part 1 of LICENSE).

### Data

The compiled dataset is derived from the [open data registry «Российская система и план нумерации»](https://opendata.digital.gov.ru/registry/numeric/downloads) published by Russia's Ministry of Digital Development and is subject to the [terms of use for open data published on opendata.digital.gov.ru](https://opendata.digital.gov.ru/terms/) (Part 2 of LICENSE; authoritative copy at the link).
