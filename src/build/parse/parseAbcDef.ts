import { readRegistryCsv } from './csv.js';
import { resolveRowRegion, extractSettlement } from './regionNormalize.js';
import type { NormalizedRow, SourceFile } from './types.js';

export interface CapacityMismatch {
  kind: 'capacity-mismatch';
  sourceFile: SourceFile;
  code: string;
  from: number;
  to: number;
  expectedCapacity: number;
  actualCapacity: number;
}

export interface ParseAbcDefResult {
  rows: NormalizedRow[];
  capacityMismatches: CapacityMismatch[];
}

/**
 * Parses one of the ABC-3xx/ABC-4xx/ABC-8xx/DEF-9xx registry files - the
 * full "Реестр российской системы и плана нумерации". Columns: `АВС/ DEF;
 * От; До; Емкость; Оператор; Регион; Территория ГАР; ИНН`. Unlike the
 * older ni-* exports, `От`/`До` are an explicit inclusive numeric range (no
 * decade math), and `Территория ГАР` is the reliable, never-empty location
 * field - `Регион` is sometimes a bare district/settlement name with no
 * federal-subject suffix, so `Территория ГАР` is fed as the primary
 * (`zone`) source to `resolveRowRegion` and `Регион` as the fallback
 * (`place`) source - the reverse of the old ni-11-f/ni-11-p roles, but the
 * same underlying precedence logic (prefer the primary source; fall back
 * when it's empty/unmapped).
 */
export function parseAbcDef(filePath: string, sourceFile: SourceFile): ParseAbcDefResult {
  const { header, rows } = readRegistryCsv(filePath);
  const codeIdx = header.indexOf('АВС/ DEF');
  const fromIdx = header.indexOf('От');
  const toIdx = header.indexOf('До');
  const capacityIdx = header.indexOf('Емкость');
  const operatorIdx = header.indexOf('Оператор');
  const regionIdx = header.indexOf('Регион');
  const garIdx = header.indexOf('Территория ГАР');
  const innIdx = header.indexOf('ИНН');

  const result: NormalizedRow[] = [];
  const capacityMismatches: CapacityMismatch[] = [];

  for (const row of rows) {
    const code = row[codeIdx];
    const from = Number(row[fromIdx]);
    const to = Number(row[toIdx]);
    const capacity = Number(row[capacityIdx]);

    if (to - from + 1 !== capacity) {
      capacityMismatches.push({
        kind: 'capacity-mismatch',
        sourceFile,
        code,
        from,
        to,
        expectedCapacity: to - from + 1,
        actualCapacity: capacity,
      });
    }

    const {
      slugs: regions,
      unmapped,
      mismatch,
    } = resolveRowRegion({
      zone: row[garIdx],
      place: row[regionIdx],
    });
    const settlement = extractSettlement({ place: row[garIdx] });

    result.push({
      codes: [code],
      range: { from, to },
      regions,
      unmapped,
      regionMismatch: mismatch,
      settlement,
      operator: row[operatorIdx],
      inn: row[innIdx],
      sourceFile,
    });
  }

  return { rows: result, capacityMismatches };
}
