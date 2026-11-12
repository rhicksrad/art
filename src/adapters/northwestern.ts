import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import {
  asRecord,
  fieldList,
  iiifImage,
  labels,
  orUndefined,
  str,
  strings,
  truncate,
  unique,
  type Rec,
} from './util';

const aspectOf = (work: Rec): number | undefined => {
  const ratio = asRecord(work.representative_file_set)?.aspect_ratio;
  return typeof ratio === 'number' && ratio > 0 ? ratio : undefined;
};

const workToCard = (work: Rec): ItemCard => {
  const collection = str(asRecord(work.collection)?.title);
  const creators = labels(work.creator);
  const contributors = labels(work.contributor, 'label_with_role');
  const subjects = labels(work.subject);
  const genres = labels(work.genre);
  const date = str(work.date_created);
  const imageBase = str(asRecord(work.representative_file_set)?.url);
  const manifest = str(work.iiif_manifest);
  const id = str(work.id) ?? `northwestern-${Math.random().toString(36).slice(2)}`;

  return {
    id,
    title: str(work.title) ?? str(work.alternate_title) ?? 'Untitled work',
    sub: creators.length > 0 ? creators.slice(0, 2).join(', ') : collection,
    date,
    tags: orUndefined(unique([...genres, ...subjects]).slice(0, 6)),
    img: iiifImage(imageBase, 480) ?? str(work.thumbnail),
    imgLarge: iiifImage(imageBase, 1400),
    aspect: aspectOf(work),
    href: str(work.canonical_link) ?? `https://dc.library.northwestern.edu/items/${id}`,
    source: 'Northwestern',
    raw: work,
    year: parseYear(str(work.date_created_start)) ?? parseYear(date),
    kind: genres[0] ?? str(work.work_type),
    people: orUndefined(creators),
    description: truncate(strings(work.description).join(' ') || str(work.abstract), 900),
    manifest,
    fields: fieldList([
      ['Creator', orUndefined(creators)?.join('; ')],
      ['Contributor', orUndefined(contributors)?.join('; ')],
      ['Date', date],
      ['Collection', collection],
      ['Work type', str(work.work_type)],
      ['Genre', orUndefined(genres)?.join('; ')],
      ['Subject', orUndefined(subjects)?.join('; ')],
      [
        'Physical description',
        [str(work.physical_description_material), str(work.physical_description_size)]
          .filter(Boolean)
          .join(', '),
      ],
      ['Library unit', str(work.library_unit)],
      ['Rights', str(asRecord(work.rights_statement)?.label)],
      ['Identifier', str(work.identifier) ?? str(work.ark)],
    ]),
    links: manifest ? [{ label: 'IIIF manifest', href: manifest }] : undefined,
  };
};

export const toItemCards = (resp: unknown): ItemCard[] => {
  const data = asRecord(resp)?.data;
  return Array.isArray(data)
    ? data
        .map(asRecord)
        .filter((w): w is Rec => w !== null)
        .map(workToCard)
    : [];
};

export const totalHits = (resp: unknown): number | undefined => {
  const total = asRecord(asRecord(resp)?.pagination)?.total_hits;
  return typeof total === 'number' ? total : undefined;
};
