import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  platform: 'browser',
  minify: true,
  logLevel: 'info',
});

cpSync('public/index.html', 'dist/index.html');
cpSync('public/data', 'dist/data', { recursive: true });
console.log('esbuild build done');
