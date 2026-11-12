import { parseYear } from '../lib/dates';
import type { ItemCard } from '../lib/types';
import { fieldList, orUndefined, str, truncate, unique } from './util';

const text = (element: Element | null | undefined): string | undefined =>
  str(element?.textContent ?? undefined);

const children = (parent: Element, localName: string): Element[] =>
  Array.from(parent.children).filter((child) => child.localName === localName);

const child = (parent: Element, localName: string): Element | undefined =>
  children(parent, localName)[0];

const parseFeed = (atomXml: string): Document => {
  const doc = new DOMParser().parseFromString(atomXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Failed to parse arXiv Atom feed');
  }
  return doc;
};

const entryToCard = (entry: Element): ItemCard => {
  const absUrl = text(child(entry, 'id'));
  const arxivId = absUrl?.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
  const authors = children(entry, 'author')
    .map((author) => text(child(author, 'name')))
    .filter((name): name is string => !!name);
  const categories = unique(
    children(entry, 'category')
      .map((category) => str(category.getAttribute('term')))
      .filter((term): term is string => !!term),
  );
  const primary = str(child(entry, 'primary_category')?.getAttribute('term')) ?? categories[0];
  const published = text(child(entry, 'published'));
  const updated = text(child(entry, 'updated'));
  const links = children(entry, 'link');
  const alternate = links
    .find((link) => link.getAttribute('rel') === 'alternate')
    ?.getAttribute('href');
  const pdf = links.find((link) => link.getAttribute('title') === 'pdf')?.getAttribute('href');
  const doi = text(child(entry, 'doi'));

  return {
    id: arxivId ?? absUrl ?? `arxiv-${Math.random().toString(36).slice(2)}`,
    title: text(child(entry, 'title')) ?? 'Untitled',
    sub:
      authors.length > 0
        ? authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : '')
        : undefined,
    date: (published ?? updated)?.slice(0, 10),
    tags: orUndefined(categories),
    href: alternate ?? absUrl,
    source: 'arXiv',
    raw: new XMLSerializer().serializeToString(entry),
    year: parseYear(published ?? updated),
    kind: primary,
    people: orUndefined(authors),
    description: truncate(text(child(entry, 'summary')), 1400),
    fields: fieldList([
      ['Authors', orUndefined(authors)?.join(', ')],
      ['Published', published?.slice(0, 10)],
      ['Updated', updated?.slice(0, 10)],
      ['Primary category', primary],
      ['Categories', orUndefined(categories)?.join(', ')],
      ['Comment', text(child(entry, 'comment'))],
      ['Journal reference', text(child(entry, 'journal_ref'))],
      ['DOI', doi],
      ['arXiv ID', arxivId],
    ]),
    links: pdf ? [{ label: 'PDF', href: pdf }] : undefined,
  };
};

export const toItemCards = (atomXml: string): ItemCard[] =>
  Array.from(parseFeed(atomXml).getElementsByTagName('entry')).map(entryToCard);

export const totalResults = (atomXml: string): number | undefined => {
  const node = Array.from(parseFeed(atomXml).documentElement.children).find(
    (el) => el.localName === 'totalResults',
  );
  const value = Number(node?.textContent);
  return Number.isFinite(value) && node ? value : undefined;
};

/**
 * Plain words become an all-fields AND query; anything already using arXiv
 * field syntax (`cat:cs.CV`, `au:hinton`, `ti:"…"`) is passed through untouched.
 */
export const buildSearchQuery = (input: string): string => {
  const query = input.trim();
  if (!query) return '';
  if (/\b(all|ti|au|abs|co|jr|cat|rn|id):/i.test(query)) return query;
  if (/^".*"$/.test(query)) return `all:${query}`;
  return query
    .split(/\s+/)
    .map((word) => `all:${word}`)
    .join(' AND ');
};
