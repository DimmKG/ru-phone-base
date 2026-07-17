import type { RegionMismatch } from './regionNormalize.js';

export type SourceFile = 'ABC-3xx' | 'ABC-4xx' | 'ABC-8xx' | 'DEF-9xx';

/** Inclusive range over the 7-digit subscriber number space. */
export interface NumberRange {
  from: number;
  to: number;
}

/** One allocation block after CSV parsing and region normalization. */
export interface NormalizedRow {
  /** Expanded 3-digit ABC/DEF codes this row applies to. */
  codes: string[];
  /** Inclusive subscriber-number range this row covers. */
  range: NumberRange;
  /** Resolved federal-subject slugs (see federalSubjects.ts); may be empty if fully unmapped. */
  regions: string[];
  /** Raw region tokens this row couldn't map to a federal subject (see regionAliases.json). */
  unmapped: string[];
  regionMismatch?: RegionMismatch;
  /** Settlement/locality name (city, town, village...), when the row names one specific installation location. */
  settlement?: string;
  operator: string;
  inn: string;
  sourceFile: SourceFile;
}
