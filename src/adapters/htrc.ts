import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import { asArray, asRecord, fieldList, orUndefined, str } from './util';

/** Extracted Features v3 gives people and publishers as `{ name }` records, older data as strings. */
const names = (value: unknown): string[] =>
  asArray(value)
    .map((entry) => str(entry) ?? str(asRecord(entry)?.name))
    .filter((entry): entry is string => !!entry);

export const looksLikeHtid = (value: string): boolean =>
  /^[a-z][a-z0-9]{1,5}\.[\w$:/+.-]+$/i.test(value.trim());

export const toItemCard = (volumeId: string, payload: unknown): ItemCard => {
  const root = asRecord(payload) ?? {};
  const metadata = asRecord(root.metadata) ?? asRecord(asRecord(root.data)?.metadata) ?? root;
  const date = str(metadata.pubDate) ?? str(metadata.date) ?? str(metadata.publication_date);
  const authors = names(metadata.contributor ?? metadata.author ?? metadata.creator);
  // Genres arrive as vocabulary URIs in v3; only plain words are worth showing.
  const genres = names(metadata.genre).filter((genre) => !/^https?:/i.test(genre));
  return {
    id: volumeId,
    title: str(metadata.title) ?? str(metadata.volume_title) ?? `HTRC volume ${volumeId}`,
    sub: authors.length > 0 ? authors.slice(0, 2).join('; ') : undefined,
    date,
    tags: orUndefined(genres.slice(0, 4)),
    href: `https://babel.hathitrust.org/cgi/pt?id=${encodeURIComponent(volumeId)}`,
    source: 'HTRC',
    raw: payload,
    year: parseYear(date),
    kind: 'Volume metadata',
    fields: fieldList([
      ['Volume ID', volumeId],
      ['Published', date],
      ['Language', str(metadata.language)],
      ['Publisher', names(metadata.publisher)[0]],
      ['Published in', names(metadata.pubPlace)[0]],
      ['Page count', str(metadata.pageCount)],
    ]),
  };
};
