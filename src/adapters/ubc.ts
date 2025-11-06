import type { ItemCard } from '../lib/types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const extractFirstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = extractFirstString(entry);
      if (result) {
        return result;
      }
    }
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value as UnknownRecord)) {
      const result = extractFirstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const collectStrings = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    const results = value
      .map((entry) => extractFirstString(entry))
      .filter((entry): entry is string => !!entry);
    return results;
  }
  return [];
};

const deriveImage = (hit: UnknownRecord): string | undefined => {
  const direct = extractFirstString(hit.thumbnail ?? hit.thumb ?? hit.image ?? hit.img);
  if (direct) {
    return direct;
  }

  const iiif = asRecord(hit.iiif ?? hit.image_service ?? hit.media);
  if (iiif) {
    const candidate =
      extractFirstString(iiif.id) ??
      extractFirstString(iiif['@id']) ??
      extractFirstString(iiif.service) ??
      extractFirstString(iiif.manifest) ??
      extractFirstString(iiif.tileSource);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const deriveIdentifier = (hit: UnknownRecord): string => {
  const candidates = [hit.id, hit.identifier, hit.url, hit.href, hit.source, hit.handle];
  for (const candidate of candidates) {
    const value = extractFirstString(candidate);
    if (value) {
      return value;
    }
  }
  return `ubc-item-${Math.random().toString(36).slice(2)}`;
};

const toCard = (hit: UnknownRecord): ItemCard => {
  const source = asRecord(hit['_source']) ?? hit;
  const identifier = deriveIdentifier(source);
  const title =
    extractFirstString(source.title) ??
    extractFirstString(source.label) ??
    extractFirstString(source.name) ??
    identifier;
  const sub =
    extractFirstString(source.creator) ??
    extractFirstString(source.contributor) ??
    extractFirstString(source.collection);
  const date =
    extractFirstString(source.date) ??
    extractFirstString(source.issued) ??
    extractFirstString(source.displayDate) ??
    extractFirstString(source.created);
  const href =
    extractFirstString(source.url) ??
    extractFirstString(source.href) ??
    extractFirstString(source.source) ??
    extractFirstString(source.identifier);

  const tags = [
    ...collectStrings(source.collection),
    ...collectStrings(source.type ?? source.format),
  ];
  const uniqueTags = Array.from(new Set(tags.filter((value) => value.length > 0)));

  return {
    id: identifier,
    title,
    sub,
    date,
    tags: uniqueTags.length > 0 ? uniqueTags : undefined,
    img: deriveImage(source),
    href,
    source: 'UBC',
    raw: hit,
  };
};

const extractHits = (resp: unknown): UnknownRecord[] => {
  if (!resp) {
    return [];
  }
  if (Array.isArray(resp)) {
    return resp as UnknownRecord[];
  }
  const record = asRecord(resp);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.data)) {
    return record.data as UnknownRecord[];
  }
  if (Array.isArray(record.results)) {
    return record.results as UnknownRecord[];
  }
  if (Array.isArray(record.items)) {
    return record.items as UnknownRecord[];
  }
  const hits = asRecord(record.hits);
  if (hits && Array.isArray(hits.hits)) {
    return hits.hits as UnknownRecord[];
  }
  return [];
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const hits = extractHits(resp);
  return hits.map((hit) => toCard(hit));
};
