import { centuryToYear, parseYear } from '../lib/dates';
import type { ColorSwatch, ItemCard } from '../lib/types';
import { asArray, asRecord, fieldList, orUndefined, str, truncate, unique, type Rec } from './util';

/** Harvard serves renditions from the NRS resolver; `height`/`width` request a bounded size. */
const sized = (url: string | undefined, box: number): string | undefined => {
  if (!url) return undefined;
  if (/\/full\//.test(url) || url.includes('?')) return url;
  return `${url}?height=${box}&width=${box}`;
};

const findImage = (record: Rec): string | undefined => {
  const primary = str(record.primaryimageurl);
  if (primary) return primary;
  for (const entry of asArray(record.images)) {
    const image = asRecord(entry);
    const base = image ? (str(image.baseimageurl) ?? str(image.iiifbaseuri)) : undefined;
    if (base) return base;
  }
  return undefined;
};

const aspectOf = (record: Rec): number | undefined => {
  const image = asRecord(asArray(record.images)[0]);
  const width = image?.width;
  const height = image?.height;
  return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
    ? width / height
    : undefined;
};

const people = (record: Rec): Array<{ name: string; role?: string }> =>
  asArray(record.people)
    .map((entry): { name: string; role?: string } | null => {
      const person = asRecord(entry);
      const name = person ? (str(person.displayname) ?? str(person.name)) : undefined;
      return name ? { name, role: person ? str(person.role) : undefined } : null;
    })
    .filter((entry): entry is { name: string; role?: string } => entry !== null);

const colors = (record: Rec): ColorSwatch[] =>
  asArray(record.colors)
    .map((entry): ColorSwatch | null => {
      const color = asRecord(entry);
      const hex = color ? str(color.color) : undefined;
      const percent = color && typeof color.percent === 'number' ? color.percent : 0;
      return hex && /^#[0-9a-f]{6}$/i.test(hex)
        ? { hex, percent, hue: color ? str(color.hue) : undefined }
        : null;
    })
    .filter((entry): entry is ColorSwatch => entry !== null);

/**
 * `datebegin` is usually a real year but is sometimes a placeholder (0, or the
 * century number). Trust it only when it agrees with the `century` label.
 */
const resolveYear = (record: Rec): number | undefined => {
  const century = centuryToYear(str(record.century));
  const begin =
    typeof record.datebegin === 'number' && record.datebegin !== 0 ? record.datebegin : undefined;
  if (begin !== undefined && (century === undefined || Math.abs(begin - century) <= 100))
    return begin;
  return century ?? parseYear(str(record.dated));
};

const manifest = (record: Rec): string | undefined => {
  for (const entry of asArray(record.seeAlso)) {
    const link = asRecord(entry);
    if (link && /iiif/i.test(str(link.type) ?? '')) return str(link.id);
  }
  return undefined;
};

const recordToCard = (record: Rec): ItemCard => {
  const makers = people(record);
  const image = findImage(record);
  const swatches = colors(record);
  const worktype = str(asRecord(asArray(record.worktypes)[0])?.worktype);
  const tags = unique(
    [
      str(record.classification),
      str(record.culture),
      str(record.century),
      str(record.technique),
      str(record.period),
    ].filter((value): value is string => !!value),
  );
  const manifestUrl = manifest(record);

  return {
    id:
      str(record.id) ??
      str(record.objectid) ??
      str(record.objectnumber) ??
      `harvard-${Math.random().toString(36).slice(2)}`,
    title: str(record.title) ?? 'Untitled',
    sub: makers.length > 0 ? makers.map((person) => person.name).join(', ') : str(record.division),
    date: str(record.dated),
    tags: orUndefined(tags),
    img: sized(image, 480),
    imgLarge: sized(image, 1400),
    aspect: aspectOf(record),
    href: str(record.url),
    source: 'Harvard',
    raw: record,
    year: resolveYear(record),
    kind: str(record.classification) ?? worktype,
    people: orUndefined(makers.map((person) => person.name)),
    description: truncate(
      str(record.description) ?? str(record.labeltext) ?? str(record.commentary),
      900,
    ),
    manifest: manifestUrl,
    colors: orUndefined(swatches),
    fields: fieldList([
      [
        'Maker',
        orUndefined(makers.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)))?.join('; '),
      ],
      ['Date', str(record.dated)],
      ['Culture', str(record.culture)],
      ['Period', str(record.period)],
      ['Classification', str(record.classification)],
      ['Medium', str(record.medium)],
      ['Technique', str(record.technique)],
      ['Dimensions', str(record.dimensions)],
      ['Department', str(record.department)],
      ['Object number', str(record.objectnumber)],
      ['Credit line', str(record.creditline)],
      ['Copyright', str(record.copyright)],
    ]),
    links: manifestUrl ? [{ label: 'IIIF manifest', href: manifestUrl }] : undefined,
  };
};

const extractRecords = (resp: unknown): Rec[] => {
  if (Array.isArray(resp)) return resp.map(asRecord).filter((r): r is Rec => r !== null);
  const record = asRecord(resp);
  if (!record || 'error' in record) return [];
  if (Array.isArray(record.records))
    return record.records.map(asRecord).filter((r): r is Rec => r !== null);
  const single = asRecord(record.record);
  if (single) return [single];
  return 'id' in record || 'objectid' in record ? [record] : [];
};

export const toItemCards = (resp: unknown): ItemCard[] => extractRecords(resp).map(recordToCard);

export const totalRecords = (resp: unknown): number | undefined => {
  const total = asRecord(asRecord(resp)?.info)?.totalrecords;
  return typeof total === 'number' ? total : undefined;
};
