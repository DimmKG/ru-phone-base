// Like copy-mobile-data.mjs, but copies everything needed to demo toggling
// between the full (fixed+mobile) and mobile-only loading modes at runtime:
// both tables plus both operator indexes.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'dist', 'data');
const FILES = [
  'fixed.json',
  'mobile.json',
  'regions.json',
  'operators.json',
  'operators-mobile.json',
  'timezones.json',
  'meta.json',
];

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('usage: node copy-full-data.mjs <targetDir>');
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
console.log(`copied ${FILES.length} dataset files to ${targetDir}`);
