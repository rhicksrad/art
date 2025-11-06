import type { SearchState } from '../urlState';

export type NormalArt = {
  id: string;
  title: string;
  maker?: string;
  dated?: string;
  classification?: string[];
  culture?: string[];
  rights?: 'PD' | 'CC' | 'Restricted' | 'Unknown';
  iiifService?: string;
  primaryImage?: string;
  renditions?: string[];
  providerUrl: string;
  jsonUrl: string;
  manifestUrl?: string;
  hasImage: boolean;
  facets: Record<string, Record<string, number>>;
};

type HarvardPerson = {
  displayname?: string;
  name?: string;
};

type HarvardImage = {
  baseimageurl?: string;
  iiifbaseuri?: string;
  iiif_url?: string;
  url?: string;
};

type HarvardRecord = {
  id?: number | string;
  objectid?: number | string;
  objectnumber?: number | string;
  title?: string;
  people?: HarvardPerson[];
  dated?: string;
  beginyear?: number;
  endyear?: number;
  classification?: string | string[];
  classifications?: string[];
  culture?: string | string[];
  cultures?: string[];
  rights?: string;
  copyright?: string;
  imagepermissionlevel?: number;
  hasimage?: number | boolean;
  primaryimageurl?: string;
  images?: HarvardImage[];
  url?: string;
  iiifbaseuri?: string;
  iiifmanifest?: string;
  century?: string | string[];
};

type HarvardFacetItem = {
  value?: string;
  name?: string;
  count?: number;
};

type HarvardFacet = {
  field?: string;
  name?: string;
  items?: HarvardFacetItem[];
  values?: HarvardFacetItem[];
  buckets?: HarvardFacetItem[];
};

type HarvardInfo = {
  totalrecords?: number;
  totalrecordsperquery?: number;
  page?: number;
  pages?: number;
};

type HarvardResponse = {
  info?: HarvardInfo;
  records?: HarvardRecord[];
  facets?: HarvardFacet[] | Record<string, HarvardFacetItem[] | Record<string, number>>;
};

const API_BASE = '/harvard-art/object';
const DEFAULT_FIELDS = [
  'objectid',
  'objectnumber',
  'title',
  'people',
  'dated',
  'classification',
  'century',
  'culture',
  'rights',
  'copyright',
  'imagepermissionlevel',
  'primaryimageurl',
  'images',
  'iiifbaseuri',
  'iiifmanifest',
  'url',
  'hasimage',
];
const FACET_FIELDS = ['classification', 'century'];

const SORT_MAP: Record<NonNullable<SearchState['sort']>, string> = {
  relevance: 'rank',
  title: 'title',
  date: 'dated',
  hasImage: 'imagecount',
};

const RIGHTS_REGEX = {
  PD: /(public\s*domain|no known copyright)/i,
  CC: /(creative\s*commons|cc-?)/i,
  Restricted: /(restricted|all rights reserved|copyright)/i,
};

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const cleanString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const dedupe = (values: (string | undefined)[]): string[] | undefined => {
  const set = new Set<string>();
  for (const value of values) {
    if (value) set.add(value);
  }
  return set.size > 0 ? Array.from(set) : undefined;
};

const joinPeople = (people?: HarvardPerson[]): string | undefined => {
  if (!people || people.length === 0) return undefined;
  const names = people
    .map((person) => cleanString(person.displayname) ?? cleanString(person.name))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(', ') : undefined;
};

const detectRights = (record: HarvardRecord): NormalArt['rights'] => {
  const text = cleanString(record.rights) ?? cleanString(record.copyright);
  if (!text) return 'Unknown';
  for (const [key, regex] of Object.entries(RIGHTS_REGEX)) {
    if (regex.test(text)) {
      return key as NormalArt['rights'];
    }
  }
  if (record.imagepermissionlevel === 0) {
    return 'Restricted';
  }
  return 'Unknown';
};

const extractIiifService = (record: HarvardRecord): string | undefined => {
  const direct = cleanString(record.iiifbaseuri);
  if (direct) return direct.replace(/\/?$/, '');
  const fromImages = record.images?.find((img) => cleanString(img.iiifbaseuri));
  const service = fromImages && cleanString(fromImages.iiifbaseuri);
  if (service) return service.replace(/\/?$/, '');
  return undefined;
};

const collectRenditions = (record: HarvardRecord): string[] | undefined => {
  const list: string[] = [];
  const primary = cleanString(record.primaryimageurl);
  if (primary) list.push(primary);
  if (record.images) {
    for (const image of record.images) {
      const candidates = [image.baseimageurl, image.iiif_url, image.url]
        .map(cleanString)
        .filter((value): value is string => Boolean(value));
      list.push(...candidates);
    }
  }
  const unique = Array.from(new Set(list));
  return unique.length > 0 ? unique : undefined;
};

