import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import {
  asArray,
  asRecord,
  fieldList,
  iiifImage,
  orUndefined,
  str,
  truncate,
  type Rec,
} from './util';

const PURL_ID_PATTERN = /^[a-z]{2}\d{3}[a-z]{2}\d{4}$/i;

/** Accepts a bare druid, `druid:…`, or a purl.stanford.edu URL. */
export const normalizePurlId = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed
    .replace(/^https?:\/\/purl\.stanford\.edu\//i, '')
    .replace(/^druid:/i, '')
    .replace(/[/?#].*$/, '');
  return PURL_ID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
};

const records = (value: unknown): Rec[] =>
  asArray(value)
    .map(asRecord)
    .filter((r): r is Rec => r !== null);

/** Cocina descriptive values are `{ value }` or `{ structuredValue: [{ value }] }`. */
const cocinaValue = (entry: Rec): string | undefined => {
  const direct = str(entry.value);
  if (direct) return direct;
  const parts = records(entry.structuredValue)
    .map((part) => cocinaValue(part))
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' – ') : undefined;
};

const contributors = (description: Rec): string[] =>
  records(description.contributor)
    .map((entry) => {
      const name = records(entry.name).map(cocinaValue).find(Boolean);
      const role = records(entry.role).map(cocinaValue).find(Boolean);
      return name ? (role ? `${name} (${role})` : name) : undefined;
    })
    .filter((entry): entry is string => !!entry);

const eventDate = (description: Rec): string | undefined => {
  for (const event of records(description.event)) {
    const date = records(event.date).map(cocinaValue).find(Boolean);
    if (date) return date;
  }
  return undefined;
};

const noteOfType = (description: Rec, type: string): string | undefined =>
  records(description.note)
    .filter((note) => str(note.type) === type)
    .map(cocinaValue)
    .find(Boolean);

/** Image service ids for every canvas in a IIIF Presentation 2 or 3 manifest. */
export const manifestImageServices = (manifest: unknown): string[] => {
  const root = asRecord(manifest);
  if (!root) return [];
  const services: string[] = [];
  const v2Canvases = records(root.sequences).flatMap((sequence) => records(sequence.canvases));
  for (const canvas of v2Canvases) {
    const resource = asRecord(records(canvas.images)[0]?.resource);
    const service = str(asRecord(resource?.service)?.['@id']);
    if (service) services.push(service);
  }
  for (const canvas of records(root.items)) {
    const body = asRecord(records(records(canvas.items)[0]?.items)[0]?.body);
    const service = records(body?.service)[0];
    const id = service ? (str(service.id) ?? str(service['@id'])) : undefined;
    if (id) services.push(id);
  }
  return services;
};

export const toItemCard = (purlId: string, cocina: unknown, manifest?: unknown): ItemCard => {
  const root = asRecord(cocina) ?? {};
  const description = asRecord(root.description) ?? {};
  const people = contributors(description);
  const date = eventDate(description);
  const subjects = records(description.subject)
    .map(cocinaValue)
    .filter((value): value is string => !!value);
  const forms = records(description.form)
    .map(cocinaValue)
    .filter((value): value is string => !!value && !value.includes('/'));
  const services = manifestImageServices(manifest);
  const href = `https://purl.stanford.edu/${purlId}`;
  const access = asRecord(root.access);

  return {
    id: purlId,
    title:
      records(description.title).map(cocinaValue).find(Boolean) ??
      str(root.label) ??
      `Stanford object ${purlId}`,
    sub: people.length > 0 ? people.slice(0, 2).join(', ') : undefined,
    date,
    tags: orUndefined([...forms, ...subjects].slice(0, 6)),
    img: iiifImage(services[0], 480),
    imgLarge: iiifImage(services[0], 1400),
    images:
      services.length > 1
        ? services.slice(0, 24).map((service) => iiifImage(service, 240) as string)
        : undefined,
    href,
    source: 'Stanford',
    raw: cocina,
    year: parseYear(date),
    kind: forms[0],
    people: orUndefined(people.map((person) => person.replace(/\s*\([^)]*\)$/, ''))),
    description: truncate(
      noteOfType(description, 'abstract') ?? noteOfType(description, 'summary'),
      900,
    ),
    manifest: `${href}/iiif/manifest`,
    fields: fieldList([
      ['Contributor', orUndefined(people)?.join('; ')],
      ['Date', date],
      ['Form', orUndefined(forms)?.join('; ')],
      ['Subject', orUndefined(subjects)?.join('; ')],
      ['Images', services.length > 0 ? String(services.length) : undefined],
      ['Access', str(access?.view)],
      ['Use and reproduction', truncate(str(access?.useAndReproductionStatement), 300)],
      ['Druid', str(root.externalIdentifier)],
    ]),
    links: [{ label: 'IIIF manifest', href: `${href}/iiif/manifest` }],
  };
};
