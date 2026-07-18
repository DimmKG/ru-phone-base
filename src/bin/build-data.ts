import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDataset } from '../build/buildDataset.js';
import { DEFAULT_OSM_CACHE_DIR } from '../build/osm/overpassClient.js';

const DEFAULT_INPUT = path.join(tmpdir(), 'ru-phone-base-raw');

function parseArgs(argv: string[]) {
  const args = {
    input: DEFAULT_INPUT,
    output: undefined as string | undefined,
    osmCache: DEFAULT_OSM_CACHE_DIR,
    download: true,
    forceDownload: false,
    refreshTimezones: false,
    quirks: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--osm-cache':
        args.osmCache = argv[++i];
        break;
      case '--download':
        args.forceDownload = true;
        break;
      case '--no-download':
        args.download = false;
        break;
      case '--refresh-timezones':
        args.refreshTimezones = true;
        break;
      case '--quirks':
        args.quirks = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`ru-phone-base-build - regenerate the machine-readable dataset from the Минцифры numbering-plan CSVs

Usage: ru-phone-base-build --output <dir> [options]

Options:
  --output <dir>          (required) Directory to write the compiled JSON dataset into.
                          A sibling "reports/" directory (discrepancies.json, unmapped-regions.json)
                          is written next to it for inspection - it is not part of the dataset itself.
  --input <dir>           Directory with the raw CSVs (default: ${DEFAULT_INPUT}). Missing files are
                          downloaded automatically from opendata.digital.gov.ru unless --no-download.
  --osm-cache <dir>       OSM Overpass response cache directory (default: ${DEFAULT_OSM_CACHE_DIR})
  --download              Force re-download of the raw CSVs even if already present in --input
  --no-download           Fail instead of downloading if a required raw CSV is missing
  --refresh-timezones     Bypass the OSM Overpass on-disk cache and re-fetch timezone data
  --quirks <file>         .json/.js/.ts file exporting extra quirks (organization renames, allocation
                          field overrides, ...) - applied after the built-in ones in src/build/compile/quirks.ts.
                          See that file and loadQuirks.ts for the expected shape.
  -h, --help              Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) {
    console.error('Error: --output <dir> is required.');
    printHelp();
    process.exit(1);
  }

  const inputDir = path.resolve(args.input);
  const outputDir = path.resolve(args.output);
  const osmCacheDir = path.resolve(args.osmCache);

  console.log(`Building dataset from ${inputDir} -> ${outputDir}`);
  const report = await buildDataset(inputDir, outputDir, {
    download: args.download,
    forceDownload: args.forceDownload,
    osmCacheDir,
    refreshTimezones: args.refreshTimezones,
    userQuirksFile: args.quirks,
  });

  console.log(
    `Done. ${report.unmappedRegions.length} unmapped region token(s), ${report.discrepancies.length} discrepanc(y/ies), ${report.quirks.length} quirk(s) applied.`,
  );
  if (report.unmappedRegions.length > 0) {
    console.warn('Unmapped region tokens (see reports/unmapped-regions.json):', report.unmappedRegions);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
