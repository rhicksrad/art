import type { ItemField } from '../lib/types';

export type Rec = Record<string, unknown>;

export const asRecord = (value: unknown): Rec | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null;

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

/** A trimmed string from a string/number, or the first such entry of an array. Never digs into objects. */
export const str = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = str(entry);
      if (result) return result;
    }
  }
  return undefined;
};

export const strings = (value: unknown): string[] =>
  asArray(value)
    .map((entry) => str(entry))
    .filter((entry): entry is string => !!entry);

/** Labels from controlled-vocabulary entries shaped like `{ label, id, facet, … }`. */
export const labels = (value: unknown, key = 'label'): string[] =>
  asArray(value)
    .map((entry) => (typeof entry === 'string' ? str(entry) : str(asRecord(entry)?.[key])))
    .filter((entry): entry is string => !!entry);

export const unique = (values: string[]): string[] => Array.from(new Set(values));

export const fieldList = (pairs: Array<[string, string | undefined]>): ItemField[] | undefined => {
  const fields = pairs
    .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].length > 0)
    .map(([label, value]) => ({ label, value }));
  return fields.length > 0 ? fields : undefined;
};

export const orUndefined = <T>(list: T[]): T[] | undefined => (list.length > 0 ? list : undefined);

/** Size a IIIF Image API base URL (v2 or v3) to fit a square box. */
export const iiifImage = (base: string | undefined, box = 480): string | undefined => {
  if (!base) return undefined;
  if (/\/full\//.test(base)) return base;
  const trimmed = base.replace(/\/info\.json$/i, '').replace(/\/+$/, '');
  return `${trimmed}/full/!${box},${box}/0/default.jpg`;
};

export const truncate = (value: string | undefined, max = 600): string | undefined => {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

export const stripHtml = (value: string | undefined): string | undefined =>
  value ? str(value.replace(/<[^>]+>/g, ' ')) : undefined;
