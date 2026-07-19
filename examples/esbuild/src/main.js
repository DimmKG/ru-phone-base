import { createRuPhoneBaseFromData, assertDatasetFileHashesAsync, DatasetIntegrityError } from 'ru-phone-base/browser';

const out = document.getElementById('out');

async function loadMobileOnly(baseUrl) {
  const meta = await fetch(`${baseUrl}/meta.json`).then((r) => r.json());

  const names = ['mobile.json', 'regions.json', 'operators-mobile.json', 'timezones.json'];
  const texts = await Promise.all(names.map((name) => fetch(`${baseUrl}/${name}`).then((r) => r.text())));

  await assertDatasetFileHashesAsync(
    meta,
    names.map((file, i) => ({ file, content: texts[i] })),
  );

  const [mobile, regions, operators, timezones] = texts.map((t) => JSON.parse(t));
  return createRuPhoneBaseFromData({ mobile, regions, operators, timezones, meta });
}

async function checkTamperedFileIsRejected(baseUrl) {
  const meta = await fetch(`${baseUrl}/meta.json`).then((r) => r.json());
  const tamperedContent = '{"tampered":true}';
  try {
    await assertDatasetFileHashesAsync(meta, [{ file: 'regions.json', content: tamperedContent }]);
    return { rejected: false };
  } catch (err) {
    return { rejected: true, isDatasetIntegrityError: err instanceof DatasetIntegrityError, message: err.message };
  }
}

try {
  const lib = await loadMobileOnly('./data');

  const mobileResult = lib.lookupPhoneNumber('+79161234567');
  const fixedResult = lib.lookupPhoneNumber('+74951234567'); // fixed table wasn't loaded
  const regions = lib.getRegions();
  const tamperedCheck = await checkTamperedFileIsRejected('./data');

  const report = { ok: true, mobileResult, fixedResult, regionsCount: regions.length, tamperedCheck };

  window.__RESULT__ = report;
  out.textContent = JSON.stringify(report, null, 2);
  console.log('SMOKE_OK', JSON.stringify(report));
} catch (err) {
  const report = { ok: false, error: String(err && err.stack ? err.stack : err) };
  window.__RESULT__ = report;
  out.textContent = JSON.stringify(report, null, 2);
  console.error('SMOKE_FAIL', JSON.stringify(report));
}
