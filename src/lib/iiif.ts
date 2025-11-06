export type IIIFCanvas = {
  id: string;
  label?: string;
  width?: number;
  height?: number;
  image?: string;
  imageService?: string;
  thumbnail?: string;
};

export type ParsedIIIFManifest = {
  id: string;
  label?: string;
  canvases: IIIFCanvas[];
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `canvas-${Math.random().toString(36).slice(2)}`;
};

const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const extractLabel = (value: unknown, visited = new Set<unknown>()): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  if (visited.has(value)) {
    return undefined;
  }

  visited.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      const label = extractLabel(entry, visited);
      if (label) {
        return label;
      }
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;

  const prioritizedKeys = ['@value', 'value', 'label', 'en', 'none'];
  for (const key of prioritizedKeys) {
    if (key in record) {
      const label = extractLabel(record[key], visited);
      if (label) {
        return label;
      }
    }
  }

  for (const entry of Object.values(record)) {
    const label = extractLabel(entry, visited);
    if (label) {
      return label;
    }
  }

  return undefined;
};

const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value as T];
};

const extractId = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  const id = record.id ?? record['@id'];
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }

  return undefined;
};

const extractServiceId = (value: unknown, depth = 0): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const directId = record.id ?? record['@id'];

  if (typeof directId === 'string' && directId.length > 0) {
    return directId;
  }

  if (depth > 3) {
    return undefined;
  }

  const nextKeys: Array<keyof typeof record> = ['service', 'services', 'items'];
  for (const key of nextKeys) {
    if (key in record) {
      const candidate = extractServiceId(record[key], depth + 1);
      if (candidate) {
        return candidate;
      }
    }
  }

  for (const entry of Object.values(record)) {
    const candidate = extractServiceId(entry, depth + 1);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const normaliseServiceUrl = (serviceUrl: string): string => {
  return serviceUrl.replace(/\/?info\.json$/i, '');
};

const extractThumbnail = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.id === 'string') {
    return record.id;
  }

  if (typeof record['@id'] === 'string') {
    return record['@id'];
  }

  if (Array.isArray(record.items)) {
    for (const item of record.items as unknown[]) {
      const id = extractThumbnail(item);
      if (id) {
        return id;
      }
    }
  }

  if (Array.isArray(record.service)) {
    const serviceId = extractServiceId(record.service);
    if (serviceId) {
      return `${normaliseServiceUrl(serviceId)}/full/!200,200/0/default.jpg`;
    }
  }

  if (record.service) {
    const serviceId = extractServiceId(record.service);
    if (serviceId) {
      return `${normaliseServiceUrl(serviceId)}/full/!200,200/0/default.jpg`;
    }
  }

  return undefined;
};

const parseCanvasFromV3 = (canvas: Record<string, unknown>): IIIFCanvas => {
  const canvasId = extractId(canvas) ?? createId();
  const label = extractLabel(canvas.label);
  const width = isNumber(canvas.width) ? canvas.width : undefined;
  const height = isNumber(canvas.height) ? canvas.height : undefined;

  const annotationPages = toArray<Record<string, unknown>>(canvas.items ?? canvas.annotations);
  let image: string | undefined;
  let imageService: string | undefined;

  for (const page of annotationPages) {
    const annotations = toArray<Record<string, unknown>>(page.items ?? page.annotations);

    for (const annotation of annotations) {
      const bodies = toArray<unknown>(annotation.body ?? annotation.resource);

      for (const body of bodies) {
        const bodyId = extractId(body);
        if (!image && bodyId) {
          image = bodyId;
        }

        const serviceId = extractServiceId(body);
        if (!imageService && serviceId) {
          imageService = normaliseServiceUrl(serviceId);
        }

        if (image && imageService) {
          break;
        }
      }

      if (image && imageService) {
        break;
      }
    }

    if (image && imageService) {
      break;
    }
  }

  const thumbnailCandidates = toArray<unknown>(canvas.thumbnail);
  let thumbnail: string | undefined;
  for (const candidate of thumbnailCandidates) {
    thumbnail = extractThumbnail(candidate);
    if (thumbnail) {
      break;
    }
  }

  return {
    id: canvasId,
    label,
    width,
    height,
    image,
    imageService,
    thumbnail,
  };
};

const parseCanvasFromV2 = (canvas: Record<string, unknown>): IIIFCanvas => {
  const canvasId = extractId(canvas) ?? createId();
  const label = extractLabel(canvas.label);
  const width = isNumber(canvas.width) ? canvas.width : undefined;
  const height = isNumber(canvas.height) ? canvas.height : undefined;

  const images = toArray<Record<string, unknown>>(canvas.images);
  let image: string | undefined;
  let imageService: string | undefined;

  for (const imageEntry of images) {
    const resource = (imageEntry.resource ?? imageEntry.body) as unknown;
    const resourceId = extractId(resource);
    if (!image && resourceId) {
      image = resourceId;
    }

    const serviceCandidate =
      extractServiceId(resource) ?? extractServiceId(imageEntry);
    if (!imageService && serviceCandidate) {
      imageService = normaliseServiceUrl(serviceCandidate);
    }

    if (image && imageService) {
      break;
    }
  }

  const thumbnailCandidates = toArray<unknown>(canvas.thumbnail ?? images.map((imageEntry) => imageEntry.thumbnail));
  let thumbnail: string | undefined;
  for (const candidate of thumbnailCandidates) {
    thumbnail = extractThumbnail(candidate);
    if (thumbnail) {
      break;
    }
  }

  return {
    id: canvasId,
    label,
    width,
    height,
    image,
    imageService,
    thumbnail,
  };
};

const parseCanvases = (manifest: Record<string, unknown>): IIIFCanvas[] => {
  if (Array.isArray(manifest.items)) {
    return manifest.items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => parseCanvasFromV3(item))
      .filter((canvas) => canvas.image || canvas.imageService);
  }

  if (Array.isArray(manifest.sequences)) {
    for (const sequence of manifest.sequences) {
      if (sequence && typeof sequence === 'object' && Array.isArray((sequence as Record<string, unknown>).canvases)) {
        const canvases = (sequence as Record<string, unknown>).canvases as unknown[];
        return canvases
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => parseCanvasFromV2(item))
          .filter((canvas) => canvas.image || canvas.imageService);
      }
    }
  }

  return [];
};

export const parseManifest = (manifest: unknown): ParsedIIIFManifest => {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest response was not an object.');
  }

  const record = manifest as Record<string, unknown>;

  const manifestId = extractId(record) ?? createId();
  const label = extractLabel(record.label);
  const canvases = parseCanvases(record);

  return {
    id: manifestId,
    label,
    canvases,
  };
};

export const buildImageUrl = (canvas: IIIFCanvas, maxWidth = 1600): string | undefined => {
  if (canvas.imageService) {
    const service = normaliseServiceUrl(canvas.imageService);
    return `${service}/full/!${maxWidth},${maxWidth}/0/default.jpg`;
  }

  return canvas.image;
};

export const buildThumbnailUrl = (canvas: IIIFCanvas, maxWidth = 300): string | undefined => {
  if (canvas.thumbnail) {
    return canvas.thumbnail;
  }

  if (canvas.imageService) {
    const service = normaliseServiceUrl(canvas.imageService);
    return `${service}/full/!${maxWidth},${maxWidth}/0/default.jpg`;
  }

  return canvas.image;
};

