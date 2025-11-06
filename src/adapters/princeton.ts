import { z } from 'zod';
import type { ItemCard } from '../lib/types';

const IIIFBodySchema = z
  .union([
    z.string(),
    z
      .object({
        id: z.string().optional(),
        '@id': z.string().optional(),
        type: z.string().optional(),
        format: z.string().optional(),
      })
      .passthrough(),
  ])
  .optional();

const IIIFAnnotationSchema = z
  .object({
    body: IIIFBodySchema,
  })
  .passthrough();

const IIIFAnnotationPageSchema = z
  .object({
    items: z.array(IIIFAnnotationSchema).optional(),
  })
  .passthrough();

const ThumbnailSchema = z
  .union([
    z.string(),
    z.array(
      z.union([
        z.string(),
        z.object({ id: z.string().optional(), '@id': z.string().optional() }).passthrough(),
      ]),
    ),
    z.object({ id: z.string().optional(), '@id': z.string().optional() }).passthrough(),
  ])
  .optional();

const IIIFCanvasSchema = z
  .object({
    id: z.string().optional(),
    '@id': z.string().optional(),
    label: z.unknown().optional(),
    items: z.array(IIIFAnnotationPageSchema).optional(),
    thumbnail: ThumbnailSchema,
  })
  .passthrough();

const IIIFSequenceSchema = z
  .object({
    canvases: z.array(IIIFCanvasSchema).optional(),
  })
  .passthrough();

const IIIFManifestSchema = z
  .object({
    id: z.string().optional(),
    '@id': z.string().optional(),
    label: z.unknown().optional(),
    items: z.array(IIIFCanvasSchema).optional(),
    sequences: z.array(IIIFSequenceSchema).optional(),
  })
  .passthrough();

const PrincetonImageSchema = z
  .object({
    representative: z.string().optional(),
    url: z.string().optional(),
    thumbnail: z.string().optional(),
    iiif: IIIFManifestSchema.optional(),
  })
  .passthrough();

const PrincetonMakerSchema = z
  .object({
    name: z.string().optional(),
  })
  .passthrough();

export const PrincetonRecordSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.unknown().optional(),
    display_title: z.unknown().optional(),
    label: z.unknown().optional(),
    name: z.unknown().optional(),
    displaydate: z.string().optional(),
    display_date: z.string().optional(),
    date: z.unknown().optional(),
    url: z.string().optional(),
    link: z.string().optional(),
    slug: z.string().optional(),
    manifest: z.union([IIIFManifestSchema, z.string()]).optional(),
    iiif_manifest: z.union([IIIFManifestSchema, z.string()]).optional(),
    iiifManifest: z.union([IIIFManifestSchema, z.string()]).optional(),
    images: z.array(PrincetonImageSchema).optional(),
    primary_image: z.object({ url: z.string().optional() }).passthrough().optional(),
    primaryimageurl: z.string().optional(),
    representative_image: z.string().optional(),
    makers: z.array(PrincetonMakerSchema).optional(),
    maker: z.unknown().optional(),
    artists: z.array(PrincetonMakerSchema).optional(),
    artist: z.unknown().optional(),
  })
  .passthrough();

const PrincetonResponseSchema = z
  .object({
    records: z.array(PrincetonRecordSchema).optional(),
    results: z.array(PrincetonRecordSchema).optional(),
    data: z.array(PrincetonRecordSchema).optional(),
    hits: z.array(PrincetonRecordSchema).optional(),
  })
  .passthrough();

type IIIFCanvas = z.infer<typeof IIIFCanvasSchema>;
type IIIFManifest = z.infer<typeof IIIFManifestSchema>;
type PrincetonRecord = z.infer<typeof PrincetonRecordSchema>;
type PrincetonResponse = z.infer<typeof PrincetonResponseSchema>;

const extractString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = extractString(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const priorityKeys = [
      'value',
      '@value',
      'default',
      'en',
      'text',
      'content',
      'title',
      'label',
      'rendered',
    ];

    for (const key of priorityKeys) {
      if (key in record) {
        const result = extractString(record[key]);
        if (result) {
          return result;
        }
      }
    }

    for (const entry of Object.values(record)) {
      const result = extractString(entry);
      if (result) {
        return result;
      }
    }
  }

  return undefined;
};

