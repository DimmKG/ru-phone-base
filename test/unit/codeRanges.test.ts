import { describe, it, expect } from 'vitest';
import { expandCodeRanges } from '../../src/build/parse/codeRanges.js';

describe('expandCodeRanges', () => {
  it('expands a single code', () => {
    expect(expandCodeRanges('495')).toEqual(['495']);
  });

  it('expands a dash range inclusive', () => {
    expect(expandCodeRanges('920-923')).toEqual(['920', '921', '922', '923']);
  });

  it('expands a mixed comma list with and without spaces', () => {
    expect(expandCodeRanges('920-923, 999')).toEqual(['920', '921', '922', '923', '999']);
    expect(expandCodeRanges('900,902-904,908')).toEqual(['900', '902', '903', '904', '908']);
  });

  it('trims whitespace around tokens', () => {
    expect(expandCodeRanges(' 495 , 499 ')).toEqual(['495', '499']);
  });

  it('rejects non-3-digit tokens', () => {
    expect(() => expandCodeRanges('49')).toThrow();
    expect(() => expandCodeRanges('4955')).toThrow();
  });
});
