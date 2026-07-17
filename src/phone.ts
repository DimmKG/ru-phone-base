/**
 * Normalizes a Russian phone number to its 11-digit national form
 * ("7XXXXXXXXXX"), accepting:
 *  - international form: "+7XXXXXXXXXX" (any non-digit separators allowed)
 *  - national form with trunk prefix "8" or bare "7": "8XXXXXXXXXX" / "7XXXXXXXXXX"
 *  - bare 10-digit subscriber number: "XXXXXXXXXX"
 * Returns null for anything that doesn't resolve to exactly 10 subscriber digits.
 */
export function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  let national: string | undefined;
  if (hasPlus) {
    if (digits.length === 11 && digits.startsWith('7')) national = digits.slice(1);
  } else if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  }

  if (!national || national.length !== 10) return null;
  return `7${national}`;
}
