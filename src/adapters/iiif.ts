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
    const serviceId = serviceRecord
      ? firstString(serviceRecord.id ?? serviceRecord['@id'])
      : undefined;
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

const readEntries = (value: unknown): IiifRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toRecord(entry))
    .filter((entry): entry is IiifRecord => entry !== null);
};

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Image service ids for each page, from a Presentation 2 (`sequences`) or 3 (`items`) manifest. */
const canvasServices = (manifest: IiifRecord): string[] => {
  const v2 = readEntries(readEntries(manifest.sequences)[0]?.canvases).map((canvas) =>
    toRecord(readEntries(canvas.images)[0]?.resource),
  );
  const v3 = readEntries(manifest.items).map((canvas) =>
    toRecord(readEntries(readEntries(canvas.items)[0]?.items)[0]?.body),
  );
  return [...v2, ...v3]
    .map((resource) => {
      const service = Array.isArray(resource?.service) ? resource?.service[0] : resource?.service;
      const record = toRecord(service);
      return record ? firstString(record['@id'] ?? record.id) : undefined;
    })
    .filter((id): id is string => !!id)
    .map((id) => id.replace(/\/$/, ''));
};

const MAX_PAGES = 48;

const manifestToCard = (manifest: IiifRecord, source: ItemCard['source']): ItemCard | null => {
  const id = firstString(manifest.id ?? manifest['@id']);
  if (!id) {
    return null;
  }
  const title = readLabel(manifest.label) ?? 'Untitled manifest';
  const summary = readLabel(manifest.summary ?? manifest.description);
  const thumbnail = readThumbnail(manifest.thumbnail ?? manifest.thumbnails);
  const thumbRecord = toRecord(
    Array.isArray(manifest.thumbnail) ? manifest.thumbnail[0] : manifest.thumbnail,
  );
  const width = Number(thumbRecord?.width);
  const height = Number(thumbRecord?.height);

  // The catalogue details a manifest carries, in whatever language the library wrote them.
  const fields = readEntries(manifest.metadata)
    .map((entry) => ({
      label: stripTags(readLabel(entry.label) ?? ''),
      value: stripTags(readLabel(entry.value) ?? ''),
    }))
    .filter((field) => field.label && field.value && field.value !== title);
  const pages = canvasServices(manifest);
  if (pages.length > 0) fields.push({ label: 'Pages', value: String(pages.length) });
  const attribution = readLabel(manifest.attribution ?? manifest.requiredStatement);
  if (attribution) fields.push({ label: 'Attribution', value: stripTags(attribution) });

  return {
    id,
    title,
    sub: summary ?? undefined,
    img: thumbnail ?? (pages[0] ? `${pages[0]}/full/!400,400/0/default.jpg` : undefined),
    imgLarge: pages[0] ? `${pages[0]}/full/!1400,1400/0/default.jpg` : undefined,
    images:
      pages.length > 1
        ? pages.slice(0, MAX_PAGES).map((page) => `${page}/full/!200,200/0/default.jpg`)
        : undefined,
    aspect: width > 0 && height > 0 ? width / height : undefined,
    fields: fields.length > 0 ? fields : undefined,
    href: id,
    source,
    raw: manifest,
    kind: 'IIIF manifest',
    manifest: id,
  };
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
