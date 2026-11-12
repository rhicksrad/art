import { describe, expect, it } from 'vitest';
import { binYears, centuryToYear, parseYear } from './dates';

describe('parseYear', () => {
  it.each([
    ['1979', 1979],
    ['ca. 1880–90', 1880],
    ['2021-03-14T18:22:01Z', 2021],
    ['1930 to 1972', 1930],
    ['19th century', 1850],
    ['5th century BCE', -450],
    ['300 B.C.', -300],
    ['n.d.', undefined],
    ['', undefined],
  ])('%s → %s', (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });

  it('accepts numbers but rejects the 0 placeholder', () => {
    expect(parseYear(1582)).toBe(1582);
    expect(parseYear(0)).toBeUndefined();
    expect(centuryToYear('Late Edo, mid 19th century')).toBe(1850);
  });
});

describe('binYears', () => {
  it('uses clean steps and keeps every year', () => {
    const bins = binYears([1582, 1881, 1885, 1979, 2021], 18);
    expect(bins.length).toBeLessThanOrEqual(18);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
    expect(bins[0].start % 25).toBe(0);
    expect(binYears([])).toEqual([]);
  });
});
