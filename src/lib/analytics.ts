export type ChartDatum = {
  label: string;
  value: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 10;
const MIN_YEAR = 1000;

const YEAR_REGEX = /(\d{4})/g;

const normalizeNumber = (value: number): number | undefined => {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_YEAR || rounded > MAX_YEAR) {
    return undefined;
  }
  return rounded;
};

export const extractYear = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return normalizeNumber(value);
  }

  if (typeof value === 'string') {
    const matches = value.match(YEAR_REGEX);
    if (!matches) {
      return undefined;
    }
    for (const match of matches) {
      const parsed = Number.parseInt(match, 10);
      const year = normalizeNumber(parsed);
      if (typeof year === 'number') {
        return year;
      }
    }
    return undefined;
  }

  return undefined;
};

const toDecade = (year: number): number => {
  return Math.floor(year / 10) * 10;
};

const limitSeries = <T>(entries: Array<[T, number]>, limit?: number): Array<[T, number]> => {
  if (typeof limit !== 'number' || limit <= 0 || entries.length <= limit) {
    return entries;
  }
  return entries.slice(entries.length - limit);
};

export const countDecades = (years: number[], limit = 18): ChartDatum[] => {
  const counts = new Map<number, number>();
  for (const year of years) {
    const decade = toDecade(year);
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  const limited = limitSeries(sorted, limit);
  return limited.map(([decade, value]) => ({ label: `${decade}s`, value }));
};

export const countYears = (years: number[], limit = 18): ChartDatum[] => {
  const counts = new Map<number, number>();
  for (const year of years) {
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  const limited = limitSeries(sorted, limit);
  return limited.map(([year, value]) => ({ label: String(year), value }));
};

export const countStrings = (values: string[], limit = 12): ChartDatum[] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value || value.trim().length === 0) {
      continue;
    }
    const normalized = value.trim();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0].localeCompare(b[0]);
    }
    return b[1] - a[1];
  });
  const limited = typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
  return limited.map(([label, value]) => ({ label, value }));
};

export const parseNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseNumericValue(entry);
      if (typeof parsed === 'number') {
        return parsed;
      }
    }
  }
  return undefined;
};

export const findNumericByKey = (source: unknown, keywords: string[]): number | undefined => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  const stack: unknown[] = [source];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current as object)) {
      continue;
    }
    visited.add(current as object);

    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const lowerKey = key.toLowerCase();
      if (lowered.some((keyword) => lowerKey.includes(keyword))) {
        const parsed = parseNumericValue(value);
        if (typeof parsed === 'number') {
          return parsed;
        }
      }
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return undefined;
};
