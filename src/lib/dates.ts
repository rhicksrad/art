/**
 * Best-effort year extraction from the free-text dates museums and libraries
 * publish ("ca. 1880–90", "5th century BCE", "1957-11-21", "Late Edo, 19th century").
 * Returns a signed year (BCE negative) or undefined when nothing usable is present.
 */

const BCE_PATTERN = /\b(b\.?c\.?e?\.?)(?![a-z])/i;

const ORDINAL_CENTURY = /(\d{1,2})(?:st|nd|rd|th)[\s-]+(?:century|c\.)/i;

const applyEra = (year: number, text: string): number =>
  BCE_PATTERN.test(text) ? -Math.abs(year) : year;

export const centuryToYear = (text: string | undefined | null): number | undefined => {
  if (!text) return undefined;
  const match = text.match(ORDINAL_CENTURY);
  if (!match) return undefined;
  const century = Number(match[1]);
  if (!Number.isFinite(century) || century <= 0 || century > 21) return undefined;
  const mid = (century - 1) * 100 + 50;
  return applyEra(mid, text);
};

export const parseYear = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 && Math.abs(value) < 10000
      ? Math.trunc(value)
      : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;

  const iso = text.match(/^(\d{4})-\d{2}/);
  if (iso) return Number(iso[1]);

  const four = text.match(/(?<!\d)(\d{4})(?!\d)/);
  if (four) {
    const year = Number(four[1]);
    if (year > 0 && year <= 2100) return applyEra(year, text);
  }

  const century = centuryToYear(text);
  if (century !== undefined) return century;

  const three = text.match(/(?<!\d)(\d{1,3})(?!\d)\s*(?:b\.?c|a\.?d|c\.?e)/i);
  if (three) return applyEra(Number(three[1]), text);

  return undefined;
};

export const formatYear = (year: number): string =>
  year < 0 ? `${Math.abs(year)} BCE` : String(year);

export type TimeBin = { start: number; end: number; label: string; count: number };

const STEPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

/** Bin years into at most `maxBins` equal-width buckets on a clean step size. */
export const binYears = (years: number[], maxBins = 24): TimeBin[] => {
  if (years.length === 0) return [];
  const min = Math.min(...years);
  const max = Math.max(...years);
  const span = Math.max(1, max - min + 1);
  const step = STEPS.find((candidate) => span / candidate <= maxBins) ?? 1000;
  const first = Math.floor(min / step) * step;
  const bins: TimeBin[] = [];
  for (let start = first; start <= max; start += step) {
    const end = start + step - 1;
    bins.push({
      start,
      end,
      label: step === 1 ? formatYear(start) : `${formatYear(start)}${step >= 10 ? 's' : ''}`,
      count: 0,
    });
  }
  for (const year of years) {
    const index = Math.min(bins.length - 1, Math.floor((year - first) / step));
    bins[index].count += 1;
  }
  return bins;
};
