import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from '../build/diff/loadSnapshot.js';
import { diffAllocations } from '../build/diff/diffAllocations.js';
import { diffDiscrepancyCounts, diffUnmappedRegions } from '../build/diff/diffReports.js';
import { computeStats, type DiffStats } from '../build/diff/computeStats.js';

function parseArgs(argv: string[]) {
  const args = {
    old: undefined as string | undefined,
    newData: undefined as string | undefined,
    newReports: undefined as string | undefined,
    output: undefined as string | undefined,
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
  console.log(`ru-phone-base-diff - diff a previous compiled dataset snapshot against the current one

Usage: ru-phone-base-diff --old <dir> --new-data <dir> --output <dir> [options]

Options:
  --old <dir>          (required) Directory containing a previous snapshot,
                        laid out as <dir>/data/*.json + <dir>/reports/*.json
                        (e.g. a copy of a previous ru-phone-base-build --output,
                        plus its sibling reports/ directory, taken aside before
                        regenerating). The reports/ subdirectory is optional -
                        see --new-reports.
  --new-data <dir>     (required) Current compiled dataset dir (e.g. the
                        --output of a fresh ru-phone-base-build run)
  --new-reports <dir>  Current reports dir (the sibling "reports/" directory
                        next to that --output). Optional - if omitted (or if
                        <old>/reports is missing), discrepancy/unmapped-region
                        comparison is skipped and stats.json simply omits
                        those fields; the allocation diff is unaffected.
  --output <dir>       (required) Where to write stats.json and the detailed
                        diff JSON files (added/removed/changed allocations,
                        timezone changes).
  -h, --help           Show this help
`);
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function printSummary(stats: DiffStats): void {
  const { fixed, mobile, total } = stats.allocations;
  console.log(`Registry snapshot date: ${stats.snapshotDate}`);
  console.log('Allocations (fixed / mobile / total):');
  console.log(`  added:            ${fixed.added} / ${mobile.added} / ${total.added}`);
  console.log(`  removed:          ${fixed.removed} / ${mobile.removed} / ${total.removed}`);
  console.log(`  changed (data):   ${fixed.changedData} / ${mobile.changedData} / ${total.changedData}`);
  console.log(`  changed (tz):     ${fixed.changedTimezone} / ${mobile.changedTimezone} / ${total.changedTimezone}`);
  console.log(`  unchanged:        ${fixed.unchanged} / ${mobile.unchanged} / ${total.unchanged}`);

  if (stats.discrepancies) {
    const discrepancyEntries = Object.entries(stats.discrepancies);
    if (discrepancyEntries.length > 0) {
      console.log('Discrepancies (before -> after):');
      for (const [kind, c] of discrepancyEntries) {
        console.log(`  ${kind}: ${c.before} -> ${c.after} (${c.delta >= 0 ? '+' : ''}${c.delta})`);
      }
    }
  } else {
    console.log('Discrepancies: not compared (no reports/ available on one or both sides)');
  }

  if (stats.unmappedRegions) {
    console.log(
      `Unmapped region tokens: ${stats.unmappedRegions.before} -> ${stats.unmappedRegions.after} ` +
        `(+${stats.unmappedRegions.newlyUnmapped.length} / -${stats.unmappedRegions.newlyResolved.length})`,
    );
  } else {
    console.log('Unmapped region tokens: not compared (no reports/ available on one or both sides)');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.old || !args.newData || !args.output) {
    console.error('Error: --old, --new-data, and --output are all required.');
    printHelp();
    process.exit(1);
  }

  const oldSnapshot = loadSnapshot(path.join(args.old, 'data'), path.join(args.old, 'reports'));
  const newSnapshot = loadSnapshot(args.newData, args.newReports);

  const allocDiff = diffAllocations(oldSnapshot.allocations, newSnapshot.allocations);
  const discrepancyStats =
    oldSnapshot.discrepancies !== undefined && newSnapshot.discrepancies !== undefined
      ? diffDiscrepancyCounts(oldSnapshot.discrepancies, newSnapshot.discrepancies)
      : undefined;
  const unmappedStats =
    oldSnapshot.unmappedRegions !== undefined && newSnapshot.unmappedRegions !== undefined
      ? diffUnmappedRegions(oldSnapshot.unmappedRegions, newSnapshot.unmappedRegions)
      : undefined;
  const stats = computeStats(oldSnapshot, newSnapshot, allocDiff, discrepancyStats, unmappedStats);

  mkdirSync(args.output, { recursive: true });
  writeJson(path.join(args.output, 'stats.json'), stats);
  writeJson(path.join(args.output, 'allocations-added.json'), allocDiff.added);
  writeJson(path.join(args.output, 'allocations-removed.json'), allocDiff.removed);
  writeJson(path.join(args.output, 'allocations-changed.json'), allocDiff.changed);
  writeJson(path.join(args.output, 'timezone-changes.json'), allocDiff.timezoneChanged);

  console.log(`Diff written to ${args.output}\n`);
  printSummary(stats);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
