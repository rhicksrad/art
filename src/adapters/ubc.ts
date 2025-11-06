import type { ItemCard } from '../lib/types';
import { getUbcTotal } from '../lib/ubc';

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

const isIiifCandidate = (value: string): boolean => {
  const lowered = value.toLowerCase();
  return (
    lowered.includes('/iiif') ||
    /\/info\.json$/i.test(value) ||
    /\/full\//i.test(value) ||
    lowered.includes('/image/')
  );
};

const sanitiseIiifBase = (value: string): string => {
  return value.replace(/\/info\.json$/i, '').replace(/\/$/, '');
};

const toIiifImage = (base: string, size = '!600,600'): string => {
  const trimmed = sanitiseIiifBase(base);
  if (/\/full\//.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/full/${size}/0/default.jpg`;
};

const resolveIiifBase = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^https?:/i.test(trimmed) && isIiifCandidate(trimmed)) {
      return sanitiseIiifBase(trimmed);
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolveIiifBase(entry);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const candidates: unknown[] = [
    record.service,
    record['@id'],
    record.id,
    record.url,
    record.uri,
    record.thumbnail,
    record.tileSource,
    record.tilesource,
    record.image,
  ];
  for (const candidate of candidates) {
    const result = resolveIiifBase(candidate);
    if (result) {
      return result;
    }
  }
  return undefined;
};

const getSource = (hit: UnknownRecord): UnknownRecord => {
  return asRecord(hit['_source']) ?? hit;
};

export const deriveIiifService = (hit: unknown): string | undefined => {
  const record = asRecord(hit);
  if (!record) {
    return undefined;
  }
  const source = getSource(record);
  const candidates: unknown[] = [
    source.iiif,
    source.iiifService,
    source.iiif_service,
    source.image_service,
    source.imageService,
    source.service,
    source.media,
    source.tileSource,
    source.thumbnail,
  ];
  for (const candidate of candidates) {
    const resolved = resolveIiifBase(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
};

const deriveImage = (hit: UnknownRecord): string | undefined => {
  const source = getSource(hit);
  const direct = extractFirstString(
    source.thumbnail ?? source.thumb ?? source.image ?? source.img ?? source.preview ?? source.cover,
  );
  if (direct) {
    const iiif = resolveIiifBase(direct);
    return iiif ? toIiifImage(iiif) : direct;
  }

  const service = deriveIiifService(source);
  if (service) {
    return toIiifImage(service);
  }

  const fallback = extractFirstString(source.previewUrl ?? source.preview_url ?? source.primary_image);
  return fallback ?? undefined;
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
  const source = getSource(hit);
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
  const dataRecord = asRecord(record.data);
  if (dataRecord) {
    if (Array.isArray(dataRecord.hits)) {
      return dataRecord.hits as UnknownRecord[];
    }
    const nestedHits = asRecord(dataRecord.hits);
    if (nestedHits && Array.isArray(nestedHits.hits)) {
      return nestedHits.hits as UnknownRecord[];
    }
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

export const extractTotal = (resp: unknown): number | undefined => {
  return getUbcTotal(resp);
};

export const deriveIiifManifest = (hit: unknown): string | undefined => {
  const record = asRecord(hit);
  if (!record) {
    return undefined;
  }
  const source = getSource(record);
  const candidate =
    extractFirstString(source.manifest) ??
    extractFirstString(source.manifestUrl ?? source.manifest_url) ??
    extractFirstString(source.iiif_manifest ?? source.iiifManifest) ??
    extractFirstString(source.manifestUri ?? source.manifest_uri) ??
    extractFirstString(record.manifest ?? record.iiif_manifest);
  if (candidate && /^https?:/i.test(candidate)) {
    return candidate;
  }
  return undefined;
};
