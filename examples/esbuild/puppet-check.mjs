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
page.on('requestfailed', (req) => consoleLines.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

await page.goto('http://localhost:4175/', { waitUntil: 'networkidle0' });
const result = await page.evaluate(() => window.__RESULT__);

console.log('--- console/page events ---');
for (const line of consoleLines) console.log(line);
console.log('--- window.__RESULT__ ---');
console.log(JSON.stringify(result, null, 2));

await browser.close();

if (!result || result.ok !== true) {
  console.error('SMOKE CHECK FAILED');
  process.exit(1);
}
if (result.mobileResult.valid !== true) {
  console.error('expected mobile number to be valid');
  process.exit(1);
}
if (result.fixedResult.valid !== false || result.fixedResult.reason !== 'unassigned') {
  console.error('expected fixed lookup to be unassigned (fixed table was never loaded)');
  process.exit(1);
}
if (!(result.regionsCount > 80)) {
  console.error('expected > 80 regions');
  process.exit(1);
}
console.log('ESBUILD BROWSER SMOKE OK');
