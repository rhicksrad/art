import { fetchJSON, HttpError } from '../lib/http';
import type { ItemCard } from '../lib/types';

export type HathiIdType = 'oclc' | 'isbn' | 'lccn' | 'htid';

type HathiRecord = {
  recordURL?: string;
  titles?: string[];
  publishDates?: string[];
  oclcs?: string[];
  lccns?: string[];
  isbns?: string[];
};

type HathiItem = {
  htid?: string;
  itemURL?: string;
  rightsCode?: string;
  usRightsString?: string;
  orig?: string;
  fromRecord?: string;
};

type HathiCatalogResponse = {
  records?: Record<string, HathiRecord>;
  items?: HathiItem[];
};

const first = (value: string[] | undefined): string | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
};

const buildTags = (record: HathiRecord, item: HathiItem): string[] => {
  const tags = new Set<string>();
  const add = (value: string | undefined, prefix?: string): void => {
    if (value) {
      tags.add(prefix ? `${prefix}: ${value}` : value);
    }
  };
  add(item.usRightsString);
  add(item.rightsCode ? item.rightsCode.toUpperCase() : undefined, 'Rights');
  add(first(record.oclcs), 'OCLC');
  add(first(record.lccns), 'LCCN');
  add(first(record.isbns), 'ISBN');
  return Array.from(tags).filter((value) => value.length > 0);
};

const itemToCard = (recordId: string, record: HathiRecord, item: HathiItem): ItemCard => {
  const title = first(record.titles) ?? `HathiTrust volume ${recordId}`;
  const tags = buildTags(record, item).slice(0, 5);

  return {
    id: item.htid ?? `${recordId}-${crypto.randomUUID()}`,
    title,
    sub: item.orig ?? 'Digitized volume',
    date: first(record.publishDates),
    tags: tags.length > 0 ? tags : undefined,
    href: item.itemURL ?? record.recordURL,
    source: 'HathiCatalog',
    raw: { record, item },
  };
};

const recordFallbackCard = (recordId: string, record: HathiRecord): ItemCard => {
  return {
    id: recordId,
    title: first(record.titles) ?? `HathiTrust record ${recordId}`,
    sub: first(record.oclcs) ? `OCLC ${first(record.oclcs)}` : undefined,
    date: first(record.publishDates),
    href: record.recordURL,
    tags: undefined,
    source: 'HathiCatalog',
    raw: record,
  };
};

const toItemCards = (response: HathiCatalogResponse): ItemCard[] => {
  const records = response.records ?? {};
  const items = Array.isArray(response.items) ? response.items : [];
  const cards: ItemCard[] = [];

  for (const item of items) {
    const recordId = item.fromRecord;
    if (!recordId || !(recordId in records)) {
      continue;
    }
    cards.push(itemToCard(recordId, records[recordId], item));
  }

  if (cards.length === 0) {
    for (const [recordId, record] of Object.entries(records)) {
      cards.push(recordFallbackCard(recordId, record));
    }
  }

  return cards;
};

const encodeId = (value: string): string => {
  return encodeURIComponent(value.trim());
};

export const hathiSearchById = async (
  idType: HathiIdType,
  id: string,
  options?: { signal?: AbortSignal },
): Promise<ItemCard[]> => {
  const value = id.trim();
  if (!value) {
    return [];
  }
  const path = `/hathi-catalog/api/volumes/full/${idType}/${encodeId(value)}.json`;
  try {
    const response = await fetchJSON<HathiCatalogResponse>(path, undefined, { signal: options?.signal });
    return toItemCards(response);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return [];
    }
    throw error;
  }
};

export default hathiSearchById;
