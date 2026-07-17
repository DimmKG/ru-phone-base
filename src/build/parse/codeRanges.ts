/**
 * Expands an `АВС/ DEF` registry cell into its individual 3-digit codes.
 *
 * Cells hold a comma-separated list of codes and/or dash-ranges, e.g.
 * `"920-939, 999"` or `"900, 902-906, 908, 909, 950, 951, 953, 960-969"`.
 * Every code produced applies identically to the row it came from.
 */
export function expandCodeRanges(cell: string): string[] {
  const codes: string[] = [];
  for (const rawToken of cell.split(',')) {
    const token = rawToken.trim();
    if (!token) continue;

    const dashIndex = token.indexOf('-');
    if (dashIndex === -1) {
      codes.push(assertThreeDigits(token));
      continue;
    }

    const start = assertThreeDigits(token.slice(0, dashIndex).trim());
    const end = assertThreeDigits(token.slice(dashIndex + 1).trim());
    const startNum = Number(start);
    const endNum = Number(end);
    for (let n = startNum; n <= endNum; n++) {
      codes.push(String(n).padStart(3, '0'));
    }
  }
  return codes;
}

function assertThreeDigits(value: string): string {
  if (!/^\d{3}$/.test(value)) {
    throw new Error(`Expected a 3-digit ABC/DEF code, got: "${value}"`);
  }
  return value;
}
