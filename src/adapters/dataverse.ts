import { z } from 'zod';
import type { ItemCard } from '../lib/types';

const DataverseItemTypeSchema = z.enum(['dataverse', 'dataset', 'file']);

export const DataverseItemSchema = z
  .object({
    type: DataverseItemTypeSchema.optional(),
    id: z.union([z.string(), z.number()]).optional(),
    entity_id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    published_at: z.string().optional(),
    release_date: z.string().optional(),
    publicationDate: z.string().optional(),
    global_id: z.string().optional(),
    identifier: z.string().optional(),
    persistentId: z.string().optional(),
    persistentUrl: z.string().optional(),
    url: z.string().optional(),
    doi: z.string().optional(),
  })
  .passthrough();

const DataverseDataSchema = z
  .object({
    total_count: z.number().optional(),
    count_in_response: z.number().optional(),
    items: z.array(DataverseItemSchema).optional(),
  })
  .passthrough();

export const DataverseResponseSchema = z
  .object({
    status: z.string().optional(),
    total_count: z.number().optional(),
    count: z.number().optional(),
    data: DataverseDataSchema.optional(),
  })
  .passthrough();

type DataverseItem = z.infer<typeof DataverseItemSchema>;
type DataverseResponse = z.infer<typeof DataverseResponseSchema>;

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

const getIdentifier = (item: DataverseItem): string => {
  const candidates: Array<unknown> = [
    item.global_id,
    item.persistentUrl,
    item.persistentId,
    item.identifier,
    item.doi,
    item.url,
    item.id,
    item.entity_id,
  ];

  for (const candidate of candidates) {
    const value = extractFirstString(candidate);
    if (value) {
      return value;
    }
  }

  return `dataverse-item-${Math.random().toString(36).slice(2)}`;
};

const toItemCard = (item: DataverseItem): ItemCard => {
  const identifier = getIdentifier(item);
  const title = extractFirstString(item.title ?? item.name) ?? identifier;
  const description = extractFirstString(item.description);
  const date =
    extractFirstString(item.published_at) ??
    extractFirstString(item.release_date) ??
    extractFirstString(item.publicationDate);
  const href = extractFirstString(item.url ?? item.global_id ?? item.persistentUrl);
  const tags = item.type ? [item.type] : undefined;

  return {
    id: identifier,
    title,
    sub: description,
    date,
    tags,
    href,
    source: 'Dataverse',
    raw: item,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const data: DataverseResponse = DataverseResponseSchema.parse(resp);
  const items = data.data?.items ?? [];
  return items.map((item) => toItemCard(item));
};
