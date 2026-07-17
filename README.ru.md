# ru-phone-base

Машиночитаемый план нумерации телефонных номеров России: определение **региона**, **оператора** и **часового пояса** для любого российского телефонного номера на основе официального реестра нумерации Минцифры.

[English version](./README.md)

## Возможности

- Определение региона, оператора и часового пояса для номеров фиксированной и мобильной связи
- Построена на полном официальном реестре (~450 000 строк, точные диапазоны номеров — без приближений)
- Часовые пояса получены из OpenStreetMap Overpass один раз при сборке и закэшированы — никаких сетевых запросов во время работы
- Собирается и как ESM, и как CommonJS, с типами TypeScript
- Работает как в Node.js, так и в браузере (при передаче собственных JSON-данных)
- Включает CLI для пересборки базы данных из свежей копии реестра

## Установка

```bash
npm install ru-phone-base
```

## Быстрый старт

```ts
import { lookupPhoneNumber } from 'ru-phone-base';

const result = lookupPhoneNumber('+7 495 123-45-67');

console.log(result);
// {
//   input: '+7 495 123-45-67',
//   normalized: '74951234567',
//   valid: true,
//   type: 'fixed',
//   code: '495',
//   operator: 'ПАО МГТС',
//   inn: '7710016640',
//   region: [{ slug: 'moscow', name: 'город Москва', nameLatin: 'Moscow', timezone: 'Europe/Moscow' }],
//   settlement: 'Город Москва',
//   timezone: 'Europe/Moscow',
// }
```

Принимаемые форматы номера: `+7XXXXXXXXXX`, `8XXXXXXXXXX`, `7XXXXXXXXXX`, а также «голый» 10-значный номер абонента — с любыми пробелами, дефисами, точками или скобками в качестве разделителей.

## API

### `lookupPhoneNumber(input: string): LookupResult`

Ищет номер телефона по базе данных, поставляемой вместе с пакетом.

```ts
interface LookupResult {
  input: string;
  normalized: string | null; // например "74951234567", или null, если номер не распознан
  valid: boolean;
  type?: 'fixed' | 'mobile';
  code?: string; // 3-значный код АВС/DEF
  operator?: string;
  inn?: string;
  region?: RegionInfo[];
  settlement?: string; // город/посёлок/село, если в реестре указано конкретное место
  nationwide?: boolean; // true для федеральных/негеографических номеров (коды 800-809: горячие линии 8-800, телеголосование и т.п.), не привязанных к одному региону
  timezone?: string; // любая реальная аллокация лежит в одном часовом поясе; отсутствует для федеральных номеров
  reason?: 'invalid-format' | 'unassigned';
}

interface RegionInfo {
  slug: string;
  name: string;
  nameLatin: string;
  timezone?: string;
}
```

**Федеральные (негеографические) номера**: номера с кодами 800–809 (горячие линии 8-800, телеголосование и подобные федеральные ресурсы) не привязаны к одному региону. Для них всегда возвращается `nationwide: true` и `timezone` отсутствует — независимо от того, какие данные о регионе реестр указывает для конкретного блока, поскольку именно код делает номер федеральным. `region` в таких случаях часто пуст (`[]`), но может содержать один или несколько субъектов, указанных в реестре — считайте это справочной информацией, а не «домашним регионом» номера.

### `normalizePhoneNumber(input: string): string | null`

Шаг нормализации, который `lookupPhoneNumber` использует внутри себя, вынесенный отдельно.

### `getRegions(): RegionInfo[]`

Возвращает список всех федеральных субъектов, известных базе данных, с определённым для каждого часовым поясом.

```ts
import { getRegions } from 'ru-phone-base';

getRegions().find((r) => r.slug === 'sakha');
// { slug: 'sakha', name: 'Республика Саха (Якутия)', nameLatin: 'Republic of Sakha (Yakutia)', timezone: 'Asia/Yakutsk' }
```

### Своё расположение базы данных

```ts
import { createRuPhoneBase } from 'ru-phone-base';

const custom = createRuPhoneBase({ dataDir: '/path/to/regenerated/dataset' });
custom.lookupPhoneNumber('+74951234567');
```

Укажите путь к результату работы CLI `ru-phone-base-build` (см. ниже), чтобы использовать свежепересобранную базу без переустановки пакета.

### Опциональные таблицы поиска (`fixed` / `mobile`)

В собранной базе две таблицы поиска — фиксированная связь (`fixed.json`, ~12 МБ) и мобильная (`mobile.json`, ~450 КБ). По умолчанию загружаются обе; параметр `include` позволяет загрузить только нужные. Вспомогательные файлы `regions.json`, `timezones.json` и `meta.json` небольшие и всегда обязательны.

```ts
import { createRuPhoneBase } from 'ru-phone-base';

const mobileOnly = createRuPhoneBase({ include: ['mobile'] });

mobileOnly.lookupPhoneNumber('+79161234567'); // работает
mobileOnly.lookupPhoneNumber('+74951234567'); // { valid: false, reason: 'unassigned' }
```

В браузере передайте в `createRuPhoneBaseFromData` только загруженные таблицы — без `fixed`, чтобы самый большой файл не попал в бандл:

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

Тот же подход работает и наоборот — `include: ['fixed']`, если нужны только номера фиксированной связи.

### Использование в браузере

