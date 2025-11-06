import type { ItemCard } from '../lib/types';

const textContent = (element: Element | null): string | undefined => {
  if (!element) {
    return undefined;
  }
  const value = element.textContent ?? '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const collectAuthors = (entry: Element): string | undefined => {
  const names: string[] = [];
  entry.querySelectorAll('author > name').forEach((author) => {
    const name = textContent(author);
    if (name) {
      names.push(name);
    }
  });
  return names.length > 0 ? names.join(', ') : undefined;
};

const collectTags = (entry: Element): string[] => {
  const tags: string[] = [];
  entry.querySelectorAll('category').forEach((category) => {
    const term = category.getAttribute('term');
    if (term && term.trim()) {
      tags.push(term.trim());
    }
  });
  return tags;
};

const serializeEntry = (entry: Element): string => {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(entry);
};

export const toItemCards = (atomXml: string): ItemCard[] => {
  const parser = new DOMParser();
  const document = parser.parseFromString(atomXml, 'application/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('Failed to parse arXiv Atom feed');
  }

  const entries = Array.from(document.getElementsByTagName('entry'));
  return entries.map((entry) => {
    const id =
      textContent(entry.querySelector('id')) ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `arxiv-${Math.random().toString(36).slice(2)}`);
    const title = textContent(entry.querySelector('title')) ?? 'Untitled';
    const date = textContent(entry.querySelector('updated')) ?? textContent(entry.querySelector('published'));
    const href = entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ?? textContent(entry.querySelector('id'));
    const sub = collectAuthors(entry);
    const tags = collectTags(entry);

    return {
      id,
      title,
      sub,
      date,
      tags: tags.length > 0 ? tags : undefined,
      href: href ?? undefined,
      source: 'arXiv',
      raw: serializeEntry(entry),
    };
  });
};
