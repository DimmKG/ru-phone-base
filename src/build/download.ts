import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const BASE_URL = 'https://opendata.digital.gov.ru/downloads/';

// The registry portal rejects requests without a browser-like User-Agent (403).
const USER_AGENT = 'Mozilla/5.0 (compatible; ru-phone-base/1.0)';

export const RAW_DATA_FILES = ['ABC-3xx.csv', 'ABC-4xx.csv', 'ABC-8xx.csv', 'DEF-9xx.csv'] as const;

export interface DownloadOptions {
  /** Re-download even if the file already exists locally. */
  force?: boolean;
  /** Per-file fetch timeout, in ms. */
  timeoutMs?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function writeStatus(prefix: string, message: string, newline = false): void {
  process.stdout.write(`\r\x1b[K${prefix}${message}${newline ? '\n' : ''}`);
}

async function downloadFile(url: string, dest: string, prefix: string, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(dest), { recursive: true });
    await pipeline(Readable.from(buffer), createWriteStream(dest));
    return buffer.length;
  }

  const total = Number(response.headers.get('content-length')) || undefined;
  let received = 0;
  let lastPct = -1;
  const reader = response.body.getReader();
  const stream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        received += value.length;
        if (total && total > 0) {
          const pct = Math.min(100, Math.floor((received / total) * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            writeStatus(prefix, `${formatBytes(received)} / ${formatBytes(total)} (${pct}%)`);
          }
        } else {
          writeStatus(prefix, formatBytes(received));
        }
        this.push(Buffer.from(value));
      } catch (error) {
        this.destroy(error as Error);
      }
    },
  });

  await pipeline(stream, createWriteStream(dest));
  writeStatus(prefix, `done (${formatBytes(received)})`, true);
  return received;
}

/**
 * Downloads the raw numbering-plan CSVs from the Минцифры open-data portal
 * into destDir. Files already present are skipped unless `force` is set.
 * Returns the list of file names actually downloaded.
 */
export async function downloadRawData(destDir: string, options: DownloadOptions = {}): Promise<string[]> {
  const { force = false, timeoutMs = 60_000 } = options;
  await mkdir(destDir, { recursive: true });

  console.log(`Downloading raw registry CSVs to ${destDir}:`);

  const downloaded: string[] = [];
  const totalFiles = RAW_DATA_FILES.length;
  for (let i = 0; i < totalFiles; i++) {
    const file = RAW_DATA_FILES[i];
    const step = `[${i + 1}/${totalFiles}]`;
    const prefix = `  ${step} ${file}: `;
    const dest = path.join(destDir, file);
    if (!force && existsSync(dest)) {
      console.log(`${prefix}already present, skipping`);
      continue;
    }

    writeStatus(prefix, 'starting...');
    await downloadFile(BASE_URL + file, dest, prefix, timeoutMs);
    downloaded.push(file);
  }

  if (downloaded.length === 0) {
    console.log('  all files already present');
  }

  return downloaded;
}
