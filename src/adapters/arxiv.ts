import type { ItemCard } from '../lib/types';

const TRUNCATE_LENGTH = 280;

const normalizeWhitespace = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : undefined;
};

const truncate = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.length <= TRUNCATE_LENGTH) {
    return value;
  }
  return `${value.slice(0, TRUNCATE_LENGTH - 1).trimEnd()}…`;
};

const getFirstText = (element: Element | null, selector: string): string | undefined => {
  if (!element) return undefined;
  return normalizeWhitespace(element.querySelector(selector)?.textContent);
};

const getAuthors = (entry: Element): string[] => {
  return Array.from(entry.querySelectorAll('author > name'))
    .map((node) => normalizeWhitespace(node.textContent))
    .filter((name): name is string => !!name);
};

const getHref = (entry: Element): string | undefined => {
  const preferred = entry.querySelector("link[rel='alternate']");
  const fallback = entry.querySelector('link[href]');
  const href = preferred?.getAttribute('href') ?? fallback?.getAttribute('href') ?? undefined;
  return href && href.trim().length > 0 ? href.trim() : undefined;
};

const getCategories = (entry: Element): string[] => {
  return Array.from(entry.querySelectorAll('category'))
    .map((category) => category.getAttribute('term') ?? category.getAttribute('label') ?? undefined)
    .map((value) => (value ? value.trim() : undefined))
    .filter((value): value is string => !!value && value.length > 0);
};

export const toItemCards = (atomXml: string): ItemCard[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(atomXml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid arXiv feed');
  }

  const entries = Array.from(doc.querySelectorAll('entry'));

  return entries.map((entry, index) => {
    const title =
      normalizeWhitespace(entry.querySelector('title')?.textContent) ?? `arXiv entry #${index + 1}`;
    const summary = truncate(normalizeWhitespace(entry.querySelector('summary')?.textContent));
    const authors = getAuthors(entry);
    const date = getFirstText(entry, 'published') ?? getFirstText(entry, 'updated');
    const href = getHref(entry) ?? normalizeWhitespace(entry.querySelector('id')?.textContent);
    const id =
      normalizeWhitespace(entry.querySelector('id')?.textContent) ?? href ?? `arxiv-${index}`;
    const tags = authors.length > 0 ? authors : getCategories(entry);

    return {
      id,
      title,
      sub: summary,
      date,
      tags: tags.length > 0 ? tags : undefined,
      href,
      source: 'arXiv',
      raw: entry,
    };
  });
};
