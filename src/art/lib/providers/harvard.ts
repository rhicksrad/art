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

type HarvardFacetItem = {
  name?: string;
  value?: string;
  count?: number;
};

type HarvardFacet = {
  name?: string;
  items?: HarvardFacetItem[];
};

type HarvardImage = {
  iiifbaseuri?: string;
  iiif_url?: string;
  baseimageurl?: string;
  iiif_id?: string;
  url?: string;
  rendition_urls?: Record<string, unknown>;
  formats?: Record<string, unknown>;
  iiifmanifest?: string;
};

type HarvardPerson = {
  displayname?: string;
  name?: string;
};

type HarvardRecord = {
  id?: number | string;
  objectid?: number | string;
  title?: string;
  people?: HarvardPerson[];
  dated?: string;
  classification?: string | string[];
  century?: string | string[];
  culture?: string | string[];
  url?: string;
  primaryimageurl?: string;
  images?: HarvardImage[];
  iiifbaseuri?: string;
  iiifmanifest?: string;
  rights?: string;
  rights_type?: string;
  copyright?: string;
  imagecount?: number;
  accesslevel?: string | number;
};

type HarvardInfo = {
  page?: number;
  totalrecords?: number;
  totalrecordsperquery?: number;
  pages?: number;
};

type HarvardResponse = {
  records?: HarvardRecord[];
  info?: HarvardInfo;
  facets?: HarvardFacet[];
};

const DEFAULT_FIELDS = [
  'objectid',
  'title',
  'people',
  'dated',
  'classification',
  'culture',
  'century',
  'url',
  'primaryimageurl',
  'images',
  'iiifbaseuri',
  'iiifmanifest',
  'rights',
  'rights_type',
  'copyright',
  'imagecount',
];

const FACET_KEYS: Array<keyof SearchState> = ['classification', 'century'];

const rightsMap: Record<string, NormalArt['rights']> = {
  'public domain': 'PD',
  'cc0': 'PD',
  'creative commons': 'CC',
  'cc by': 'CC',
  'cc-by': 'CC',
  'cc by-nc': 'CC',
  'cc-by-nc': 'CC',
  'restricted': 'Restricted',
  'in copyright': 'Restricted',
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const ensureArray = (value: string | string[] | undefined): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const items = value.map((v) => asString(v) ?? '').filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  const str = asString(value);
  return str ? [str] : undefined;
};

const pickRights = (record: HarvardRecord): NormalArt['rights'] => {
  const candidates = [record.rights, record.rights_type, record.copyright, asString(record.accesslevel)];
  for (const candidate of candidates) {
    const normalized = asString(candidate)?.toLowerCase();
    if (!normalized) continue;
    for (const [key, value] of Object.entries(rightsMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
  }
  return 'Unknown';
};

const parseFacetCounts = (facets?: HarvardFacet[]): NormalArt['facets'] => {
  const result: NormalArt['facets'] = {};
  if (!Array.isArray(facets)) {
    return result;
  }
  for (const facet of facets) {
    if (!facet || !facet.name || !Array.isArray(facet.items)) continue;
    const bucket: Record<string, number> = {};
    for (const item of facet.items) {
      const label = asString(item?.value);
      const count = typeof item?.count === 'number' ? item.count : Number(item?.count ?? 0);
      if (label && Number.isFinite(count)) {
        bucket[label] = count;
      }
    }
    if (Object.keys(bucket).length > 0) {
      result[facet.name] = bucket;
    }
  }
  return result;
};

const gatherRenditions = (images?: HarvardImage[]): string[] => {
  if (!Array.isArray(images)) return [];
  const urls = new Set<string>();
  for (const image of images) {
    if (!image) continue;
    const candidates = [image.baseimageurl, image.url, image.iiif_url];
    for (const candidate of candidates) {
      const value = asString(candidate);
      if (value) urls.add(value);
    }
    const renditionValues = image.rendition_urls ?? image.formats;
    if (renditionValues && typeof renditionValues === 'object') {
      for (const value of Object.values(renditionValues)) {
        const str = asString(value);
        if (str) urls.add(str);
      }
    }
  }
  return Array.from(urls);
};

const extractIiifService = (record: HarvardRecord): string | undefined => {
  const direct = asString(record.iiifbaseuri);
  if (direct) return direct;
  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const candidate = asString(image?.iiifbaseuri ?? image?.iiif_url ?? image?.iiif_id);
      if (candidate) return candidate;
    }
  }
  const primary = asString(record.primaryimageurl);
  if (primary && primary.includes('/iiif/')) {
    return primary.replace(/\/full\/.*$/, '');
  }
  return undefined;
};

