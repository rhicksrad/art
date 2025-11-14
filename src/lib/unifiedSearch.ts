import { fetchJSON, fetchText, HttpError } from './http';
import { toItemCards as harvardToCards } from '../adapters/harvard';
import { toItemCards as princetonToCards } from '../adapters/princeton';
import { toItemCards as dataverseToCards } from '../adapters/dataverse';
import { toItemCards as ubcToCards } from '../adapters/ubc';
import { toItemCards as arxivToCards } from '../adapters/arxiv';
import { toItemCards as yaleToCards } from '../adapters/yale';
import type { ItemCard } from './types';
import { searchUbc } from './ubc';

const ensureLimit = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
};

const normalizeQuery = (value: string): string => value.trim();

const searchHarvard = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = normalizeQuery(q);
  if (!query) {
    return [];
  }
  const resp = await fetchJSON('/harvard-art/object', { q: query, size: ensureLimit(limit) }, { signal });
  return harvardToCards(resp);
};

const searchPrinceton = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = normalizeQuery(q);
  if (!query) {
    return [];
  }
  const resp = await fetchJSON(
    '/princeton-art/search',
    { q: query, type: 'artobjects', size: ensureLimit(limit) },
    { signal },
  );
  return princetonToCards(resp);
};

const searchDataverse = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = normalizeQuery(q);
  if (!query) {
    return [];
  }
  const resp = await fetchJSON('/dataverse/search', { q: query, type: 'dataset', per_page: ensureLimit(limit) }, { signal });
  return dataverseToCards(resp);
};

const searchUbcCards = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = normalizeQuery(q);
  if (!query) {
    return [];
  }
  const resp = await searchUbc(query, { size: ensureLimit(limit) }, { signal });
  return ubcToCards(resp);
};

const searchArxiv = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = normalizeQuery(q);
  if (!query) {
    return [];
  }
  const text = await fetchText(
    '/arxiv/search',
    { search_query: query, max_results: ensureLimit(limit) },
    undefined,
    { signal },
  );
  return arxivToCards(text);
};

const searchYale = async (value: string, _limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const trimmed = normalizeQuery(value);
  if (!/^https?:/i.test(trimmed)) {
    return [];
  }
  const manifest = await fetchJSON('/yale-iiif', { url: trimmed }, { signal });
  return yaleToCards(manifest);
};

export type UnifiedSource = ItemCard['source'];

export type UnifiedSourceDefinition = {
  key: UnifiedSource;
  label: string;
  typeLabel: string;
  defaultEnabled?: boolean;
  supportsImages?: boolean;
  description: string;
  search: (q: string, limit: number, signal: AbortSignal) => Promise<ItemCard[]>;
};

export const SOURCE_DEFINITIONS: UnifiedSourceDefinition[] = [
  {
    key: 'Harvard',
    label: 'Harvard Art Museums',
    typeLabel: 'Art objects',
    description: 'Objects, people, and color data with IIIF links.',
    search: searchHarvard,
    supportsImages: true,
  },
  {
    key: 'Princeton',
    label: 'Princeton University Art Museum',
    typeLabel: 'Art objects',
    description: 'Linked Art search surface for makers and media.',
    search: searchPrinceton,
    supportsImages: true,
  },
  {
    key: 'Dataverse',
    label: 'Harvard Dataverse',
    typeLabel: 'Datasets',
    description: 'Research datasets, keywords, and publication info.',
    search: searchDataverse,
  },
  {
    key: 'UBC',
    label: 'UBC Open Collections',
    typeLabel: 'Collections & items',
    description: 'Elasticsearch-backed collections with IIIF previews.',
    search: searchUbcCards,
    supportsImages: true,
  },
  {
    key: 'arXiv',
    label: 'arXiv',
    typeLabel: 'Papers',
    description: 'Atom feed for art-adjacent research output.',
    search: searchArxiv,
  },
  {
    key: 'Yale',
    label: 'Yale / IIIF manifests',
    typeLabel: 'Canvases',
    description: 'Paste a manifest URL to list canvases and imagery.',
    search: searchYale,
    defaultEnabled: false,
    supportsImages: true,
  },
];

export const findSourceDefinition = (key: UnifiedSource): UnifiedSourceDefinition => {
  const def = SOURCE_DEFINITIONS.find((entry) => entry.key === key);
  if (!def) {
    throw new HttpError(`Unknown source: ${key}`, { status: 400, url: key });
  }
  return def;
};
