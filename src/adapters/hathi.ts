import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import { asRecord, fieldList, orUndefined, str, strings, type Rec } from './util';

export type HathiIdType = 'oclc' | 'isbn' | 'lccn' | 'htid' | 'recordnumber';

/** Recognise the identifier a person pasted. Returns null for ordinary keywords. */
export const detectHathiIdentifier = (input: string): { type: HathiIdType; id: string } | null => {
  const query = input.trim();
  if (!query || /\s/.test(query.replace(/^[a-z]+[:=]\s*/i, ''))) return null;

  const prefixed = query.match(/^(oclc|isbn|lccn|htid|recordnumber)[:=]\s*(.+)$/i);
  if (prefixed) return { type: prefixed[1].toLowerCase() as HathiIdType, id: prefixed[2].trim() };

  if (/^[a-z][a-z0-9]{1,5}\.[\w$:/+.-]+$/i.test(query)) return { type: 'htid', id: query };

  const isbn = query.replace(/-/g, '');
  if (/^(?:\d{9}[\dXx]|97[89]\d{10})$/.test(isbn)) return { type: 'isbn', id: isbn };

  const oclc = query.match(/^(?:ocn|ocm|on)(\d+)$/i);
  if (oclc) return { type: 'oclc', id: oclc[1] };

  return null;
};

export const hathiPath = (type: HathiIdType, id: string): string =>
  `/hathi-catalog/api/volumes/full/${type}/${encodeURIComponent(id)}.json`;

const itemToCard = (recordId: string, record: Rec, item: Rec): ItemCard => {
  const htid = str(item.htid);
  const published = str(record.publishDates);
  const rights = str(item.usRightsString);
  const enumcron = typeof item.enumcron === 'string' ? str(item.enumcron) : undefined;
  const title = str(record.titles) ?? `HathiTrust record ${recordId}`;

  return {
    id: htid ?? `${recordId}-${Math.random().toString(36).slice(2)}`,
    title: enumcron ? `${title} — ${enumcron}` : title,
    sub: str(item.orig) ? `Digitized from ${str(item.orig)}` : 'Digitized volume',
    date: published,
    tags: orUndefined([rights].filter((value): value is string => !!value)),
    href: str(item.itemURL) ?? str(record.recordURL),
    source: 'HathiCatalog',
    raw: { record: { ...record, 'marc-xml': undefined }, item },
    year: parseYear(published),
    kind: 'Volume',
    fields: fieldList([
      ['Volume ID', htid],
      ['Original library', str(item.orig)],
      ['Published', published],
      ['US access', rights],
      ['Rights code', str(item.rightsCode)],
      ['OCLC', orUndefined(strings(record.oclcs))?.join(', ')],
      ['ISBN', orUndefined(Array.from(new Set(strings(record.isbns))))?.join(', ')],
      ['LCCN', orUndefined(strings(record.lccns))?.join(', ')],
      ['Last updated', str(item.lastUpdate)],
    ]),
    links: str(record.recordURL)
      ? [{ label: 'Catalog record', href: str(record.recordURL) as string }]
      : undefined,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const response = asRecord(resp);
  const records = asRecord(response?.records) ?? {};
  const items = Array.isArray(response?.items) ? response.items : [];
  const cards: ItemCard[] = [];
  for (const entry of items) {
    const item = asRecord(entry);
    const recordId = item ? str(item.fromRecord) : undefined;
    const record = recordId ? asRecord(records[recordId]) : null;
    if (item && recordId && record) cards.push(itemToCard(recordId, record, item));
  }
  return cards;
};
