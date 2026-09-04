import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from '../src/build/diff/loadSnapshot.js';
import { diffAllocations } from '../src/build/diff/diffAllocations.js';
import {
  summarizeChangeCategories,
  computeOperatorCapacityMovers,
  diffDiscrepancyEntries,
  renderDeepAnalysisText,
} from './deepDiffAnalysis.js';

function parseArgs(argv: string[]) {
  const args = {
    old: undefined as string | undefined,
    newData: undefined as string | undefined,
    newReports: undefined as string | undefined,
    output: undefined as string | undefined,
    top: 15,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--old':
        args.old = argv[++i];
        break;
      case '--new-data':
        args.newData = path.resolve(argv[++i]);
        break;
      case '--new-reports':
        args.newReports = path.resolve(argv[++i]);
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--top':
        args.top = Number(argv[++i]);
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
  console.log(`diff-deep-analysis - a deeper look at a ru-phone-base dataset diff than "npm run diff:data" gives:
splits changed allocations into real reassignments vs. registry housekeeping (name re-casing, settlement
rewording), and ranks operators by net capacity change computed directly from the two full allocation lists
(immune to diffAllocations' known block-merge-boundary artifact - see src/build/diff/diffAllocations.ts).

Usage: tsx tools/diff-deep-analysis.ts --old <dir> --new-data <dir> [options]

Options:
  --old <dir>          (required) Directory containing a previous snapshot,
                        laid out as <dir>/data/*.json + <dir>/reports/*.json
                        (same layout src/bin/diff-dataset.ts expects).
  --new-data <dir>     (required) Current compiled dataset dir (e.g. src/data).
  --new-reports <dir>  Current reports dir (e.g. src/reports). Optional - omit
                        to skip the discrepancy-entry diff.
  --output <dir>       Also write deep-analysis.json with the full detail here.
  --top <n>            How many operators to show in the capacity-movers table
                        (default: 15).
  -h, --help           Show this help
`);
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.old || !args.newData) {
    console.error('Error: --old and --new-data are required.');
    printHelp();
    process.exit(1);
  }

  const oldSnapshot = loadSnapshot(path.join(args.old, 'data'), path.join(args.old, 'reports'));
  const newSnapshot = loadSnapshot(args.newData, args.newReports);

  const allocDiff = diffAllocations(oldSnapshot.allocations, newSnapshot.allocations);
  const changeSummary = summarizeChangeCategories(allocDiff.changed);
  const movers = computeOperatorCapacityMovers(oldSnapshot.allocations, newSnapshot.allocations);
  const discrepancyDiff =
    oldSnapshot.discrepancies !== undefined && newSnapshot.discrepancies !== undefined
      ? diffDiscrepancyEntries(oldSnapshot.discrepancies, newSnapshot.discrepancies)
      : undefined;

  console.log(renderDeepAnalysisText({ allocDiff, changeSummary, movers, discrepancyDiff }, { topMovers: args.top }));

  if (args.output) {
    mkdirSync(args.output, { recursive: true });
    writeJson(path.join(args.output, 'deep-analysis.json'), {
      changeCategoryCounts: changeSummary.counts,
      changesByCategory: changeSummary.byCategory,
      operatorCapacityMovers: movers,
      discrepancyDiff,
    });
    console.log(`Full detail written to ${path.join(args.output, 'deep-analysis.json')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
