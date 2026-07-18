import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Quirk } from './quirks.js';

const RULE_KINDS = new Set(['organization-name-rule', 'allocation-field-rule']);

/**
 * Loads user-supplied quirks from an external file, so a fix can be added
 * without touching the built-in list in quirks.ts.
 *
 * - `.json`: must contain a plain JSON array of data-only quirks
 *   (`organization-name` / `allocation-field`). Rule-based kinds need a JS
 *   function and can't be expressed in JSON - use a module file for those.
 * - `.js`/`.mjs`/`.cjs`/`.ts`: loaded via dynamic `import()`; must
 *   default-export (or export as `QUIRKS`) an array of quirks, so rule-based
 *   kinds are fair game. Native `.ts` execution depends on the runtime that
 *   loads this module (works under tsx/vitest; a plain `node` run of the
 *   published CLI needs a loader, or a pre-compiled `.js` file instead).
 */
export async function loadUserQuirks(filePath: string): Promise<Quirk[]> {
  const resolved = path.resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`quirks file not found: ${resolved}`);
  }

  const quirks = path.extname(resolved) === '.json' ? loadJsonQuirks(resolved) : await loadModuleQuirks(resolved);

  if (!Array.isArray(quirks)) {
    throw new Error(`quirks file ${resolved} must export an array of quirks.`);
  }
  return quirks;
}

function loadJsonQuirks(resolved: string): Quirk[] {
  const parsed: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`quirks file ${resolved} must contain a JSON array of quirks.`);
  }
  for (const quirk of parsed) {
    const kind = quirk && typeof quirk === 'object' ? (quirk as { kind?: unknown }).kind : undefined;
    if (typeof kind === 'string' && RULE_KINDS.has(kind)) {
      throw new Error(
        `quirks file ${resolved}: "${kind}" quirks need a JS function and can't be expressed in JSON - use a .js/.ts quirks file instead.`,
      );
    }
  }
  return parsed as Quirk[];
}

async function loadModuleQuirks(resolved: string): Promise<Quirk[]> {
  const mod: { default?: unknown; QUIRKS?: unknown } = await import(pathToFileURL(resolved).href);
  const quirks = mod.default ?? mod.QUIRKS;
  if (!Array.isArray(quirks)) {
    throw new Error(
      `quirks file ${resolved} must export an array of quirks as its default export (or a named "QUIRKS" export).`,
    );
  }
  return quirks;
}
