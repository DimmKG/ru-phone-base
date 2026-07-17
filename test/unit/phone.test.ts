import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '../../src/phone.js';

describe('normalizePhoneNumber', () => {
  it('accepts +7 international form with separators', () => {
    expect(normalizePhoneNumber('+7 495 123-45-67')).toBe('74951234567');
    expect(normalizePhoneNumber('+7(495)1234567')).toBe('74951234567');
  });

  it('accepts national form with trunk prefix 8', () => {
    expect(normalizePhoneNumber('84951234567')).toBe('74951234567');
  });

  it('accepts bare 11-digit form starting with 7', () => {
    expect(normalizePhoneNumber('74951234567')).toBe('74951234567');
  });

  it('accepts bare 10-digit subscriber number', () => {
    expect(normalizePhoneNumber('4951234567')).toBe('74951234567');
  });

  it('rejects wrong lengths', () => {
    expect(normalizePhoneNumber('123')).toBeNull();
    expect(normalizePhoneNumber('749512345678')).toBeNull();
  });

  it('rejects a +7-prefixed number that is not 11 digits', () => {
    expect(normalizePhoneNumber('+7123')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(normalizePhoneNumber('not a number')).toBeNull();
  });
});
