import { z } from 'zod';
import type { ItemCard } from '../lib/types';

const StringLikeSchema = z.union([z.string(), z.array(z.string())]);

const UbcThumbnailSchema = z
  .union([
    z.string(),
    z
      .object({
        src: z.string().optional(),
        url: z.string().optional(),
        square: z.string().optional(),
        large: z.string().optional(),
      })
      .passthrough(),
  ])
  .optional();

const UbcIiifSchema = z
  .object({
    id: z.string().optional(),
    '@id': z.string().optional(),
    service: z.string().optional(),
    manifest: z.string().optional(),
    tileSource: z.string().optional(),
  })
  .passthrough()
  .optional();

export const UbcHitSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    identifier: StringLikeSchema.optional(),
    title: StringLikeSchema.optional(),
    name: StringLikeSchema.optional(),
    label: StringLikeSchema.optional(),
    date: StringLikeSchema.optional(),
    issued: StringLikeSchema.optional(),
    displayDate: StringLikeSchema.optional(),
    collection: StringLikeSchema.optional(),
    creator: StringLikeSchema.optional(),
    contributor: StringLikeSchema.optional(),
    type: StringLikeSchema.optional(),
    url: StringLikeSchema.optional(),
    href: StringLikeSchema.optional(),
    source: StringLikeSchema.optional(),
    thumbnail: UbcThumbnailSchema,
    img: StringLikeSchema.optional(),
    image: StringLikeSchema.optional(),
    iiif: UbcIiifSchema,
  })
  .passthrough();

export const UbcResponseSchema = z
  .object({
    total: z.number().optional(),
    resultCount: z.number().optional(),
    results: z.array(UbcHitSchema).optional(),
    items: z.array(UbcHitSchema).optional(),
  })
  .passthrough();

type UbcHit = z.infer<typeof UbcHitSchema>;
type UbcResponse = z.infer<typeof UbcResponseSchema>;

const extractFirstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
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
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const result = extractFirstString(entry);
      if (result) {
        return result;
      }
    }
  }

  return undefined;
};

const getImage = (hit: UbcHit): string | undefined => {
  const thumb = extractFirstString(hit.thumbnail);
  if (thumb) {
    return thumb;
  }

  const direct = extractFirstString(hit.img ?? hit.image);
  if (direct) {
    return direct;
  }

  const iiif = hit.iiif;
  if (iiif) {
    const candidate = extractFirstString(iiif.id ?? iiif['@id'] ?? iiif.service ?? iiif.manifest);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const getIdentifier = (hit: UbcHit): string => {
  const candidates: Array<unknown> = [hit.id, hit.identifier, hit.url, hit.source];
  for (const candidate of candidates) {
    const value = extractFirstString(candidate);
    if (value) {
      return value;
    }
  }
  return `ubc-item-${Math.random().toString(36).slice(2)}`;
};

const toItemCard = (hit: UbcHit): ItemCard => {
  const identifier = getIdentifier(hit);
  const title =
    extractFirstString(hit.title) ??
    extractFirstString(hit.label) ??
    extractFirstString(hit.name) ??
    identifier;

  const sub = extractFirstString(hit.creator ?? hit.contributor ?? hit.collection);
  const date =
    extractFirstString(hit.date) ??
    extractFirstString(hit.issued) ??
    extractFirstString(hit.displayDate);

  const href = extractFirstString(hit.url ?? hit.href ?? hit.source);
  const img = getImage(hit);

  const tags = [extractFirstString(hit.collection), extractFirstString(hit.type)]
    .filter((value): value is string => !!value)
    .map((value) => value.trim());

  return {
    id: identifier,
    title,
    sub,
    date,
    tags: tags.length > 0 ? Array.from(new Set(tags)) : undefined,
    img,
    href,
    source: 'UBC',
    raw: hit,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const data: UbcResponse = UbcResponseSchema.parse(resp);
  const hits =
    Array.isArray(data.results) && data.results.length > 0 ? data.results : (data.items ?? []);
  return hits.map((hit) => toItemCard(hit));
};
