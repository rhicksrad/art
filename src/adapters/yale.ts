import type { ItemCard } from '../lib/types';

type UnknownRecord = Record<string, unknown>;

export type YaleCanvas = {
  id: string;
  label?: string;
  image?: string;
  thumbnail?: string;
  raw: unknown;
};

export type YaleManifest = {
  id?: string;
  label?: string;
  canvases: YaleCanvas[];
  raw: unknown;
};

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const fromInternationalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const candidates = ['en', 'none'];
  for (const key of candidates) {
    const entry = record[key];
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim();
        }
      }
    }
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim();
    }
  }
  const values = Object.values(record);
  for (const entry of values) {
    if (typeof entry === 'string' && entry.trim()) {
      return entry.trim();
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim();
        }
      }
    }
  }
  return undefined;
};

const readImageFromAnnotations = (canvas: UnknownRecord): string | undefined => {
  const images = Array.isArray(canvas.images) ? (canvas.images as unknown[]) : [];
  for (const image of images) {
    const body = asRecord(image);
    if (!body) {
      continue;
    }
    const resource = asRecord(body.resource ?? body.body);
    if (resource) {
      const id = (resource['@id'] ?? resource.id) as string | undefined;
      if (typeof id === 'string' && id.trim()) {
        return id.trim();
      }
      const service = asRecord(resource.service);
      if (service) {
        const serviceId = (service['@id'] ?? service.id) as string | undefined;
        if (typeof serviceId === 'string' && serviceId.trim()) {
          return `${serviceId.replace(/\/?$/, '')}/full/!400,400/0/default.jpg`;
        }
      }
    }
  }
  return undefined;
};

const readThumbnail = (record: UnknownRecord): string | undefined => {
  const thumbnail = record.thumbnail;
  if (typeof thumbnail === 'string') {
    return thumbnail;
  }
  if (Array.isArray(thumbnail) && thumbnail.length > 0) {
    const first = thumbnail[0];
    if (typeof first === 'string') {
      return first;
    }
    const thumbRecord = asRecord(first);
    if (thumbRecord) {
      const id = (thumbRecord['@id'] ?? thumbRecord.id ?? thumbRecord.url) as string | undefined;
      if (typeof id === 'string' && id.trim()) {
        return id.trim();
      }
    }
  }
  if (thumbnail && typeof thumbnail === 'object') {
    const id = (thumbnail as UnknownRecord)['@id'] ?? (thumbnail as UnknownRecord).id;
    if (typeof id === 'string' && id.trim()) {
      return id.trim();
    }
  }
  return undefined;
};

const parseCanvas = (value: unknown): YaleCanvas | null => {
  const canvas = asRecord(value);
  if (!canvas) {
    return null;
  }
  const id =
    (typeof canvas['@id'] === 'string' && canvas['@id']) ||
    (typeof canvas.id === 'string' && canvas.id) ||
    undefined;
  if (!id) {
    return null;
  }
  const label = fromInternationalString(canvas.label);
  const image = readImageFromAnnotations(canvas) ?? readThumbnail(canvas);
  const thumbnail = readThumbnail(canvas);

  return {
    id,
    label,
    image,
    thumbnail,
    raw: canvas,
  };
};

const fromSequence = (sequence: UnknownRecord): YaleCanvas[] => {
  const canvases = Array.isArray(sequence.canvases) ? sequence.canvases : [];
  const maybeCanvases = canvases.map((canvas) => parseCanvas(canvas));
  return maybeCanvases.filter((canvas): canvas is YaleCanvas => canvas !== null);
};

const fromManifestItems = (items: unknown[]): YaleCanvas[] => {
  return items
    .map((item) => {
      const canvas = asRecord(item);
      if (!canvas) {
        return null;
      }
      const id =
        (typeof canvas['@id'] === 'string' && canvas['@id']) ||
        (typeof canvas.id === 'string' && canvas.id) ||
        undefined;
      if (!id) {
        return null;
      }
      const label = fromInternationalString(canvas.label);
      const annotations = Array.isArray(canvas.items) ? canvas.items : [];
      let image: string | undefined;
      for (const annotation of annotations) {
        const annotationRecord = asRecord(annotation);
        if (!annotationRecord) {
          continue;
        }
        const body = asRecord(annotationRecord.body);
        if (body) {
          const bodyId = (body['@id'] ?? body.id ?? body.service) as string | undefined;
          if (typeof bodyId === 'string' && bodyId.trim()) {
            image = bodyId.trim();
            break;
          }
        }
      }
      const thumbnail = readThumbnail(canvas);
      const result: YaleCanvas = {
        id,
        label,
        image: image ?? thumbnail,
        thumbnail,
        raw: canvas,
      };
      return result;
    })
    .filter((canvas): canvas is YaleCanvas => !!canvas);
};

export const parseManifest = (manifest: unknown): YaleManifest => {
  const record = asRecord(manifest) ?? {};
  const label = fromInternationalString(record.label);
  const id =
    (typeof record['@id'] === 'string' && record['@id']) ||
    (typeof record.id === 'string' && record.id) ||
    undefined;

  let canvases: YaleCanvas[] = [];

  const sequences = Array.isArray(record.sequences) ? record.sequences : [];
  if (sequences.length > 0) {
    const firstSequence = asRecord(sequences[0]);
    if (firstSequence) {
      canvases = fromSequence(firstSequence);
    }
  }

  if (canvases.length === 0 && Array.isArray(record.items)) {
    canvases = fromManifestItems(record.items);
  }

  return {
    id,
    label,
    canvases,
    raw: manifest,
  };
};

export const toItemCards = (manifest: unknown): ItemCard[] => {
  const parsed = parseManifest(manifest);
  return parsed.canvases.map((canvas, index) => ({
    id: canvas.id || `yale-canvas-${index}`,
    title: canvas.label ?? `Canvas ${index + 1}`,
    img: canvas.image ?? canvas.thumbnail,
    href: canvas.image ?? canvas.thumbnail,
    source: 'Yale',
    raw: canvas.raw,
  }));
};
