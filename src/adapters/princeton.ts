import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import { asRecord, fieldList, iiifImage, orUndefined, str, type Rec } from './util';

/**
 * `displaymaker` packs every maker and their biography into one string:
 * "Roy Lichtenstein, 1923–1997; born and died New York, NY | Printed by Kenneth Tyler…".
 */
export const makerNames = (displaymaker: string | undefined): string[] => {
  if (!displaymaker) return [];
  return displaymaker
    .split('|')
    .map((part) => part.split(/[,;]/)[0].trim())
    .filter((name) => name.length > 0);
};

/** Short medium label for facets: "Color lithograph and screenprint margins on…" → "Color lithograph". */
const mediumLabel = (medium: string | undefined): string | undefined => {
  if (!medium) return undefined;
  const head = medium.split(/\s+(?:on|and|with)\s+|[,;(]/i)[0].trim();
  return head.length > 0 && head.length <= 40
    ? head.charAt(0).toUpperCase() + head.slice(1)
    : undefined;
};

const parseHit = (hit: Rec): ItemCard => {
  const source = asRecord(hit._source) ?? hit;
  const objectId =
    str(source.objectid) ?? str(hit._id) ?? `princeton-${Math.random().toString(36).slice(2)}`;
  const displaymaker = str(source.displaymaker);
  const makers = makerNames(displaymaker);
  const medium = str(source.medium);
  const date = str(source.displaydate);
  const imageBase = str(source.primaryimage);
  const short = mediumLabel(medium);

  return {
    id: objectId,
    title: str(source.displaytitle) ?? str(source.title) ?? 'Untitled',
    sub:
      makers.length > 0
        ? makers.slice(0, 2).join(', ') + (makers.length > 2 ? ` +${makers.length - 2}` : '')
        : undefined,
    date,
    tags: orUndefined([short].filter((value): value is string => !!value)),
    img: iiifImage(imageBase, 480),
    imgLarge: iiifImage(imageBase, 1400),
    href: /^\d+$/.test(objectId)
      ? `https://artmuseum.princeton.edu/collections/objects/${objectId}`
      : undefined,
    source: 'Princeton',
    raw: hit,
    year: parseYear(date),
    kind: short,
    people: orUndefined(makers),
    fields: fieldList([
      [
        'Maker',
        displaymaker
          ?.split('|')
          .map((part) => part.trim())
          .join('\n'),
      ],
      ['Date', date],
      ['Medium', medium],
      ['Dimensions', str(source.dimensions)],
      ['Object number', str(source.objectnumber)],
      ['Credit line', str(source.creditline)],
    ]),
    links: imageBase ? [{ label: 'IIIF image info', href: `${imageBase}/info.json` }] : undefined,
  };
};

const hitsOf = (resp: unknown): Rec | null => asRecord(asRecord(resp)?.hits);

export const toItemCards = (resp: unknown): ItemCard[] => {
  const hits = hitsOf(resp)?.hits;
  return Array.isArray(hits)
    ? hits
        .map(asRecord)
        .filter((h): h is Rec => h !== null)
        .map(parseHit)
    : [];
};

export const totalHits = (resp: unknown): number | undefined => {
  const total = hitsOf(resp)?.total;
  if (typeof total === 'number') return total;
  const value = asRecord(total)?.value;
  return typeof value === 'number' ? value : undefined;
};
