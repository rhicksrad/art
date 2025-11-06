import { NormalArt, SearchState } from '../types';

const SEARCH_ENDPOINT = '/princeton-art/search';
const OBJECT_ENDPOINT = '/princeton-art/objects';

const MAX_BATCH = 100;

const detailCache = new Map<string, any>();

type SearchHit = {
  _id?: string;
  _score?: number;
  _source?: {
    objectid?: number | string;
    displaytitle?: string;
    displaymaker?: string;
    primaryimage?: string[];
  };
};

type SearchResponse = {
  hits?: {
    total?: number | { value?: number };
    hits?: SearchHit[];
  };
};

type DetailRecord = {
  objectid?: number | string;
  displaytitle?: string;
  displaymaker?: string;
  displaydate?: string;
  daterange?: string;
  datebegin?: number;
  dateend?: number;
  classification?: string;
  classifications?: { classification?: string }[];
  cultures?: { displayculture?: string; culture?: string }[];
  cultureterms?: { culture?: string }[];
  media?: { uri?: string; isprimary?: number }[];
  primaryimage?: string[];
  hasimage?: string | boolean;
  restrictions?: string | null;
  nowebuse?: string | null;
  creditlinerepro?: string | null;
  manifest?: string | null;
  iiif?: { service?: string };
  makers?: { displaymaker?: string; displayname?: string; displaydate?: string; role?: string }[];
};

type Normalized = {
  item: NormalArt;
  classifications: string[];
  centuries: string[];
  hasImage: boolean;
  dateSort?: number;
  score: number;
};

const parseTotal = (value: SearchResponse['hits']): number => {
  if (!value) return 0;
  const total = value.total;
  if (typeof total === 'number') return total;
  if (total && typeof total.value === 'number') return total.value;
  return 0;
};

