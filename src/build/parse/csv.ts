import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

/**
 * Reads one of the Минцифры numbering-plan CSVs: `;`-delimited, UTF-8 with
 * BOM, quoted fields (operator names contain embedded commas). Returns the
 * header row and the data rows.
 */
export function readRegistryCsv(filePath: string): { header: string[]; rows: string[][] } {
  const content = readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    bom: true,
    delimiter: ';',
    quote: '"',
    relax_quotes: true,
    skip_empty_lines: true,
  }) as string[][];

  const [header, ...rows] = records;
  return { header, rows };
}
