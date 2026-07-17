import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const DEFAULT_OSM_CACHE_DIR = path.join(tmpdir(), 'ru-phone-base-osm-cache');

// maps.mail.ru mirrors overpass-api.de and has proven more reachable from
// this environment; overpass-api.de is kept as a secondary fallback.
const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

export interface OverpassElement {
  type: string;
  id: number;
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export interface QueryOptions {
  /** Overpass response cache directory. Defaults to {@link DEFAULT_OSM_CACHE_DIR}. */
  cacheDir?: string;
  /** Bypass the on-disk cache and re-fetch. */
  refresh?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

function cachePath(cacheDir: string, query: string): string {
  const hash = createHash('sha256').update(query).digest('hex').slice(0, 24);
  return path.join(cacheDir, `${hash}.json`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs an Overpass QL query, with on-disk caching and retry/backoff across mirrors. */
export async function runOverpassQuery(query: string, options: QueryOptions = {}): Promise<OverpassElement[]> {
  const { cacheDir = DEFAULT_OSM_CACHE_DIR, refresh = false, timeoutMs = 120_000, maxRetries = 4 } = options;

  const cacheFile = cachePath(cacheDir, query);
  if (!refresh && existsSync(cacheFile)) {
    return (JSON.parse(readFileSync(cacheFile, 'utf-8')) as OverpassResponse).elements;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 429 || response.status === 504 || response.status >= 500) {
        throw new Error(`Overpass ${endpoint} returned HTTP ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`Overpass ${endpoint} returned HTTP ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as OverpassResponse;
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(body));
      return body.elements;
    } catch (error) {
      lastError = error;
      const backoffMs = 2000 * 2 ** attempt;
      await sleep(backoffMs);
    }
  }
  throw new Error(`Overpass query failed after ${maxRetries} attempts: ${String(lastError)}`);
}
