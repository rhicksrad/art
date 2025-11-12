import { attr, parseXml, serializeElement, textContent } from '../atom';
import { fetchWithOfflineFallback } from '../offlineFixtures';
import { ArxivState } from './types';

export type ArxivLink = { rel: string; href: string; type?: string };

export type ArxivEntry = {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  primaryCategory?: string;
  categories: string[];
  published: string;
  updated: string;
  links: ArxivLink[];
  rawXml: string;
};

export type ArxivSearchResult = {
  items: ArxivEntry[];
  total: number;
  nextStart?: number;
};

const OPENSEARCH_NS = 'http://a9.com/-/spec/opensearch/1.1/';
const ARXIV_NS = 'http://arxiv.org/schemas/atom';

const clampPageSize = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 12;
  }
  const size = Math.floor(value);
  if (size < 5) return 5;
  if (size > 100) return 100;
  return size;
};

const normalizeStart = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const normalizeQuery = (value: string | undefined): string => {
  if (!value) return 'all:*';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'all:*';
};

const unique = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const normalizeId = (input: string): string => {
  const fromPdf = input.match(/\/pdf\/(.+?)(?:\.pdf)?$/i);
  if (fromPdf && fromPdf[1]) {
    return fromPdf[1];
  }
  const fromAbs = input.match(/\/abs\/(.+)$/i);
  if (fromAbs && fromAbs[1]) {
    return fromAbs[1];
  }
  return input;
};

const collectLinks = (entry: Element): ArxivLink[] => {
  return Array.from(entry.getElementsByTagName('link')).map((node) => ({
    rel: attr(node, 'rel') ?? '',
    href: attr(node, 'href') ?? '',
    type: attr(node, 'type'),
  }));
};

const collectAuthors = (entry: Element): string[] => {
  return Array.from(entry.getElementsByTagName('author'))
    .map((author) => textContent(author.getElementsByTagName('name')[0]))
    .filter((name): name is string => Boolean(name));
};

const collectCategories = (entry: Element): { primary?: string; categories: string[] } => {
  const categories = Array.from(entry.getElementsByTagName('category'))
    .map((category) => attr(category, 'term'))
    .filter((term): term is string => Boolean(term));
  const primary = attr(entry.getElementsByTagNameNS(ARXIV_NS, 'primary_category')[0], 'term');
  return { primary: primary ?? categories[0], categories: unique(categories) };
};

const normalizeSummary = (summary: string | undefined): string => {
  if (!summary) return '';
  return summary.replace(/\s+/g, ' ').trim();
};

export const parseAtom = (xml: string): { items: ArxivEntry[]; total: number } => {
  const doc = parseXml(xml);
  const totalNode = doc.getElementsByTagNameNS(OPENSEARCH_NS, 'totalResults')[0];
  const total = totalNode ? Number.parseInt(totalNode.textContent ?? '0', 10) || 0 : 0;

  const entries = Array.from(doc.getElementsByTagName('entry'));
  const items = entries.map((entry) => {
    const idUrl = textContent(entry.getElementsByTagName('id')[0]) ?? '';
    const id = normalizeId(idUrl);
    const { primary, categories } = collectCategories(entry);

    return {
      id,
      title: (textContent(entry.getElementsByTagName('title')[0]) ?? 'Untitled').trim(),
      authors: collectAuthors(entry),
      summary: normalizeSummary(textContent(entry.getElementsByTagName('summary')[0])),
      categories,
      primaryCategory: primary,
      published: textContent(entry.getElementsByTagName('published')[0]) ?? '',
      updated: textContent(entry.getElementsByTagName('updated')[0]) ?? '',
      links: collectLinks(entry),
      rawXml: serializeElement(entry),
    } satisfies ArxivEntry;
  });

  return { items, total };
};

const applyLocalFilters = (items: ArxivEntry[], state: ArxivState): ArxivEntry[] => {
  let result = items;

  if (state.primary_cat?.length) {
    const categories = new Set(state.primary_cat.map((value) => value.trim()).filter(Boolean));
    if (categories.size > 0) {
      result = result.filter((item) => (item.primaryCategory ? categories.has(item.primaryCategory) : false));
    }
  }

  if (state.year?.length) {
    const years = new Set(state.year.filter((value) => Number.isFinite(value)));
    if (years.size > 0) {
      result = result.filter((item) => {
        const year = Number.parseInt(item.published.slice(0, 4), 10);
        return Number.isFinite(year) && years.has(year);
      });
    }
  }

  if (state.author?.length) {
    const needles = state.author
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    if (needles.length > 0) {
      result = result.filter((item) =>
        item.authors.some((author) => {
          const hay = author.toLowerCase();
          return needles.some((needle) => hay.includes(needle));
        }),
      );
    }
  }

  return result;
};

export const searchArxiv = async (state: ArxivState, signal?: AbortSignal): Promise<ArxivSearchResult> => {
  const start = normalizeStart(state.start);
  const size = clampPageSize(state.max_results);
  const query = normalizeQuery(state.search_query);

  const params = new URLSearchParams();
  params.set('search_query', query);
  params.set('start', String(start));
  params.set('max_results', String(size));
  if (state.sortBy) params.set('sortBy', state.sortBy);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);

  const url = `https://export.arxiv.org/api/query?${params.toString()}`;

  const response = await fetchWithOfflineFallback(new URL(url), {
    signal,
    headers: {
      Accept: 'application/atom+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`arXiv request failed (${response.status})`);
  }

  const xml = await response.text();
  const { items, total } = parseAtom(xml);
  const filtered = applyLocalFilters(items, state);
  const nextStart = start + size < total ? start + size : undefined;

  return { items: filtered, total, nextStart };
};
