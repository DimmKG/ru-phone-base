import { createRuPhoneBaseFromData, assertDatasetFileHashesAsync } from 'ru-phone-base/browser';

async function fetchText(baseUrl, name) {
  const res = await fetch(`${baseUrl}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetches the dataset from `baseUrl`, verifies SHA-256 for every file
 * against `meta.files` (on the raw fetched text, before parsing - see
 * assertDatasetFileHashesAsync's docs for why that ordering matters), then
 * builds a lookup instance via createRuPhoneBaseFromData.
 *
 * `includeFixed: false` skips fetching fixed.json (by far the largest file)
 * entirely, demonstrating the same `include` tradeoff `createRuPhoneBase`
 * offers on the Node side - this app's mode toggle drives it live.
 */
export async function loadRuPhoneBase({ includeFixed, baseUrl = '/data', onProgress }) {
  const t0 = performance.now();
  onProgress?.({ stage: 'fetching-meta' });
  const meta = JSON.parse(await fetchText(baseUrl, 'meta.json'));

  const names = [
    ...(includeFixed ? ['fixed.json'] : []),
    'mobile.json',
    'regions.json',
    includeFixed ? 'operators.json' : 'operators-mobile.json',
    'timezones.json',
  ];

  onProgress?.({ stage: 'fetching', names });
  const texts = await Promise.all(names.map((name) => fetchText(baseUrl, name)));
  const bytes = texts.reduce((sum, t) => sum + new Blob([t]).size, 0);

  onProgress?.({ stage: 'verifying' });
  await assertDatasetFileHashesAsync(
    meta,
    names.map((file, i) => ({ file, content: texts[i] })),
  );

  onProgress?.({ stage: 'parsing' });
  const parsed = Object.fromEntries(names.map((name, i) => [name.slice(0, -'.json'.length), JSON.parse(texts[i])]));

  const dataset = {
    ...(includeFixed ? { fixed: parsed.fixed } : {}),
    mobile: parsed.mobile,
    regions: parsed.regions,
    operators: includeFixed ? parsed.operators : parsed['operators-mobile'],
    timezones: parsed.timezones,
    meta,
  };

  const lib = createRuPhoneBaseFromData(dataset);
  const elapsedMs = performance.now() - t0;

  return { lib, stats: { includeFixed, files: names, bytes, elapsedMs } };
}
