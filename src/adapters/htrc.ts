import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import { asRecord, fieldList, orUndefined, str, strings } from './util';

export const looksLikeHtid = (value: string): boolean =>
  /^[a-z][a-z0-9]{1,5}\.[\w$:/+.-]+$/i.test(value.trim());

export const toItemCard = (volumeId: string, payload: unknown): ItemCard => {
  const root = asRecord(payload) ?? {};
  const metadata = asRecord(root.metadata) ?? asRecord(asRecord(root.data)?.metadata) ?? root;
  const date = str(metadata.pubDate) ?? str(metadata.date) ?? str(metadata.publication_date);
  const authors = strings(metadata.contributor ?? metadata.author ?? metadata.creator);
  return {
    id: volumeId,
    title: str(metadata.title) ?? str(metadata.volume_title) ?? `HTRC volume ${volumeId}`,
    sub: authors.length > 0 ? authors.slice(0, 2).join('; ') : undefined,
    date,
    tags: orUndefined(strings(metadata.genre).slice(0, 4)),
    href: `https://babel.hathitrust.org/cgi/pt?id=${encodeURIComponent(volumeId)}`,
    source: 'HTRC',
    raw: payload,
    year: parseYear(date),
    kind: 'Volume metadata',
    fields: fieldList([
      ['Volume ID', volumeId],
      ['Published', date],
      ['Language', str(metadata.language)],
      ['Publisher', str(metadata.publisher)],
      ['Page count', str(metadata.pageCount)],
    ]),
  };
};