const parseFacets = (
  raw: HarvardResponse['facets'],
): Record<string, Record<string, number>> => {
  const result: Record<string, Record<string, number>> = {};
  if (!raw) return result;
  if (Array.isArray(raw)) {
    for (const facet of raw) {
      const key = facet.field ?? facet.name;
      if (!key) continue;
      const options = facet.items ?? facet.values ?? facet.buckets;
      if (!options) continue;
      for (const option of options) {
        const label = cleanString(option.value ?? option.name);
        const count = typeof option.count === 'number' ? option.count : undefined;
        if (!label || count == null) continue;
        if (!result[key]) result[key] = {};
        result[key][label] = count;
      }
    }
    return result;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const option of value) {
        const label = cleanString(option.value ?? option.name);
        const count = typeof option.count === 'number' ? option.count : undefined;
        if (!label || count == null) continue;
        if (!result[key]) result[key] = {};
        result[key][label] = count;
      }
      continue;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, number>;
      for (const [label, count] of Object.entries(record)) {
        if (typeof count !== 'number') continue;
        const cleaned = cleanString(label);
        if (!cleaned) continue;
        if (!result[key]) result[key] = {};
        result[key][cleaned] = count;
      }
    }
  }
  return result;
};

const mapRecord = (record: HarvardRecord, facets: Record<string, Record<string, number>>): NormalArt => {
  const objectId = cleanString(record.objectid ?? record.id);
  const fallbackId = cleanString(record.objectnumber);
  const id = objectId ?? fallbackId ?? `harvard-${Math.random().toString(36).slice(2)}`;
  const title = cleanString(record.title) ?? 'Untitled';
  const maker = joinPeople(record.people);
  const dated = cleanString(record.dated);
  const classification = dedupe([
    ...asArray(record.classification).map(cleanString),
    ...asArray(record.classifications).map(cleanString),
  ].filter((value): value is string => Boolean(value)));
  const culture = dedupe([
    ...asArray(record.culture).map(cleanString),
    ...asArray(record.cultures).map(cleanString),
  ].filter((value): value is string => Boolean(value)));
  const providerUrl = cleanString(record.url)
    ?? (objectId ? `https://harvardartmuseums.org/collections/object/${encodeURIComponent(objectId)}` : undefined)
    ?? `${API_BASE}/${id}`;
  const jsonUrl = `${API_BASE}/${objectId ?? id}`;
  const manifestUrl = cleanString(record.iiifmanifest);
  const iiifService = extractIiifService(record);
  const primaryImage = cleanString(record.primaryimageurl);
  const renditions = collectRenditions(record);
  const hasImage = Boolean(
    record.hasimage ?? primaryImage ?? (renditions && renditions.length > 0),
  );
  const rights = detectRights(record);

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
    facets,
  };
};

const buildParams = (state: SearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  const classifications = state.classification ?? [];
  const centuries = state.century ?? [];
  for (const value of classifications) params.append('classification', value);
  for (const value of centuries) params.append('century', value);
  const sortKey = state.sort ? SORT_MAP[state.sort] ?? SORT_MAP.relevance : SORT_MAP.relevance;
  params.set('sort', sortKey);
  if (sortKey === 'dated') {
    params.set('sortorder', 'asc');
  } else if (sortKey === 'title') {
    params.set('sortorder', 'asc');
  } else if (sortKey === 'imagecount') {
    params.set('sortorder', 'desc');
  }
  const size = state.size && state.size > 0 ? state.size : 30;
  params.set('size', String(size));
  const page = state.page && state.page > 0 ? state.page : 1;
  params.set('page', String(page));
  if (state.hasImage !== undefined) {
    params.set('hasimage', state.hasImage ? '1' : '0');
  }
  params.set('fields', DEFAULT_FIELDS.join(','));
  params.set('facets', FACET_FIELDS.join(','));
  return params;
};

export async function searchHarvard(
  state: SearchState,
  abort?: AbortSignal,
): Promise<{
  items: NormalArt[];
  total: number;
  facets: NormalArt['facets'];
  nextPage?: number;
}> {
  const params = buildParams(state);
  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url, { signal: abort });
  if (!res.ok) {
    throw new Error(`Harvard request failed: ${res.status} ${res.statusText}`.trim());
  }
  const json = (await res.json()) as HarvardResponse;
  const facets = parseFacets(json.facets);
  const records = Array.isArray(json.records) ? json.records : [];
  const items = records.map((record) => mapRecord(record, facets));
  const info = json.info ?? {};
  const total = info.totalrecordsperquery ?? info.totalrecords ?? items.length;
  let nextPage: number | undefined;
  if (info.page && info.pages && info.page < info.pages) {
    nextPage = info.page + 1;
  }
  return {
    items,
    total,
    facets,
    nextPage,
  };
}
