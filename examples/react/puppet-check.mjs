import puppeteer from 'puppeteer-core';

// CI (browser-actions/setup-chrome) sets PUPPETEER_EXECUTABLE_PATH; falls
// back to a common local Chromium path for running this by hand.
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

const consoleLines = [];
page.on('console', (msg) => consoleLines.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`));

await page.goto('http://localhost:4176/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.hint--ok', { timeout: 15000 });

// Click "МТС (мобильный)" example button and read the result card.
const mtsButton = await page.$$eval(
  '.examples button',
  (buttons, label) => {
    const btn = buttons.find((b) => b.textContent === label);
    return btn ? Array.from(document.querySelectorAll('.examples button')).indexOf(btn) : -1;
  },
  'МТС (мобильный)',
);
if (mtsButton === -1) throw new Error('MTS example button not found');
await page.click(`.examples button:nth-child(${mtsButton + 1})`);
await page.waitForSelector('.card--ok', { timeout: 5000 });
const mtsCardText = await page.$eval('.card--ok', (el) => el.textContent);

// Toggle to mobile-only mode and re-check the same MTS number still resolves,
// then a fixed-line example now reports "не назначен".
await page.click('.toggle input[type="checkbox"]');
await page.waitForFunction(() => document.querySelector('.hint--ok')?.textContent.includes('SHA-256 проверен'), {
  timeout: 15000,
});
await page.waitForFunction(() => !document.querySelector('.toggle input')?.checked);
const mobileOnlyHint = await page.$eval('.panel .hint', (el) => el.textContent);

await page.click('.examples button:first-child'); // "Москва (городской)"
await page.waitForSelector('.card--warn', { timeout: 5000 });
const moscowFixedUnderMobileOnly = await page.$eval('.card--warn', (el) => el.textContent);

const result = {
  mtsCardText,
  mobileOnlyHint,
  moscowFixedUnderMobileOnly,
  // Chrome auto-requests /favicon.ico and logs its 404 as a generic "Failed
  // to load resource" console.error with no URL in the message text - not
  // something our app did, so it's excluded here rather than pattern-matched
  // by URL.
  consoleErrors: consoleLines.filter(
    (l) => l.startsWith('[pageerror]') || (l.includes('[console.error]') && !l.includes('Failed to load resource')),
  ),
};

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (!mtsCardText.includes('Мобильные ТелеСистемы')) {
  console.error('FAIL: MTS lookup did not resolve to MTS');
  process.exit(1);
}
if (!moscowFixedUnderMobileOnly.includes('не назначен')) {
  console.error('FAIL: expected Moscow fixed number to be unassigned in mobile-only mode');
  process.exit(1);
}
if (result.consoleErrors.length > 0) {
  console.error('FAIL: console errors present', result.consoleErrors);
  process.exit(1);
}
console.log('REACT DEMO SMOKE OK');
