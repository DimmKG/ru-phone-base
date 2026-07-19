import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    target: 'node18',
    outDir: 'dist',
    // provides a working import.meta.url shim in the CJS build (dataLoader.ts uses it to locate bundled data)
    shims: true,
    // JSON data files are read from disk at runtime (see src/dataLoader.ts),
    // not inlined, so the same loader works for a caller-supplied dataDir too.
    async onSuccess() {
      cpSync('src/data', 'dist/data', { recursive: true });
    },
  },
  {
    entry: { 'bin/build-data': 'src/bin/build-data.ts', 'bin/diff-dataset': 'src/bin/diff-dataset.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: false,
    clean: false,
    splitting: false,
    target: 'node18',
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