const ordinal = (value: number): string => {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${abs}th`;
  switch (mod10) {
    case 1:
      return `${abs}st`;
    case 2:
      return `${abs}nd`;
    case 3:
      return `${abs}rd`;
    default:
      return `${abs}th`;
  }
};

const yearToCentury = (input: number): { label: string; order: number } => {
  let year = input;
  if (year === 0) year = 1;
  if (year > 0) {
    const century = Math.ceil(year / 100);
    return { label: `${ordinal(century)} century`, order: year };
  }
  const century = Math.ceil(Math.abs(year) / 100);
  return { label: `${ordinal(century)} century BCE`, order: year };
};

const computeCenturyRange = (begin?: number, end?: number): string | undefined => {
  if (begin == null && end == null) return undefined;
  const startYear = begin ?? end ?? null;
  const endYear = end ?? begin ?? null;
  if (startYear == null) return undefined;
  const startCentury = yearToCentury(startYear);
  if (endYear == null) return startCentury.label;
  const endCentury = yearToCentury(endYear);
  if (startCentury.label === endCentury.label) return startCentury.label;
  if (startYear <= 0 && endYear > 0) {
    return `${startCentury.label}–${endCentury.label}`;
  }
  return `${startCentury.label}–${endCentury.label}`;
};

const dedupe = (values: (string | undefined | null)[] | undefined): string[] => {
  if (!values) return [];
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    set.add(trimmed);
  }
  return Array.from(set);
};

const mapRights = (record: DetailRecord): NormalArt['rights'] => {
  const restrictions = `${record.restrictions ?? ''}`.toLowerCase();
  const credit = `${record.creditlinerepro ?? ''}`.toLowerCase();
  const noWebUse = `${record.nowebuse ?? ''}`.toLowerCase();
  if (restrictions.includes('public domain')) return 'PD';
  if (credit.includes('public domain')) return 'PD';
  if (restrictions.includes('creative commons') || credit.includes('creative commons')) return 'CC';
  if (restrictions.includes('restricted') || restrictions.includes('copyright') || noWebUse === 'true') {
    return 'Restricted';
  }
  if (credit.includes('©') || credit.includes('copyright')) return 'Restricted';
  return 'Unknown';
};

const extractIiifService = (record: DetailRecord): string | undefined => {
  if (record.iiif?.service) return record.iiif.service;
  const media = record.media ?? [];
  for (const entry of media) {
    if (entry?.uri && entry.uri.includes('/iiif/')) {
      return entry.uri;
    }
  }
  const primary = record.primaryimage ?? [];
  for (const entry of primary) {
    if (entry.includes('/iiif/')) return entry;
  }
  return undefined;
};

const extractPrimaryImage = (record: DetailRecord): string | undefined => {
  const media = record.media ?? [];
  const primaryMedia = media.find((entry) => entry?.isprimary === 1)?.uri;
  if (primaryMedia) return primaryMedia;
  return record.primaryimage?.[0];
};

const extractRenditions = (record: DetailRecord): string[] => {
  const media = record.media ?? [];
  const uris = media.map((entry) => entry?.uri).filter((uri): uri is string => Boolean(uri));
  return dedupe(uris);
};

const mapMaker = (record: DetailRecord): string | undefined => {
  if (record.displaymaker) return record.displaymaker;
  const makers = record.makers ?? [];
  if (makers.length === 0) return undefined;
  return makers
    .map((maker) => maker?.displaymaker || maker?.displayname)
    .filter((value): value is string => Boolean(value))
    .join('; ');
};

const computeCenturies = (record: DetailRecord): string[] => {
  const values: string[] = [];
  const derived = computeCenturyRange(record.datebegin, record.dateend);
  if (derived) values.push(derived);
  if (record.displaydate) {
    const matches = record.displaydate.match(/\d+(?:st|nd|rd|th)\s+century\s*(?:BCE|CE|BC|AD)?/gi);
    if (matches) {
      for (const match of matches) {
        values.push(match.replace(/\s+AD/gi, ' CE').replace(/\s+BC/gi, ' BCE'));
      }
    }
  }
  return dedupe(values);
};

const detailUrl = (id: string): string => {
  return `${OBJECT_ENDPOINT}/${encodeURIComponent(id)}`;
};

const fetchDetail = async (id: string, signal?: AbortSignal): Promise<DetailRecord | null> => {
  if (detailCache.has(id)) {
    return detailCache.get(id);
  }
  const res = await fetch(detailUrl(id), { signal });
  if (!res.ok) {
    if (res.status === 404) {
      detailCache.set(id, null);
      return null;
    }
    throw new Error(`Princeton detail ${res.status}`);
  }
  const json = (await res.json()) as DetailRecord;
  detailCache.set(id, json);
  return json;
};

const fetchSearch = async (
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> => {
  const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Princeton search ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
};

const toNormalized = (hit: SearchHit, detail: DetailRecord | null): Normalized | null => {
  if (!detail) return null;
  const id = String(detail.objectid ?? hit._id ?? '');
  if (!id) return null;

  const classifications = dedupe([
    detail.classification,
    ...(detail.classifications ?? []).map((entry) => entry?.classification),
  ]);
  const culture = dedupe([
    ...(detail.cultures ?? []).map((entry) => entry?.displayculture ?? entry?.culture),
    ...(detail.cultureterms ?? []).map((entry) => entry?.culture),
  ]);
  const iiifService = extractIiifService(detail);
  const primaryImage = extractPrimaryImage(detail);
  const renditions = extractRenditions(detail);
  const hasImage = Boolean(iiifService || primaryImage || renditions.length > 0 || detail.hasimage === 'true' || detail.hasimage === true);

  const item: NormalArt = {
    id,
    title: detail.displaytitle || hit._source?.displaytitle || 'Untitled',
    maker: mapMaker(detail) ?? hit._source?.displaymaker ?? undefined,
    dated: detail.displaydate || detail.daterange,
    classification: classifications.length > 0 ? classifications : undefined,
    culture: culture.length > 0 ? culture : undefined,
    rights: mapRights(detail),
    iiifService,
    primaryImage,
    renditions,
    providerUrl: `https://artmuseum.princeton.edu/collections/objects/${id}`,
    jsonUrl: `https://data.artmuseum.princeton.edu/objects/${id}`,
    manifestUrl: detail.manifest ?? undefined,
    hasImage,
    facets: {},
  };

  return {
    item,
    classifications,
    centuries: computeCenturies(detail),
    hasImage,
    dateSort: typeof detail.datebegin === 'number' ? detail.datebegin : typeof detail.dateend === 'number' ? detail.dateend : undefined,
    score: typeof hit._score === 'number' ? hit._score : 0,
  };
};

