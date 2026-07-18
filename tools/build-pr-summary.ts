import { readFileSync, writeFileSync } from 'node:fs';
import type { DiffStats } from '../src/build/diff/computeStats.js';
import { renderSummaryMarkdown } from './renderSummary.js';

function parseArgs(argv: string[]) {
  const args = {
    stats: undefined as string | undefined,
    output: undefined as string | undefined,
    runUrl: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--stats':
        args.stats = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--run-url':
        args.runUrl = argv[++i];
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
  console.log(`build-pr-summary - renders a GitHub pull-request body from a diff-dataset stats.json

Not part of the published package - CI-only glue for the "update dataset" workflow.

Usage: tsx tools/build-pr-summary.ts --stats <stats.json> [options]

Options:
  --stats <file>   (required) Path to the stats.json written by src/bin/diff-dataset.ts
  --output <file>  Write the rendered Markdown here instead of stdout
  --run-url <url>  Link to the workflow run that produced the diff artifacts,
                    appended as a footer note
  -h, --help       Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.stats) {
    console.error('Error: --stats <file> is required.');
    printHelp();
    process.exit(1);
  }

  const stats = JSON.parse(readFileSync(args.stats, 'utf-8')) as DiffStats;
  let body = renderSummaryMarkdown(stats);
  if (args.runUrl) {
    body += `\n---\nПолные данные диффа (добавленные/удалённые/изменённые аллокации, изменения часовых поясов) приложены к [запуску workflow](${args.runUrl}) в виде артефактов.\n`;
  }

  if (args.output) {
    writeFileSync(args.output, body);
  } else {
    process.stdout.write(body);
  }
}

main();
