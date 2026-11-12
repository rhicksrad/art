import {
  buildSearchQuery,
  toItemCards as arxivCards,
  totalResults as arxivTotal,
} from '../adapters/arxiv';
import { toItemCards as dataverseCards, totalCount as dataverseTotal } from '../adapters/dataverse';
import { toItemCards as harvardCards, totalRecords as harvardTotal } from '../adapters/harvard';
import { detectHathiIdentifier, hathiPath, toItemCards as hathiCards } from '../adapters/hathi';
import { looksLikeHtid, toItemCard as htrcCard } from '../adapters/htrc';
import { iiifResourceToCards } from '../adapters/iiif';
import {
  toItemCards as northwesternCards,
  totalHits as northwesternTotal,
} from '../adapters/northwestern';
import { toItemCards as princetonCards, totalHits as princetonTotal } from '../adapters/princeton';
import { normalizePurlId, toItemCard as stanfordCard } from '../adapters/stanford';
import { extractTotal as ubcTotal, toItemCards as ubcCards } from '../adapters/ubc';
import { fetchJSON, fetchText, HttpError, workerUrl, type QueryParams } from '../lib/http';
import type { ItemCard, SourceKey } from '../lib/types';

export type SourceGroup = 'Museums' | 'Libraries & archives' | 'Research';

export type ControlOption = { value: string; label: string };

export type SourceControl = {
  name: string;
  label: string;
  /** `color` is set from a palette swatch and shown as a removable chip. */
  type: 'select' | 'checkbox' | 'color';
  default: string;
  options?: ControlOption[];
  loadOptions?: () => Promise<ControlOption[]>;
};

export type SearchRequest = {
  q: string;
  /** 1-based page. */
  page: number;
  size: number;
  signal?: AbortSignal;
  opts?: Record<string, string>;
};

export type SearchPage = {
  items: ItemCard[];
  total?: number;
  hasMore: boolean;
  /** Worker URLs that produced this page, shown to the user for transparency. */
  requests: string[];
};

export type SourceDefinition = {
  key: SourceKey;
  slug: string;
  label: string;
  short: string;
  group: SourceGroup;
  /** Route of the dedicated explorer page. */
  page: string;
  blurb: string;
  holds: string;
  /** `keyword` sources accept free text; `identifier` sources resolve one specific id or path. */
  mode: 'keyword' | 'identifier';
  placeholder: string;
  samples: string[];
  /** Run the first sample automatically when the explorer opens without a query. */
  autoSample: boolean;
  layout: 'gallery' | 'list';
  endpoint: string;
  upstream: string;
  controls?: SourceControl[];
  /** For identifier sources: null when the query is usable, otherwise a hint for the user. */
  accepts?: (q: string) => string | null;
  search: (request: SearchRequest) => Promise<SearchPage>;
  /** Size of the whole collection, for the live counters on the home page. */
  count?: () => Promise<number | undefined>;
  countNoun?: string;
};

const call = async <T>(
  path: string,
  params: QueryParams,
  signal?: AbortSignal,
): Promise<{ data: T; url: string }> => {
  const url = workerUrl(path, params).toString();
  const data = await fetchJSON<T>(path, params, { signal });
  return { data, url };
};

const pageOf = (
  items: ItemCard[],
  total: number | undefined,
  request: SearchRequest,
  url: string,
): SearchPage => ({
  items,
  total,
  hasMore:
    total !== undefined
      ? request.page * request.size < total
      : items.length >= request.size && items.length > 0,
  requests: [url],
});

const single = (items: ItemCard[], urls: string[]): SearchPage => ({
  items,
  total: items.length,
  hasMore: false,
  requests: urls,
});

/* ----------------------------- UBC collection ---------------------------- */

const UBC_INDEX_KEY = 'ubcIndex';
const UBC_DEFAULT_INDEX = 'calendars';

export const getUbcIndex = (): string => {
  try {
    return window.localStorage.getItem(UBC_INDEX_KEY)?.trim() || UBC_DEFAULT_INDEX;
  } catch {
    return UBC_DEFAULT_INDEX;
  }
};

const setUbcIndex = (value: string): void => {
  try {
    window.localStorage.setItem(UBC_INDEX_KEY, value);
  } catch {
    // Storage may be unavailable (private mode); the default still works.
  }
};

