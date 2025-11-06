import type { ItemCard } from '../lib/types';

type DataverseItem = Record<string, unknown>;

type DataverseResponse = {
  data?: {
    items?: DataverseItem[];
  };
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toStringValue(entry))
      .filter((entry): entry is string => !!entry);
  }
  const single = toStringValue(value);
  return single ? [single] : [];
};

const toItemCard = (item: DataverseItem): ItemCard => {
  const id =
    toStringValue(item.global_id) ??
    toStringValue(item.persistentId) ??
    `dataverse-${Math.random().toString(36).slice(2)}`;
  const title = toStringValue(item.name) ?? toStringValue(item.title) ?? 'Untitled';
  const sub = toStringValue(item.type);
  const date =
    toStringValue(item.published_at) ??
    toStringValue(item.release_time) ??
    toStringValue(item.created_at);
  const href = toStringValue(item.url ?? item.landingPage ?? item.html_url);
  const tags = toStringArray(item.subjects ?? item.keywords);

  return {
    id,
    title,
    sub,
    date,
    tags: tags.length > 0 ? tags : undefined,
    href,
    source: 'Dataverse',
    raw: item,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  if (!resp || typeof resp !== 'object') {
    return [];
  }
  const data = (resp as DataverseResponse).data;
  const items = Array.isArray(data?.items) ? data?.items : [];
  return items.map((item) => toItemCard(item));
};