const flattenCanvases = (manifest: IIIFManifest | undefined): IIIFCanvas[] => {
  if (!manifest) {
    return [];
  }

  const canvases: IIIFCanvas[] = [];
  if (Array.isArray(manifest.items)) {
    canvases.push(...manifest.items);
  }
  if (Array.isArray(manifest.sequences)) {
    for (const sequence of manifest.sequences) {
      if (Array.isArray(sequence.canvases)) {
        canvases.push(...sequence.canvases);
      }
    }
  }
  return canvases;
};

const getCanvasImage = (canvas: IIIFCanvas): string | undefined => {
  const thumb = canvas.thumbnail;
  if (typeof thumb === 'string' && thumb.trim().length > 0) {
    return thumb.trim();
  }
  if (Array.isArray(thumb)) {
    for (const entry of thumb) {
      const url = extractString(entry);
      if (url) {
        return url;
      }
    }
  }
  if (thumb && typeof thumb === 'object') {
    const url = extractString(thumb);
    if (url) {
      return url;
    }
  }

  if (!Array.isArray(canvas.items)) {
    return undefined;
  }

  for (const page of canvas.items) {
    if (!Array.isArray(page?.items)) continue;
    for (const annotation of page.items) {
      const body = annotation?.body;
      const candidate = extractString(body);
      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
};

const getManifest = (record: PrincetonRecord): IIIFManifest | undefined => {
  const candidates = [record.manifest, record.iiif_manifest, record.iiifManifest];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      continue;
    }
    return candidate;
  }
  const imageManifest = record.images?.find((image) => image.iiif)?.iiif;
  if (imageManifest) {
    return imageManifest;
  }
  return undefined;
};

const getPrimaryImage = (record: PrincetonRecord): string | undefined => {
  const candidates = [
    record.representative_image,
    record.primary_image?.url,
    record.primaryimageurl,
  ];

  for (const candidate of candidates) {
    const url = typeof candidate === 'string' ? candidate.trim() : undefined;
    if (url && url.length > 0) {
      return url;
    }
  }

  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const url = image.representative ?? image.url ?? image.thumbnail;
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  const manifest = getManifest(record);
  const canvases = flattenCanvases(manifest);
  for (const canvas of canvases) {
    const url = getCanvasImage(canvas);
    if (url) {
      return url;
    }
  }

  return undefined;
};

const getMakers = (record: PrincetonRecord): string | undefined => {
  const makerCandidates = [record.makers, record.artists];
  for (const list of makerCandidates) {
    if (!Array.isArray(list)) continue;
    for (const maker of list) {
      const name = maker?.name;
      if (typeof name === 'string' && name.trim().length > 0) {
        return name.trim();
      }
    }
  }

  const fallback = extractString(record.maker ?? record.artist);
  return fallback;
};

const toItemCard = (record: PrincetonRecord): ItemCard => {
  const title =
    extractString(record.title) ??
    extractString(record.display_title) ??
    extractString(record.label) ??
    extractString(record.name) ??
    `Princeton item ${record.id}`;

  const sub = getMakers(record);
  const date = extractString(record.displaydate ?? record.display_date ?? record.date);

  const hrefCandidates = [record.url, record.link, record.slug];
  let href: string | undefined;
  for (const candidate of hrefCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      href = candidate.trim();
      break;
    }
  }

  const img = getPrimaryImage(record);

  return {
    id: String(record.id),
    title,
    sub,
    date,
    img,
    href,
    source: 'Princeton',
    raw: record,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const data: PrincetonResponse = PrincetonResponseSchema.parse(resp);
  const candidateSets = [data.records, data.results, data.data, data.hits];
  for (const set of candidateSets) {
    if (Array.isArray(set) && set.length > 0) {
      return set.map((record) => toItemCard(record));
    }
  }
  return [];
};
