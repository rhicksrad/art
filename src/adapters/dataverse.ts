import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import {
  asRecord,
  fieldList,
  orUndefined,
  str,
  strings,
  stripHtml,
  truncate,
  unique,
  type Rec,
} from './util';

const KIND: Record<string, string> = { dataset: 'Dataset', file: 'File', dataverse: 'Collection' };

const toItemCard = (item: Rec): ItemCard => {
  const type = str(item.type);
  const authors = strings(item.authors);
  const subjects = strings(item.subjects);
  const keywords = strings(item.keywords);
  const published =
    str(item.published_at) ?? str(item.release_time) ?? str(item.createdAt) ?? str(item.created_at);
  const collection = str(item.name_of_dataverse);
  const fileCount = typeof item.fileCount === 'number' ? `${item.fileCount}` : undefined;

  return {
    id:
      str(item.global_id) ??
      str(item.persistentId) ??
      str(item.file_persistent_id) ??
      str(item.identifier) ??
      str(item.file_id) ??
      `dataverse-${Math.random().toString(36).slice(2)}`,
    title: str(item.name) ?? str(item.title) ?? 'Untitled',
    sub:
      authors.length > 0
        ? authors.slice(0, 3).join('; ') + (authors.length > 3 ? ' et al.' : '')
        : (collection ?? type),
    date: published ? published.slice(0, 10) : undefined,
    tags: orUndefined(unique([...subjects, ...keywords]).slice(0, 6)),
    href: str(item.url) ?? str(item.landingPage) ?? str(item.html_url),
    source: 'Dataverse',
    raw: item,
    year: parseYear(published),
    kind: (type && KIND[type]) ?? type,
    people: orUndefined(authors),
    description: truncate(stripHtml(str(item.description)), 900),
    fields: fieldList([
      ['Authors', orUndefined(authors)?.join('; ')],
      ['Published', published?.slice(0, 10)],
      ['Collection', collection],
      ['Publisher', str(item.publisher)],
      ['Subjects', orUndefined(subjects)?.join('; ')],
      ['Keywords', orUndefined(keywords)?.join('; ')],
      ['Files', fileCount],
      ['Persistent ID', str(item.global_id)],
      ['Citation', stripHtml(str(item.citation))],
    ]),
  };
};

const dataOf = (resp: unknown): Rec | null => asRecord(asRecord(resp)?.data);

export const toItemCards = (resp: unknown): ItemCard[] => {
  const items = dataOf(resp)?.items;
  return Array.isArray(items)
    ? items
        .map(asRecord)
        .filter((i): i is Rec => i !== null)
        .map(toItemCard)
    : [];
};

export const totalCount = (resp: unknown): number | undefined => {
  const total = dataOf(resp)?.total_count;
  return typeof total === 'number' ? total : undefined;
};