/** `/ubc/collections` returns `{ data: { "930": "aaah", … } }` mixing numeric ids and string slugs. */
const loadUbcCollections = async (): Promise<ControlOption[]> => {
  const response = await fetchJSON<{ data?: Record<string, unknown> }>('/ubc/collections', {
    ttl: 86400,
  });
  const slugs = Object.values(response?.data ?? {})
    .filter((value): value is string => typeof value === 'string' && /^[a-z]/i.test(value))
    .sort((a, b) => a.localeCompare(b));
  return Array.from(new Set(slugs)).map((slug) => ({ value: slug, label: slug }));
};

/* -------------------------------- IIIF paths ------------------------------ */

const iiifPath = (input: string, host: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.hostname === host ? url.pathname + url.search : null;
    } catch {
      return null;
    }
  }
  return trimmed.startsWith('/') && !/\s/.test(trimmed) ? trimmed : null;
};

const iiifSource = (
  key: 'LeipzigIIIF' | 'BernIIIF',
  prefix: string,
  host: string,
): Pick<SourceDefinition, 'accepts' | 'search'> => ({
  accepts: (q) =>
    iiifPath(q, host)
      ? null
      : `Paste a manifest or collection URL from ${host}, or a path starting with “/”.`,
  search: async ({ q, signal }) => {
    const path = iiifPath(q, host);
    if (!path) return single([], []);
    const { data, url } = await call<unknown>(`${prefix}${path}`, undefined, signal);
    return single(iiifResourceToCards(data, key), [url]);
  },
});

/* --------------------------------- Sources -------------------------------- */

const HARVARD_CLASSIFICATIONS = [
  'Paintings',
  'Prints',
  'Drawings',
  'Photographs',
  'Sculpture',
  'Coins',
  'Vessels',
  'Textile Arts',
  'Manuscripts',
  'Jewelry',
];