`createRuPhoneBase` читает базу данных с диска (только для Node.js), а сама база данных большая (`fixed.json` — несколько мегабайт даже после минификации) — **не импортируйте JSON-файлы статически в браузерное приложение**: бандлер встроит всю базу данных в ваш JS-бандл и отправит её каждому посетителю.

**Рекомендуется: искать номера на сервере, отправлять в браузер только результат.** Большинству приложений вообще не нужен поиск на стороне клиента:

```ts
// сервер (Node) — обычное использование, без изменений
import { lookupPhoneNumber } from 'ru-phone-base';
app.get('/api/phone-lookup', (req, res) => {
  res.json(lookupPhoneNumber(req.query.number));
});
```

```ts
// браузер — просто обращается к вашему API, никогда не касается базы данных
const result = await fetch(`/api/phone-lookup?number=${encodeURIComponent(input)}`).then((r) => r.json());
```

**Если приложению действительно нужен офлайн-поиск на клиенте** (например, PWA), запрашивайте собранные JSON во время выполнения через `fetch()`, а не встраивайте их статически, и кэшируйте результат (Service Worker, IndexedDB, `Cache` API), чтобы скачивание происходило только один раз:

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

`baseUrl` — это место, куда вы сами разместите пять JSON-файлов из `node_modules/ru-phone-base/dist/data/`: собственные статические файлы/CDN, либо напрямую с npm через jsDelivr/unpkg. Загружать все файлы не обязательно — см. раздел [Опциональные таблицы поиска](#опциональные-таблицы-поиска-fixed--mobile) выше, если нужны только мобильные или только городские номера.

## Пересборка базы данных

Реестр периодически обновляется. Встроенную базу данных можно в любой момент пересобрать из свежей копии реестра с помощью CLI, устанавливаемого вместе с пакетом:

```bash
npx ru-phone-base-build --output ./my-dataset
```

| Флаг                  | Описание                                                                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <dir>`      | **(обязательный)** Папка для записи собранной базы данных. Рядом с ней создаётся папка `reports/` (`discrepancies.json`, `unmapped-regions.json`) для проверки — она не входит в саму базу данных и не публикуется вместе с пакетом.                           |
| `--input <dir>`       | Папка с исходными CSV реестра (по умолчанию `ru-phone-base-raw` во временной папке ОС). Отсутствующие файлы автоматически скачиваются с [opendata.digital.gov.ru](https://opendata.digital.gov.ru/registry/numeric/downloads), если не указан `--no-download`. |
| `--osm-cache <dir>`   | Папка кэша ответов OSM Overpass (по умолчанию `ru-phone-base-osm-cache` во временной папке ОС).                                                                                                                                                                |
| `--download`          | Принудительно перескачать исходные CSV, даже если они уже есть.                                                                                                                                                                                                |
| `--no-download`       | Завершить с ошибкой вместо скачивания, если нужный файл отсутствует.                                                                                                                                                                                           |
| `--refresh-timezones` | Игнорировать локальный кэш OSM Overpass и заново запросить часовые пояса.                                                                                                                                                                                      |

## Источники данных

Собрано на основе [открытых данных Минцифры «Российская система и план нумерации»](https://opendata.digital.gov.ru/registry/numeric/downloads):

- `ABC-3xx.csv`, `ABC-4xx.csv`, `ABC-8xx.csv` — коды городов фиксированной связи (например, `495`/`499` Москва, `812` Санкт-Петербург). Коды 800–~809 — негеографические номера бесплатных линий; 810+ — обычные географические коды.
- `DEF-9xx.csv` — коды мобильной связи.

Названия регионов приводятся к 89 федеральным субъектам РФ (с учётом вариантов сокращений, новых регионов, вошедших в состав РФ в 2022 году, как они представлены в реестре, а также со сверкой двух «адресных» колонок реестра друг с другом. Часовые пояса определяются через OpenStreetMap Overpass на этапе сборки (несколько часовых поясов Якутии обрабатываются на уровне районов) и кэшируются в публикуемой базе данных.

Не каждый «регион» в реестре географически находится в России: Байконур (код `336`) — город, арендуемый и администрируемый Россией на территории Казахстана, и он включён как обычный субъект (`город Байконур`, `Europe/Moscow`) наравне со всеми остальными — это нормальный, ожидаемый случай, а не ошибка данных, и в будущих обновлениях реестра могут появиться другие подобные экстерриториальные записи.

## Разработка

```bash
npm install
npm run build        # собрать библиотеку (ESM + CJS + типы)
npm run build:data   # пересобрать src/data/* (--output src/data, --input raw-data)
npm test             # запустить тесты
npm run typecheck
npm run lint          # ESLint (+ Prettier через eslint-plugin-prettier)
npm run format:check  # только Prettier
```

## Лицензия

Полный текст — в [LICENSE](./LICENSE).

### Код

Код генерации БД и библиотека распространяются под лицензией MIT (часть 1 файла LICENSE).

### Данные

Собранная база данных получена из [открытых данных Минцифры «Российская система и план нумерации»](https://opendata.digital.gov.ru/registry/numeric/downloads) и распространяется на [условиях использования открытых данных, опубликованных на opendata.digital.gov.ru](https://opendata.digital.gov.ru/terms/) (часть 2 файла LICENSE; актуальный оригинал — по ссылке).
