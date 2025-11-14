import type { ItemCard } from '../lib/types';

type IiifRecord = Record<string, unknown>;

const toRecord = (value: unknown): IiifRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as IiifRecord;
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
    for (const entry of Object.values(value as IiifRecord)) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const ensureIiifImage = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (/\/full\//.test(value)) {
    return value;
  }
  const trimmed = value.replace(/\/info\.json$/i, '').replace(/\/$/, '');
  return `${trimmed}/full/!400,400/0/default.jpg`;
};

const readThumbnail = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = readThumbnail(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  const direct = firstString(record.id ?? record['@id'] ?? record.url);
  if (direct) {
    return direct;
  }
  if (record.service) {
    const serviceRecord = toRecord(record.service);
    const serviceId = serviceRecord ? firstString(serviceRecord.id ?? serviceRecord['@id']) : undefined;
    return ensureIiifImage(serviceId);
  }
  return undefined;
};

const readLabel = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const label = readLabel(entry);
      if (label) {
        return label;
      }
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  if (typeof record.none === 'string') {
    return record.none;
  }
  if (Array.isArray(record.none) && record.none.length > 0 && typeof record.none[0] === 'string') {
    return record.none[0] as string;
  }
  if (Array.isArray(record.en) && record.en.length > 0 && typeof record.en[0] === 'string') {
    return record.en[0] as string;
  }
  if (typeof record.en === 'string') {
    return record.en;
  }
  if (typeof record['@value'] === 'string') {
    return record['@value'] as string;
  }
  for (const entry of Object.values(record)) {
    const label = readLabel(entry);
    if (label) {
      return label;
    }
  }
  return undefined;
};

const isManifest = (record: IiifRecord): boolean => {
  const type = firstString(record.type ?? record['@type']);
  return typeof type === 'string' && type.toLowerCase().includes('manifest');
};

const manifestToCard = (manifest: IiifRecord, source: ItemCard['source']): ItemCard | null => {
  const id = firstString(manifest.id ?? manifest['@id']);
  if (!id) {
    return null;
  }
  const title = readLabel(manifest.label) ?? 'Untitled manifest';
  const summary = readLabel(manifest.summary ?? manifest.description);
  const thumbnail = readThumbnail(manifest.thumbnail ?? manifest.thumbnails);

  return {
    id,
    title,
    sub: summary ?? undefined,
    img: thumbnail,
    href: id,
    source,
    raw: manifest,
  };
};

const readEntries = (value: unknown): IiifRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toRecord(entry)).filter((entry): entry is IiifRecord => entry !== null);
};

const extractManifests = (collection: IiifRecord): IiifRecord[] => {
  const entries: IiifRecord[] = [];
  readEntries(collection.manifests).forEach((entry) => entries.push(entry));
  readEntries(collection.items).forEach((entry) => {
    if (isManifest(entry)) {
      entries.push(entry);
    }
  });
  return entries;
};

export const iiifResourceToCards = (resource: unknown, source: ItemCard['source']): ItemCard[] => {
  const record = toRecord(resource);
  if (!record) {
    return [];
  }
  if (isManifest(record)) {
    const card = manifestToCard(record, source);
    return card ? [card] : [];
  }
  const manifests = extractManifests(record);
  return manifests
    .map((manifest) => manifestToCard(manifest, source))
    .filter((card): card is ItemCard => card !== null);
};