const matchesFilters = (record: Normalized, state: SearchState): boolean => {
  if (state.hasImage && !record.hasImage) return false;
  if (state.classification && state.classification.length > 0) {
    const desired = new Set(state.classification);
    if (!record.classifications.some((value) => desired.has(value))) {
      return false;
    }
  }
  if (state.century && state.century.length > 0) {
    const desired = new Set(state.century);
    if (!record.centuries.some((value) => desired.has(value))) {
      return false;
    }
  }
  return true;
};

const sortRecords = (records: Normalized[], sort: SearchState['sort'] = 'relevance'): Normalized[] => {
  const copy = [...records];
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => {
        const titleA = a.item.title.toLocaleLowerCase();
        const titleB = b.item.title.toLocaleLowerCase();
        return titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
      });
    case 'date':
      return copy.sort((a, b) => {
        const aDate = a.dateSort ?? Number.POSITIVE_INFINITY;
        const bDate = b.dateSort ?? Number.POSITIVE_INFINITY;
        if (aDate === bDate) {
          return a.item.title.localeCompare(b.item.title, undefined, { sensitivity: 'base' });
        }
        return aDate - bDate;
      });
    case 'hasImage':
      return copy.sort((a, b) => {
        if (a.hasImage === b.hasImage) {
          return b.score - a.score;
        }
        return a.hasImage ? -1 : 1;
      });
    case 'relevance':
    default:
      return copy.sort((a, b) => b.score - a.score);
  }
};

const buildFacetCounts = (records: Normalized[]): NormalArt['facets'] => {
  const facets: NormalArt['facets'] = {
    classification: {},
    century: {},
  };
  for (const record of records) {
    for (const value of record.classifications) {
      facets.classification[value] = (facets.classification[value] ?? 0) + 1;
    }
    for (const value of record.centuries) {
      facets.century[value] = (facets.century[value] ?? 0) + 1;
    }
  }
  return facets;
};

export const searchPrinceton = async (
  state: SearchState,
  abort?: AbortSignal,
): Promise<{ items: NormalArt[]; total: number; facets: NormalArt['facets']; nextPage?: number }> => {
  const page = Math.max(1, state.page ?? 1);
  const size = Math.min(MAX_BATCH, Math.max(10, state.size ?? 30));
  const desiredMatches = page * size + size;
  const query = state.q?.trim() ?? '';

  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('type', 'artobjects');

  let offset = 0;
  let totalAvailable = 0;
  const matches: Normalized[] = [];

  while (!abort?.aborted && matches.length < desiredMatches) {
    params.set('size', String(Math.min(MAX_BATCH, Math.max(size, 30))));
    params.set('from', String(offset));
    const response = await fetchSearch(params, abort);
    const hits = response.hits?.hits ?? [];
    if (offset === 0) {
      totalAvailable = parseTotal(response.hits);
    }
    if (hits.length === 0) {
      break;
    }

    const details = await Promise.all(
      hits.map(async (hit) => {
        const id = String(hit._source?.objectid ?? hit._id ?? '');
        if (!id) return null;
        return await fetchDetail(id, abort);
      }),
    );

    for (let index = 0; index < hits.length; index += 1) {
      if (abort?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const normalized = toNormalized(hits[index], details[index]);
      if (!normalized) continue;
      if (!matchesFilters(normalized, state)) continue;
      matches.push(normalized);
    }

    offset += hits.length;
    if (offset >= totalAvailable) break;
  }

  const sorted = sortRecords(matches, state.sort);
  const start = (page - 1) * size;
  const end = start + size;
  const pageSlice = sorted.slice(start, end);
  const facets = buildFacetCounts(pageSlice);
  const items = pageSlice.map((entry) => entry.item);
  const complete = offset >= totalAvailable;
  const total = complete ? sorted.length : Math.max(sorted.length, totalAvailable);
  const nextPage = sorted.length > end ? page + 1 : undefined;

  return { items, total, facets, nextPage };
};
