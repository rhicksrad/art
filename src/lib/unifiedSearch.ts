import { fetchJSON, fetchText, HttpError } from './http';
import { toItemCards as harvardToCards } from '../adapters/harvard';
import { toItemCards as princetonToCards } from '../adapters/princeton';
import { toItemCards as dataverseToCards } from '../adapters/dataverse';
import { toItemCards as ubcToCards } from '../adapters/ubc';
import { toItemCards as arxivToCards } from '../adapters/arxiv';
import { northwesternSearch } from '../adapters/northwestern';
import { hathiSearchById, type HathiIdType } from '../adapters/hathiCatalog';
import { stanfordLookupPurl, normalizePurlId } from '../adapters/stanford';
import { htrcLookup } from '../adapters/htrc';
import { leipzigCollection } from '../adapters/leipzig';
import { bernCollection } from '../adapters/bern';
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

const searchNorthwestern = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  return northwesternSearch(q, ensureLimit(limit), { signal });
};

const detectHathiIdentifier = (q: string): { type: HathiIdType; id: string } | null => {
  const trimmed = q.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const prefixMatch = lower.match(/^(oclc|isbn|lccn|htid)[:=](.+)$/i);
  if (prefixMatch) {
    return { type: prefixMatch[1].toLowerCase() as HathiIdType, id: prefixMatch[2].trim() };
  }
  if (lower.startsWith('ocn') || lower.startsWith('ocm')) {
    return { type: 'oclc', id: trimmed };
  }
  if (/^[0-9]+$/.test(trimmed)) {
    return { type: 'oclc', id: trimmed };
  }
  if (trimmed.includes('.')) {
    return { type: 'htid', id: trimmed };
  }
  return { type: 'oclc', id: trimmed };
};

const searchHathi = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const identifier = detectHathiIdentifier(q);
  if (!identifier) {
    return [];
  }
  const cards = await hathiSearchById(identifier.type, identifier.id, { signal });
  return cards.slice(0, ensureLimit(limit));
};

const searchStanford = async (q: string, _limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const purlId = normalizePurlId(q);
  if (!purlId) {
    return [];
  }
  const card = await stanfordLookupPurl(purlId, { signal });
  return card ? [card] : [];
};

const searchHtrc = async (q: string, _limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  const query = q.trim();
  if (!query || !/[.:]/.test(query)) {
    return [];
  }
  const card = await htrcLookup(query, { signal });
  return card ? [card] : [];
};

const shouldUseIiif = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.startsWith('http') || trimmed.includes('/') || trimmed.endsWith('.json');
};

const searchLeipzig = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  if (!shouldUseIiif(q)) {
    return [];
  }
  const cards = await leipzigCollection(q, { signal });
  return cards.slice(0, ensureLimit(limit));
};

const searchBern = async (q: string, limit: number, signal: AbortSignal): Promise<ItemCard[]> => {
  if (!shouldUseIiif(q)) {
    return [];
  }
  const cards = await bernCollection(q, { signal });
  return cards.slice(0, ensureLimit(limit));
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
    key: 'Northwestern',
    label: 'Northwestern Digital Collections',
    typeLabel: 'Collections',
    description: 'Works, posters, and recordings via api.dc.library.northwestern.edu.',
    search: searchNorthwestern,
    supportsImages: true,
  },
  {
    key: 'HathiCatalog',
    label: 'HathiTrust Catalog',
    typeLabel: 'Identifier search',
    description: 'Enter an OCLC/ISBN/LCCN/HTID to resolve cataloged volumes.',
    search: searchHathi,
    defaultEnabled: false,
  },
  {
    key: 'Stanford',
    label: 'Stanford PURL',
    typeLabel: 'PURL lookup',
    description: 'Paste an 11-character Stanford PURL id (e.g. bb112zx3193).',
    search: searchStanford,
    defaultEnabled: false,
    supportsImages: true,
  },
  {
    key: 'HTRC',
    label: 'HTRC Analytics',
    typeLabel: 'HTID lookup',
    description: 'HathiTrust Research Center volume metadata by HTID.',
    search: searchHtrc,
    defaultEnabled: false,
  },
  {
    key: 'LeipzigIIIF',
    label: 'Leipzig IIIF',
    typeLabel: 'IIIF manifests',
    description: 'Paste a iiif.ub.uni-leipzig.de manifest or collection path.',
    search: searchLeipzig,
    defaultEnabled: false,
    supportsImages: true,
  },
  {
    key: 'BernIIIF',
    label: 'Bern IIIF',
    typeLabel: 'IIIF manifests',
    description: 'Paste a iiif.ub.unibe.ch manifest or collection path.',
    search: searchBern,
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
