import { fetchJSON } from '../lib/http';
import type { ItemCard } from '../lib/types';

type NorthwesternWork = {
  id?: string;
  title?: unknown;
  alternate_title?: unknown;
  collection?: { title?: unknown } | null;
  creator?: unknown;
  contributor?: unknown;
  date_created?: unknown;
  dates?: unknown;
  representative_file_set?: { url?: unknown } | null;
  thumbnail?: unknown;
  thumbnail_url?: unknown;
  canonical_link?: unknown;
  site_url?: unknown;
  api_link?: unknown;
  subject?: unknown;
  genre?: unknown;
  keywords?: unknown;
};

type NorthwesternSearchResponse = {
  data?: NorthwesternWork[];
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const firstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const collectStrings = (value: unknown): string[] => {
  const results: string[] = [];
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = firstString(value);
    if (normalized) {
      results.push(normalized);
    }
    return results;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = firstString(entry);
      if (normalized) {
        results.push(normalized);
      }
    }
    return results;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const normalized = firstString(entry);
      if (normalized) {
        results.push(normalized);
      }
    }
  }
  return results;
};

const toIiifImageUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (/\/full\//.test(value)) {
    return value;
  }
  const trimmed = value.replace(/\/$/, '');
  return `${trimmed}/full/!400,400/0/default.jpg`;
};

const findImage = (work: NorthwesternWork): string | undefined => {
  const representative = toRecord(work.representative_file_set);
  const repUrl = representative ? firstString(representative.url) : undefined;
  const thumbnail = firstString(work.thumbnail_url ?? work.thumbnail);
  return toIiifImageUrl(repUrl ?? thumbnail);
};

const buildSubtitle = (work: NorthwesternWork): string | undefined => {
  const collectionTitle = work.collection ? firstString(work.collection.title) : undefined;
  if (collectionTitle) {
    return collectionTitle;
  }
  const creators = [...collectStrings(work.creator), ...collectStrings(work.contributor)];
  if (creators.length > 0) {
    return creators.join(', ');
  }
  return undefined;
};

const buildTags = (work: NorthwesternWork): string[] => {
  const tags = new Set<string>();
  [...collectStrings(work.subject), ...collectStrings(work.genre), ...collectStrings(work.keywords)].forEach((value) => {
    if (value) {
      tags.add(value);
    }
  });
  return Array.from(tags).slice(0, 6);
};

const buildDate = (work: NorthwesternWork): string | undefined => {
  return firstString(work.date_created ?? work.dates);
};

const buildLink = (work: NorthwesternWork): string | undefined => {
  return firstString(work.canonical_link ?? work.site_url ?? work.api_link);
};

const workToItemCard = (work: NorthwesternWork): ItemCard => {
  const id = firstString(work.id) ?? `northwestern-${crypto.randomUUID()}`;
  const title = firstString(work.title) ?? firstString(work.alternate_title) ?? 'Untitled work';
  const tags = buildTags(work);

  return {
    id,
    title,
    sub: buildSubtitle(work),
    date: buildDate(work),
    tags: tags.length > 0 ? tags : undefined,
    img: findImage(work),
    href: buildLink(work),
    source: 'Northwestern',
    raw: work,
  };
};

const clampSize = (size: number): number => {
  if (!Number.isFinite(size) || size <= 0) {
    return 10;
  }
  return Math.max(1, Math.min(50, Math.floor(size)));
};

export const northwesternSearch = async (
  q: string,
  size: number,
  options?: { signal?: AbortSignal },
): Promise<ItemCard[]> => {
  const query = q.trim();
  if (!query) {
    return [];
  }
  const response = await fetchJSON<NorthwesternSearchResponse>(
    '/northwestern/api/v2/search',
    { q: query, size: clampSize(size) },
    { signal: options?.signal },
  );
  const works = Array.isArray(response.data) ? response.data : [];
  return works.map((work) => workToItemCard(work));
};

export default northwesternSearch;
