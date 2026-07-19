// Copies the mobile-only dataset files (mobile.json + the small supporting
// files - never fixed.json, which is what these examples are demonstrating
// how to leave out) from the built package's dist/data into an example's
// public/data, so the example can fetch() them at runtime like a real
// browser app would. Run after `npm run build` in the repo root.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'dist', 'data');
const FILES = ['mobile.json', 'regions.json', 'operators-mobile.json', 'timezones.json', 'meta.json'];

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('usage: node copy-mobile-data.mjs <targetDir>');
  process.exit(1);
}

if (!existsSync(SOURCE_DIR)) {
  console.error(`${SOURCE_DIR} does not exist - run "npm run build" in the repo root first.`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
for (const file of FILES) {
  cpSync(path.join(SOURCE_DIR, file), path.join(targetDir, file));
}
console.log(`copied ${FILES.length} mobile-only dataset files to ${targetDir}`);
