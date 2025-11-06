export type IIIFImage = {
  id: string;
  service?: string;
  width: number;
  height: number;
  best: string;
  rights?: string;
};

export type IIIFCanvas = {
  id: string;
  label: string;
  width: number;
  height: number;
  image: IIIFImage | null;
  thumb?: string;
};

export type IIIFManifest = {
  id: string;
  label: string;
  provider?: string;
  rights?: string;
  canvases: IIIFCanvas[];
  raw: any;
};

const ACCEPT_HEADER =
  'application/ld+json;profile="http://iiif.io/api/presentation/3/context.json", application/json';

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

const toRecordArray = (value: unknown): Record<string, unknown>[] => {
  return toArray<Record<string, unknown>>(
    value as Record<string, unknown> | Record<string, unknown>[] | null | undefined,
  );
};

const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const extractId = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const id = record.id ?? record['@id'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

const extractLabel = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const label = extractLabel(item);
      if (label) return label;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const prioritizedKeys = ['@value', 'value', 'en', 'none', 'label'];
  for (const key of prioritizedKeys) {
    if (key in record) {
      const label = extractLabel(record[key]);
      if (label) return label;
    }
  }
  for (const entry of Object.values(record)) {
    const label = extractLabel(entry);
    if (label) return label;
  }
  return undefined;
};

const normaliseService = (service?: string): string | undefined => {
  if (!service) return undefined;
  return service.replace(/\/info\.json$/i, '').replace(/\/$/, '');
};

const serviceFromBody = (body: Record<string, unknown>): string | undefined => {
  const serviceField = body.service ?? body.services;
  if (typeof serviceField === 'string') {
    return normaliseService(serviceField);
  }
  const serviceRecords = toRecordArray(serviceField);
  for (const candidate of serviceRecords) {
    const id = extractId(candidate);
    if (id) return normaliseService(id);
  }
  const itemField = body.items;
  const items = toRecordArray(itemField);
  for (const item of items) {
    const fromItem = serviceFromBody(item);
    if (fromItem) return fromItem;
  }
  return undefined;
};

const parseImageRights = (body: Record<string, unknown>): string | undefined => {
  const rights = body.rights ?? body.license ?? body['dc:rights'];
  if (typeof rights === 'string') return rights;
  return extractLabel(rights);
};

const parseV3Image = (body: Record<string, unknown>, canvas: Record<string, unknown>): IIIFImage | null => {
  const id = extractId(body);
  const width = isNumber(body.width) ? body.width : isNumber(canvas.width) ? (canvas.width as number) : undefined;
  const height = isNumber(body.height) ? body.height : isNumber(canvas.height) ? (canvas.height as number) : undefined;
  if (!id || width === undefined || height === undefined) {
    return null;
  }
  const service = serviceFromBody(body);
  const normalizedService = normaliseService(service);
  const best = normalizedService ? imageTileUrl(normalizedService, 1200) : id;
  return {
    id,
    service: normalizedService,
    width,
    height,
    best,
    rights: parseImageRights(body),
  };
};

const parseV2Image = (annotation: Record<string, unknown>, canvas: Record<string, unknown>): IIIFImage | null => {
  const resource = annotation.resource ?? annotation.body;
  if (!resource || typeof resource !== 'object') {
    return null;
  }
  const record = resource as Record<string, unknown>;
  const id = extractId(record);
  const width = isNumber(record.width) ? record.width : isNumber(canvas.width) ? (canvas.width as number) : undefined;
  const height = isNumber(record.height) ? record.height : isNumber(canvas.height) ? (canvas.height as number) : undefined;
  if (!id || width === undefined || height === undefined) {
    return null;
  }
  const service = (() => {
    if (typeof record.service === 'string') return record.service;
    const services = toRecordArray(record.service);
    for (const candidate of services) {
      const id = extractId(candidate);
      if (id) return id;
    }
    return undefined;
  })();
  const normalizedService = normaliseService(service);
  const best = normalizedService ? imageTileUrl(normalizedService, 1200) : id;
  return {
    id,
    service: normalizedService,
    width,
    height,
    best,
    rights: parseImageRights(record),
  };
};

const parseCanvasV3 = (canvas: Record<string, unknown>): IIIFCanvas | null => {
  const id = extractId(canvas);
  if (!id) return null;
  const label = extractLabel(canvas.label) ?? 'Untitled canvas';
  const width = isNumber(canvas.width) ? (canvas.width as number) : 0;
  const height = isNumber(canvas.height) ? (canvas.height as number) : 0;

  const annotationPages = toRecordArray(canvas.items ?? canvas.annotations);
  let image: IIIFImage | null = null;
  for (const page of annotationPages) {
    const annotations = toRecordArray(page.items ?? page.annotations);
    for (const annotation of annotations) {
      const motivation = toArray<string | Record<string, unknown>>(
        annotation.motivation as
          | string
          | Record<string, unknown>
          | Array<string | Record<string, unknown>>
          | null
          | undefined,
      );
      const motivations = motivation.map((entry) => (typeof entry === 'string' ? entry : extractLabel(entry))).filter(Boolean);
      if (motivations.length === 0 || motivations.some((mot) => mot?.toLowerCase().includes('paint'))) {
        const bodies = toRecordArray(annotation.body);
        for (const candidate of bodies) {
          image = parseV3Image(candidate, canvas);
          if (image) break;
        }
        if (image) break;
      }
    }
    if (image) break;
  }

  const thumb = (() => {
    const thumbValue = canvas.thumbnail;
    if (typeof thumbValue === 'string') return thumbValue;
    const thumbRecord = toRecordArray(thumbValue)[0];
    if (thumbRecord) {
      const thumbId = extractId(thumbRecord);
      if (thumbId) return thumbId;
      const thumbService = serviceFromBody(thumbRecord);
      if (thumbService) return imageTileUrl(thumbService, 320);
    }
    if (image?.service) return imageTileUrl(image.service, 320);
    if (image) return image.best;
    return undefined;
  })();

  return {
    id,
    label,
    width,
    height,
    image,
    thumb,
  };
};

