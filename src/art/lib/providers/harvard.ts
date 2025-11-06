import { WORKER_BASE } from '../../../lib/config';
import type { NormalArt, SearchState } from '../types';

const ENDPOINT = '/harvard-art/object';

const DEFAULT_SIZE = 30;
const AGGREGATION = JSON.stringify({
  classifications: { terms: { field: 'classification.exact', size: 100 } },
  centuries: { terms: { field: 'century', size: 150 } },
});

const FIELDS = [
  'objectid',
  'title',
  'people',
  'dated',
  'classification',
  'culture',
  'primaryimageurl',
  'images',
  'url',
  'seeAlso',
  'hasimage',
  'imagecount',
  'imagepermissionlevel',
  'copyright',
  'iiifmanifest',
  'objectnumber',
  'century',
];

type ApiImage = {
  iiifbaseuri?: string | null;
  baseimageurl?: string | null;
};

type ApiPerson = {
  displayname?: string | null;
};

type ApiSeeAlso = {
  id?: string | null;
  type?: string | null;
};

type ApiRecord = {
  objectid?: number | string | null;
  id?: number | string | null;
  title?: string | null;
  people?: ApiPerson[] | null;
  dated?: string | null;
  classification?: string | string[] | null;
  culture?: string | string[] | null;
  primaryimageurl?: string | null;
  images?: ApiImage[] | null;
  url?: string | null;
  seeAlso?: ApiSeeAlso[] | null;
  hasimage?: number | boolean | null;
  imagecount?: number | null;
  imagepermissionlevel?: number | null;
  copyright?: string | null;
  iiifmanifest?: string | null;
  objectnumber?: string | null;
  century?: string | null;
};

type AggregationBucket = { key?: string | null; doc_count?: number | null };

type Aggregations = {
  classifications?: { buckets?: AggregationBucket[] | null } | null;
  centuries?: { buckets?: AggregationBucket[] | null } | null;
};

type ApiInfo = {
  totalrecords?: number | null;
  totalrecordsperquery?: number | null;
  page?: number | null;
  pages?: number | null;
};

type ApiResponse = {
  records?: ApiRecord[] | null;
  aggregations?: Aggregations | null;
  info?: ApiInfo | null;
};

type SearchResult = {
  items: NormalArt[];
  total: number;
  facets: NormalArt['facets'];
  nextPage?: number;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const dedupe = (values: (string | undefined)[] | undefined): string[] | undefined => {
  if (!values) return undefined;
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    set.add(trimmed);
  }
  return set.size ? Array.from(set) : undefined;
};

const toHttps = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return value.startsWith('http://') ? value.replace('http://', 'https://') : value;
  }
};

const extractPeople = (record: ApiRecord): string | undefined => {
  const people = record.people ?? [];
  const names = people
    .map((person) => normalizeString(person?.displayname))
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return undefined;
  return Array.from(new Set(names)).join(', ');
};

const extractClassification = (record: ApiRecord): string[] | undefined => {
  if (!record.classification) return undefined;
  if (Array.isArray(record.classification)) {
    return dedupe(record.classification.map((entry) => normalizeString(entry))); 
  }
  const value = normalizeString(record.classification);
  return value ? [value] : undefined;
};

const extractCulture = (record: ApiRecord): string[] | undefined => {
  if (!record.culture) return undefined;
  if (Array.isArray(record.culture)) {
    return dedupe(record.culture.map((entry) => normalizeString(entry)));
  }
  const value = normalizeString(record.culture);
  return value ? [value] : undefined;
};

const extractIiifService = (record: ApiRecord): string | undefined => {
  const images = record.images ?? [];
  for (const image of images) {
    const base = normalizeString(image?.iiifbaseuri);
    if (base) return toHttps(base);
  }
  return undefined;
};

const extractRenditions = (record: ApiRecord): string[] => {
  const images = record.images ?? [];
  const urls = images
    .map((image) => toHttps(normalizeString(image?.baseimageurl)))
    .filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
};

const determineRights = (record: ApiRecord): NormalArt['rights'] => {
  const copyright = normalizeString(record.copyright)?.toLowerCase() ?? '';
  const permission = record.imagepermissionlevel ?? null;
  if (copyright.includes('public domain')) return 'PD';
  if (copyright.includes('creative commons')) return 'CC';
  if (copyright.includes('©') || copyright.includes('copyright')) return 'Restricted';
  if (permission === 2) return 'Restricted';
  if (permission === 1) return 'Restricted';
  if (!copyright) return 'Unknown';
  return 'Unknown';
};