const extractManifest = (record: HarvardRecord): string | undefined => {
  const direct = asString(record.iiifmanifest);
  if (direct) return direct;
  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const candidate = asString(image?.iiifmanifest);
      if (candidate) return candidate;
    }
  }
  return undefined;
};

const joinPeople = (people?: HarvardPerson[]): string | undefined => {
  if (!Array.isArray(people)) return undefined;
  const names = people
    .map((person) => asString(person?.displayname ?? person?.name))
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return undefined;
  return Array.from(new Set(names)).join(', ');
};

const toNormalArt = (record: HarvardRecord): NormalArt => {
  const id =
    asString(record.objectid) ??
    asString(record.id) ??
    `harvard-${Math.random().toString(36).slice(2)}`;
  const title = asString(record.title) ?? 'Untitled';
  const maker = joinPeople(record.people);
  const classification = ensureArray(record.classification);
  const culture = ensureArray(record.culture);
  const primaryImage = asString(record.primaryimageurl);
  const renditions = gatherRenditions(record.images);
  const iiifService = extractIiifService(record);
  const manifestUrl = extractManifest(record);
  const providerUrl = asString(record.url) ?? `https://harvardartmuseums.org/art/${id}`;
  const jsonUrl = `/harvard-art/object/${id}`;
  const hasImage = Boolean(
    primaryImage ||
      iiifService ||
      (Array.isArray(record.images) && record.images.length > 0) ||
      (typeof record.imagecount === 'number' && record.imagecount > 0),
  );

  return {
    id,
    title,
    maker,
    dated: asString(record.dated),
    classification,
    culture,
    rights: pickRights(record),
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

const mapSort = (sort?: SearchState['sort']): string | undefined => {
  switch (sort) {
    case 'title':
      return 'title';
    case 'date':
      return 'dated';
    case 'hasImage':
      return 'imagecount';
    case 'relevance':
      return 'rank';
    default:
      return sort ?? undefined;
  }
};

const buildParams = (state: SearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.classification) {
    state.classification.forEach((value) => params.append('classification', value));
  }
  if (state.century) {
    state.century.forEach((value) => params.append('century', value));
  }
  const size = state.size && state.size > 0 ? Math.min(Math.trunc(state.size), 100) : 30;
  params.set('size', String(size));
  const page = state.page && state.page > 0 ? Math.trunc(state.page) : 1;
  params.set('page', String(page));
  const sort = mapSort(state.sort ?? 'relevance');
  if (sort) params.set('sort', sort);
  if (typeof state.hasImage === 'boolean') {
    params.set('hasimage', state.hasImage ? '1' : '0');
  }
  params.set('fields', DEFAULT_FIELDS.join(','));
  params.set('facets', FACET_KEYS.join(','));
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
  const response = await fetch(`/harvard-art/object?${params.toString()}`, {
    signal: abort,
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Harvard API error: ${response.status} ${response.statusText} — ${text}`);
  }
  const json = (await response.json()) as HarvardResponse;
  const records = Array.isArray(json.records) ? json.records : [];
  const items = records.map(toNormalArt);
  const facets = parseFacetCounts(json.facets);
  const info = json.info ?? {};
  const total = info.totalrecordsperquery ?? info.totalrecords ?? items.length;
  const currentPage = info.page ?? state.page ?? 1;
  const totalPages = info.pages ?? (items.length < Number(params.get('size')) ? currentPage : currentPage + 1);
  const nextPage = currentPage < totalPages ? currentPage + 1 : undefined;
  return {
    items,
    total,
    facets,
    nextPage,
  };
}