const parseCanvasV2 = (canvas: Record<string, unknown>): IIIFCanvas | null => {
  const id = extractId(canvas);
  if (!id) return null;
  const label = extractLabel(canvas.label) ?? 'Untitled canvas';
  const width = isNumber(canvas.width) ? (canvas.width as number) : 0;
  const height = isNumber(canvas.height) ? (canvas.height as number) : 0;
  const images = toRecordArray(canvas.images ?? canvas.items);

  let image: IIIFImage | null = null;
  for (const annotation of images) {
    const resource = parseV2Image(annotation, canvas);
    if (resource) {
      image = resource;
      break;
    }
  }

  const thumb = (() => {
    const thumbValue = canvas.thumbnail;
    if (typeof thumbValue === 'string') return thumbValue;
    const thumbRecord = toRecordArray(thumbValue)[0];
    if (thumbRecord) {
      const thumbId = extractId(thumbRecord);
      if (thumbId) return thumbId;
      const thumbService = serviceFromBody(thumbRecord);
      if (thumbService) return imageTileUrl(thumbService, 320);
    }
    if (image?.service) return imageTileUrl(image.service, 320);
    if (image) return image.best;
    return undefined;
  })();

  return {
    id,
    label,
    width,
    height,
    image,
    thumb,
  };
};

const rightsFromManifest = (manifest: Record<string, unknown>): string | undefined => {
  const rights = manifest.rights ?? manifest.license ?? manifest.attribution;
  if (typeof rights === 'string') return rights;
  return extractLabel(rights);
};

const providerFromManifest = (manifest: Record<string, unknown>): string | undefined => {
  const providerField = manifest.provider;
  if (typeof providerField === 'string') {
    return providerField;
  }
  const providers = toRecordArray(providerField);
  for (const provider of providers) {
    const label = extractLabel(provider.label ?? provider.name ?? provider);
    if (label) return label;
  }
  const attribution = manifest.attribution;
  if (typeof attribution === 'string') return attribution;
  return extractLabel(attribution);
};

const detectV3 = (manifest: Record<string, unknown>): boolean => {
  const context = manifest['@context'];
  if (typeof context === 'string' && context.includes('/presentation/3')) {
    return true;
  }
  if (Array.isArray(context) && context.some((entry) => typeof entry === 'string' && entry.includes('/presentation/3'))) {
    return true;
  }
  const type = manifest.type ?? manifest['@type'];
  if (typeof type === 'string' && type.toLowerCase().includes('manifest') && !String(type).includes('sc:')) {
    return true;
  }
  return Boolean(manifest.items);
};

const buildCanvases = (manifest: Record<string, unknown>): IIIFCanvas[] => {
  const canvases: IIIFCanvas[] = [];
  if (detectV3(manifest)) {
    const items = toRecordArray(manifest.items);
    for (const item of items) {
      const parsed = parseCanvasV3(item);
      if (parsed) canvases.push(parsed);
    }
  } else {
    const sequences = toRecordArray(manifest.sequences);
    for (const sequence of sequences) {
      const canvasItems = toRecordArray(sequence.items ?? sequence.canvases);
      for (const canvas of canvasItems) {
        const parsed = parseCanvasV2(canvas);
        if (parsed) canvases.push(parsed);
      }
      if (canvasItems.length) break;
    }
  }
  return canvases;
};

export async function loadManifest(url: string, signal?: AbortSignal): Promise<IIIFManifest> {
  const response = await fetch(url, {
    headers: { Accept: ACCEPT_HEADER },
    mode: 'cors',
    signal,
  }).catch((error: unknown) => {
    const origin = (() => {
      try {
        const parsed = new URL(url);
        return parsed.origin;
      } catch {
        return url;
      }
    })();
    const message =
      error instanceof Error
        ? `Unable to fetch manifest. The server at ${origin} may be blocking CORS or is unreachable. (${error.message})`
        : `Unable to fetch manifest. The server at ${origin} may be blocking CORS.`;
    throw new Error(message);
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Manifest request failed (${response.status}). ${text.slice(0, 140)}`.trim());
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Manifest response was not valid JSON.');
  }

  const manifestRecord = data as Record<string, unknown>;
  const id = extractId(manifestRecord) ?? url;
  const label = extractLabel(manifestRecord.label) ?? 'Untitled manifest';
  const canvases = buildCanvases(manifestRecord);
  if (canvases.length === 0) {
    throw new Error('Manifest contains no canvases that could be parsed.');
  }

  return {
    id,
    label,
    provider: providerFromManifest(manifestRecord),
    rights: rightsFromManifest(manifestRecord),
    canvases,
    raw: data,
  };
}

export function imageTileUrl(service: string, maxWH = 2000): string {
  return `${service}/full/!${maxWH},${maxWH}/0/default.jpg`;
}

export function canvasThumb(canvas: IIIFCanvas): string | undefined {
  if (canvas.thumb) return canvas.thumb;
  if (canvas.image?.service) {
    return imageTileUrl(canvas.image.service, 200);
  }
  return canvas.image?.best;
}
