import type { ItemCard } from '../lib/types';

type HitRecord = Record<string, unknown>;

const asRecord = (value: unknown): HitRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as HitRecord;
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
  }
  return undefined;
};

const buildIiifImage = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  if (url.includes('/full/')) {
    return url;
  }
  return `${url.replace(/\/?$/, '')}/full/!400,400/0/default.jpg`;
};

const parseHit = (hit: HitRecord): ItemCard => {
  const source = asRecord(hit['_source']) ?? hit;
  const objectId = firstString(source.objectid ?? hit._id) ?? `princeton-${Math.random().toString(36).slice(2)}`;
  const title = firstString(source.displaytitle ?? source.title) ?? 'Untitled';
  const sub = firstString(source.displaymaker ?? source.maker);
  const date = firstString(source.displaydate ?? source.date_text);
  const media = firstString(source.medium);
  const credit = firstString(source.creditline);
  const tags = [media, credit].filter((value): value is string => !!value);

  const images = Array.isArray(source.primaryimage) ? (source.primaryimage as unknown[]) : [];
  const image = images.length > 0 ? firstString(images[0]) : undefined;
  const iiif = buildIiifImage(image ?? firstString(source.image));

  const href = (() => {
    const existing = firstString(source.url ?? source.href);
    if (existing) {
      return existing;
    }
    if (objectId && /^\d+$/.test(objectId)) {
      return `https://artmuseum.princeton.edu/collections/objects/${objectId}`;
    }
    return undefined;
  })();

  return {
    id: objectId,
    title,
    sub,
    date,
    tags: tags.length > 0 ? tags : undefined,
    img: iiif,
    href,
    source: 'Princeton',
    raw: hit,
  };
};

const extractHits = (resp: unknown): HitRecord[] => {
  if (!resp) {
    return [];
  }
  const record = asRecord(resp);
  if (!record) {
    return [];
  }
  const hits = asRecord(record.hits);
  if (!hits) {
    return [];
  }
  if (Array.isArray(hits.hits)) {
    return hits.hits as HitRecord[];
  }
  return [];
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const hits = extractHits(resp);
  return hits.map((hit) => parseHit(hit));
};