const toFacetCounts = (aggregations: Aggregations | null | undefined): NormalArt['facets'] => {
  const facets: NormalArt['facets'] = {};
  const apply = (key: string, buckets?: AggregationBucket[] | null) => {
    if (!buckets) return;
    const map: Record<string, number> = {};
    for (const bucket of buckets) {
      const name = normalizeString(bucket?.key);
      const count = bucket?.doc_count;
      if (!name || typeof count !== 'number') continue;
      map[name] = count;
    }
    facets[key] = map;
  };
  apply('classification', aggregations?.classifications?.buckets ?? undefined);
  apply('century', aggregations?.centuries?.buckets ?? undefined);
  return facets;
};

const toNormalArt = (record: ApiRecord): NormalArt | null => {
  const id = normalizeString(record.objectid ?? record.id);
  if (!id) return null;
  const title = normalizeString(record.title) ?? 'Untitled';
  const maker = extractPeople(record);
  const dated = normalizeString(record.dated);
  const classification = extractClassification(record);
  const culture = extractCulture(record);
  const iiifService = extractIiifService(record);
  const primaryImage = toHttps(normalizeString(record.primaryimageurl));
  const renditions = extractRenditions(record);
  const providerUrl = toHttps(normalizeString(record.url)) ?? `https://www.harvardartmuseums.org/collections/object/${encodeURIComponent(id)}`;
  const manifest = normalizeString(record.iiifmanifest);
  const seeAlsoManifest = record.seeAlso?.find((entry) => normalizeString(entry?.type)?.toLowerCase().includes('manifest'));
  const manifestUrl = manifest ?? normalizeString(seeAlsoManifest?.id);
  const hasImageFlag =
    typeof record.hasimage === 'boolean'
      ? record.hasimage
      : typeof record.hasimage === 'number'
      ? record.hasimage > 0
      : undefined;
  const derivedHasImage =
    (record.imagecount ?? 0) > 0 || Boolean(primaryImage) || Boolean(iiifService) || renditions.length > 0;
  const hasImage = Boolean(hasImageFlag ?? derivedHasImage);
  const rights = determineRights(record);
  const jsonUrl = new URL(`${ENDPOINT}/${encodeURIComponent(id)}`, WORKER_BASE).toString();

  return {
    id,
    title,
    maker,
    dated,
    classification,
    culture,
    rights,
    iiifService,
    primaryImage,
    renditions,
    providerUrl,
    jsonUrl,
    manifestUrl,
    hasImage,
    facets: {},
  };
};

const toPage = (value: number | null | undefined): number | undefined => {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value)) return undefined;
  const page = Math.max(1, Math.floor(value));
  return page;
};

const serializeList = (values: string[] | undefined): string | undefined => {
  if (!values || values.length === 0) return undefined;
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (normalized.length === 0) return undefined;
  return normalized.join('|');
};

const mapSort = (state: SearchState): { field?: string; order?: 'asc' | 'desc' } => {
  switch (state.sort) {
    case 'title':
      return { field: 'title', order: 'asc' };
    case 'date':
      return { field: 'datebegin', order: 'asc' };
    case 'hasImage':
      return { field: 'imagecount', order: 'desc' };
    default:
      return {};
  }
};

const stateToParams = (state: SearchState, includeAggregations: boolean): URLSearchParams => {
  const params = new URLSearchParams();
  const size = state.size && state.size > 0 ? Math.min(state.size, 100) : DEFAULT_SIZE;
  const page = state.page && state.page > 0 ? Math.floor(state.page) : 1;
  params.set('size', String(size));
  params.set('page', String(page));
  params.set('hasimage', state.hasImage === false ? '0' : '1');
  if (state.q) params.set('q', state.q);
  const classification = serializeList(state.classification);
  if (classification) params.set('classification', classification);
  const century = serializeList(state.century);
  if (century) params.set('century', century);
  const sort = mapSort(state);
  if (sort.field) {
    params.set('sort', sort.field);
    if (sort.order) params.set('sortorder', sort.order);
  }
  params.set('fields', FIELDS.join(','));
  if (includeAggregations) {
    params.set('aggregation', AGGREGATION);
  }
  return params;
};

export async function searchHarvard(state: SearchState, abort?: AbortSignal): Promise<SearchResult> {
  const includeAggregations = (state.page ?? 1) <= 1;
  const params = stateToParams(state, includeAggregations);
  const url = new URL(ENDPOINT, WORKER_BASE);
  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), { signal: abort });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Harvard search failed: ${response.status} ${response.statusText} ${text}`);
  }

  const payload = (await response.json()) as ApiResponse;
  const records = payload.records ?? [];
  const items = records
    .map((record) => toNormalArt(record))
    .filter((item): item is NormalArt => item !== null)
    .map((item) => ({ ...item, facets: {} }));

  const facets = includeAggregations ? toFacetCounts(payload.aggregations) : {};
  const info = payload.info ?? {};
  const total = info.totalrecordsperquery ?? info.totalrecords ?? items.length;
  const page = toPage(info.page) ?? 1;
  const pages = toPage(info.pages);
  const nextPage = pages && page < pages ? page + 1 : undefined;

  return { items, total, facets, nextPage };
}