export const SOURCES: SourceDefinition[] = [
  {
    key: 'Harvard',
    slug: 'harvard',
    label: 'Harvard Art Museums',
    short: 'Harvard',
    group: 'Museums',
    page: '/harvard.html',
    blurb:
      'A quarter-million objects from the Fogg, Busch-Reisinger and Sackler collections, with makers, cultures and extracted colour palettes.',
    holds: 'Art objects',
    mode: 'keyword',
    placeholder: 'landscape, Hokusai, bronze…',
    samples: ['landscape', 'Hokusai', 'self-portrait', 'bronze vessel'],
    autoSample: true,
    layout: 'gallery',
    endpoint: '/harvard-art/object',
    upstream: 'api.harvardartmuseums.org',
    controls: [
      {
        name: 'classification',
        label: 'Classification',
        type: 'select',
        default: '',
        options: [
          { value: '', label: 'Any classification' },
          ...HARVARD_CLASSIFICATIONS.map((c) => ({ value: c, label: c })),
        ],
      },
      { name: 'hasimage', label: 'With images only', type: 'checkbox', default: '1' },
      { name: 'color', label: 'Colour', type: 'color', default: '' },
    ],
    countNoun: 'objects',
    count: async () =>
      harvardTotal(await fetchJSON('/harvard-art/object', { size: 1, fields: 'id', ttl: 86400 })),
    search: async (request) => {
      const { q, page, size, signal, opts } = request;
      const { data, url } = await call<unknown>(
        '/harvard-art/object',
        {
          q: q.trim() || undefined,
          size,
          page,
          classification: opts?.classification || undefined,
          hasimage: opts?.hasimage === '0' ? undefined : 1,
          // Exact match against the quantised palette Harvard extracts from each image.
          color: opts?.color || undefined,
        },
        signal,
      );
      return pageOf(harvardCards(data), harvardTotal(data), request, url);
    },
  },
  {
    key: 'Princeton',
    slug: 'princeton',
    label: 'Princeton University Art Museum',
    short: 'Princeton',
    group: 'Museums',
    page: '/princeton.html',
    blurb: 'Open collection search across the museum’s holdings, served with IIIF imagery.',
    holds: 'Art objects',
    mode: 'keyword',
    placeholder: 'monet, etching, haystack…',
    samples: ['landscape', 'monet', 'etching', 'photograph'],
    autoSample: true,
    layout: 'gallery',
    endpoint: '/princeton-art/search',
    upstream: 'data.artmuseum.princeton.edu',
    countNoun: 'objects',
    count: async () =>
      princetonTotal(
        await fetchJSON('/princeton-art/search', {
          q: '*',
          type: 'artobjects',
          size: 1,
          ttl: 86400,
        }),
      ),
    search: async (request) => {
      const { q, page, size, signal } = request;
      const { data, url } = await call<unknown>(
        '/princeton-art/search',
        { q: q.trim(), type: 'artobjects', size, from: (page - 1) * size || undefined },
        signal,
      );
      return pageOf(princetonCards(data), princetonTotal(data), request, url);
    },
  },
  {
    key: 'Northwestern',
    slug: 'northwestern',
    label: 'Northwestern Digital Collections',
    short: 'Northwestern',
    group: 'Libraries & archives',
    page: '/northwestern.html',
    blurb:
      'Posters, photographs, maps and recordings from Northwestern University Libraries, including the Herskovits Library of African Studies.',
    holds: 'Works & images',
    mode: 'keyword',
    placeholder: 'poster, jazz, Ghana…',
    samples: ['poster', 'jazz', 'map', 'World War'],
    autoSample: true,
    layout: 'gallery',
    endpoint: '/northwestern/api/v2/search',
    upstream: 'api.dc.library.northwestern.edu',
    controls: [{ name: 'public', label: 'Publicly viewable only', type: 'checkbox', default: '1' }],
    countNoun: 'works',
    count: async () =>
      northwesternTotal(await fetchJSON('/northwestern/api/v2/search', { size: 1, ttl: 86400 })),
    search: async (request) => {
      const { q, page, size, signal, opts } = request;
      const term = q.trim();
      const publicOnly = opts?.public !== '0';
      // The API reads `query` (a query string); `q` is silently ignored and returns the whole catalogue.
      const query = [term ? `(${term})` : '', publicOnly ? 'visibility:Public' : '']
        .filter(Boolean)
        .join(' AND ');
      const { data, url } = await call<unknown>(
        '/northwestern/api/v2/search',
        { query: query || undefined, size, page: page > 1 ? page : undefined },
        signal,
      );
      return pageOf(northwesternCards(data), northwesternTotal(data), request, url);
    },
  },
  {
    key: 'UBC',
    slug: 'ubc',
    label: 'UBC Open Collections',
    short: 'UBC',
    group: 'Libraries & archives',
    page: '/ubc.html',
    blurb:
      'Digitised newspapers, photographs, theses and calendars from the University of British Columbia, searched one collection at a time.',
    holds: 'Collection items',
    mode: 'keyword',
    placeholder: 'newspaper, forestry, Vancouver…',
    samples: ['newspaper', 'Vancouver', 'forestry'],
    autoSample: true,
    layout: 'gallery',
    endpoint: '/ubc/search/8.5',
    upstream: 'oc-index.library.ubc.ca',
    controls: [
      {
        name: 'index',
        label: 'Collection',
        type: 'select',
        default: UBC_DEFAULT_INDEX,
        options: [{ value: UBC_DEFAULT_INDEX, label: UBC_DEFAULT_INDEX }],
        loadOptions: loadUbcCollections,
      },
    ],
    search: async (request) => {
      const { q, page, size, signal, opts } = request;
      const index = opts?.index || getUbcIndex();
      if (opts?.index) setUbcIndex(opts.index);
      const { data, url } = await call<unknown>(
        '/ubc/search/8.5',
        { index, q: q.trim() || undefined, size, from: (page - 1) * size || undefined },
        signal,
      );
      return pageOf(ubcCards(data), ubcTotal(data), request, url);
    },
  },
  {
    key: 'Stanford',
    slug: 'stanford',
    label: 'Stanford Digital Repository',
    short: 'Stanford',
    group: 'Libraries & archives',
    page: '/stanford.html',
    blurb:
      'Resolve any Stanford PURL to its full descriptive record and every page image in its IIIF manifest.',
    holds: 'PURL lookup',
    mode: 'identifier',
    placeholder: 'bb112zx3193 or a purl.stanford.edu link',
    samples: ['bb112zx3193'],
    autoSample: true,
    layout: 'gallery',
    endpoint: '/stanford-purl/{druid}.json',
    upstream: 'purl.stanford.edu',
    accepts: (q) =>
      normalizePurlId(q) ? null : 'Enter an 11-character Stanford druid such as bb112zx3193.',
    search: async ({ q, signal }) => {
      const id = normalizePurlId(q);
      if (!id) return single([], []);
      const cocinaPath = `/stanford-purl/${id}.json`;
      const manifestPath = `/stanford-purl/${id}/iiif/manifest`;
      const [cocina, manifest] = await Promise.all([
        fetchJSON<unknown>(cocinaPath, undefined, { signal }),
        // Not every object has images; the descriptive record alone is still worth showing.
        fetchJSON<unknown>(manifestPath, undefined, { signal }).catch((error: unknown) => {
          if (error instanceof HttpError && error.status >= 400) return undefined;
          throw error;
        }),
      ]);
      return single(
        [stanfordCard(id, cocina, manifest)],
        [workerUrl(cocinaPath).toString(), workerUrl(manifestPath).toString()],
      );
    },
  },
  {
    key: 'HathiCatalog',
    slug: 'hathi',
    label: 'HathiTrust Catalog',
    short: 'HathiTrust',
    group: 'Libraries & archives',
    page: '/hathi.html',
    blurb:
      'Find every digitised copy of a book from its OCLC number, ISBN, LCCN or HathiTrust volume id.',
    holds: 'Identifier lookup',
    mode: 'identifier',
    placeholder: 'oclc:424023, isbn:9780030110405, mdp.39015025315527',
    samples: ['oclc:424023', 'isbn:9780030110405', 'mdp.39015025315527'],
    autoSample: true,
    layout: 'list',
    endpoint: '/hathi-catalog/api/volumes/full/{type}/{id}.json',
    upstream: 'catalog.hathitrust.org',
    accepts: (q) =>
      detectHathiIdentifier(q)
        ? null
        : 'Enter an identifier such as oclc:424023, isbn:9780030110405 or an HTID like mdp.39015025315527.',
    search: async ({ q, signal }) => {
      const identifier = detectHathiIdentifier(q);
      if (!identifier) return single([], []);
      const { data, url } = await call<unknown>(
        hathiPath(identifier.type, identifier.id),
        undefined,
        signal,
      );
      return single(hathiCards(data), [url]);
    },
  },
  {
    key: 'LeipzigIIIF',
    slug: 'leipzig',
    label: 'Leipzig University Library IIIF',
    short: 'Leipzig',
    group: 'Libraries & archives',
    page: '/leipzig.html',
    blurb: 'Read IIIF manifests and collections published by Universitätsbibliothek Leipzig.',
    holds: 'IIIF manifests',
    mode: 'identifier',
    placeholder: '/0000000001/manifest.json',
    samples: ['/0000000001/manifest.json'],
    autoSample: false,
    layout: 'gallery',
    endpoint: '/leipzig-iiif/{path}',
    upstream: 'iiif.ub.uni-leipzig.de',
    ...iiifSource('LeipzigIIIF', '/leipzig-iiif', 'iiif.ub.uni-leipzig.de'),
  },
  {
    key: 'BernIIIF',
    slug: 'bern',
    label: 'Bern University Library IIIF',
    short: 'Bern',
    group: 'Libraries & archives',
    page: '/bern.html',
    blurb: 'Read IIIF manifests and collections published by Universitätsbibliothek Bern.',
    holds: 'IIIF manifests',
    mode: 'identifier',
    placeholder: 'A manifest path or URL from iiif.ub.unibe.ch',
    samples: [],
    autoSample: false,
    layout: 'gallery',
    endpoint: '/bern-iiif/{path}',
    upstream: 'iiif.ub.unibe.ch',
    ...iiifSource('BernIIIF', '/bern-iiif', 'iiif.ub.unibe.ch'),
  },
  {
    key: 'arXiv',
    slug: 'arxiv',
    label: 'arXiv',
    short: 'arXiv',
    group: 'Research',
    page: '/arxiv.html',
    blurb:
      'Preprints on computational art history, cultural heritage imaging and everything else on arXiv.',
    holds: 'Preprints',
    mode: 'keyword',
    placeholder: 'cultural heritage, cat:cs.CV, au:Hinton…',
    samples: ['cultural heritage', 'museum', 'style transfer painting', 'cat:cs.DL'],
    autoSample: true,
    layout: 'list',
    endpoint: '/arxiv/search',
    upstream: 'export.arxiv.org',
    controls: [
      {
        name: 'sortBy',
        label: 'Sort by',
        type: 'select',
        default: 'relevance',
        options: [
          { value: 'relevance', label: 'Relevance' },
          { value: 'submittedDate', label: 'Newest submitted' },
          { value: 'lastUpdatedDate', label: 'Recently updated' },
        ],
      },
    ],
    search: async (request) => {
      const { q, page, size, signal, opts } = request;
      const params = {
        search_query: buildSearchQuery(q),
        start: (page - 1) * size,
        max_results: size,
        sortBy: opts?.sortBy || 'relevance',
        sortOrder: 'descending',
      };
      const url = workerUrl('/arxiv/search', params).toString();
      const xml = await fetchText('/arxiv/search', params, undefined, { signal });
      return pageOf(arxivCards(xml), arxivTotal(xml), request, url);
    },
  },
  {
    key: 'Dataverse',
    slug: 'dataverse',
    label: 'Harvard Dataverse',
    short: 'Dataverse',
    group: 'Research',
    page: '/dataverse.html',
    blurb: 'Published research datasets with authors, subjects and citations.',
    holds: 'Datasets',
    mode: 'keyword',
    placeholder: 'museum attendance, art market…',
    samples: ['museum', 'art history', 'cultural heritage'],
    autoSample: true,
    layout: 'list',
    endpoint: '/dataverse/search',
    upstream: 'dataverse.harvard.edu',
    countNoun: 'datasets',
    count: async () =>
      dataverseTotal(
        await fetchJSON('/dataverse/search', { q: '*', type: 'dataset', per_page: 1, ttl: 86400 }),
      ),
    controls: [
      {
        name: 'type',
        label: 'Result type',
        type: 'select',
        default: 'dataset',
        options: [
          { value: 'dataset', label: 'Datasets' },
          { value: 'file', label: 'Files' },
          { value: 'dataverse', label: 'Collections' },
        ],
      },
    ],
    search: async (request) => {
      const { q, page, size, signal, opts } = request;
      const { data, url } = await call<unknown>(
        '/dataverse/search',
        {
          q: q.trim() || '*',
          type: opts?.type || 'dataset',
          per_page: size,
          start: (page - 1) * size || undefined,
        },
        signal,
      );
      return pageOf(dataverseCards(data), dataverseTotal(data), request, url);
    },
  },
  {
    key: 'HTRC',
    slug: 'htrc',
    label: 'HathiTrust Research Center',
    short: 'HTRC',
    group: 'Research',
    page: '/htrc.html',
    blurb: 'Volume-level metadata from HTRC Analytics, looked up by HathiTrust volume id.',
    holds: 'Volume metadata',
    mode: 'identifier',
    placeholder: 'mdp.39015025315527',
    samples: ['mdp.39015025315527'],
    autoSample: false,
    layout: 'list',
    endpoint: '/htrc/api/metadata/volume/{htid}',
    upstream: 'analytics.hathitrust.org',
    accepts: (q) =>
      looksLikeHtid(q) ? null : 'Enter a HathiTrust volume id such as mdp.39015025315527.',
    search: async ({ q, signal }) => {
      const id = q.trim();
      if (!looksLikeHtid(id)) return single([], []);
      const { data, url } = await call<unknown>(
        `/htrc/api/metadata/volume/${encodeURIComponent(id)}`,
        undefined,
        signal,
      );
      return single([htrcCard(id, data)], [url]);
    },
  },
];

export const SOURCE_GROUPS: SourceGroup[] = ['Museums', 'Libraries & archives', 'Research'];

export const sourceByKey = (key: SourceKey): SourceDefinition => {
  const source = SOURCES.find((entry) => entry.key === key);
  if (!source) throw new Error(`Unknown source: ${key}`);
  return source;
};

export const sourceBySlug = (slug: string): SourceDefinition | undefined =>
  SOURCES.find((entry) => entry.slug === slug);

/** Whether a source should take part in a unified search for this query. */
export const sourceAccepts = (source: SourceDefinition, q: string): boolean =>
  source.mode === 'keyword'
    ? !source.accepts || source.accepts(q) === null
    : source.accepts?.(q) === null;
