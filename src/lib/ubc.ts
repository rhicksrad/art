import { fetchJSON, HttpError, toQuery } from './http';
import { fetchWithOfflineFallback } from './offlineFixtures';

const STORAGE_KEY = 'ubcIndex';
const FALLBACK_INDEX = 'calendars';
const UBC_DIRECT_BASE = 'https://oc-index.library.ubc.ca';
const COLLECTIONS_PATH = '/collections';
const ALPHA_PATTERN = /^[A-Za-z]/;

type CollectionsResponse = {
  data?: Record<string, unknown> | unknown[];
};

type UnknownRecord = Record<string, unknown>;

const toRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const readFromStorage = (): string | undefined => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

const writeToStorage = (value: string): void => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore quota and privacy errors.
  }
};

const normaliseSlug = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const collectSlugs = (response: CollectionsResponse | undefined): string[] => {
  const results: string[] = [];
  if (!response) {
    return results;
  }
  const { data } = response;
  if (!data) {
    return results;
  }

  if (Array.isArray(data)) {
    for (const entry of data) {
      if (typeof entry === 'string') {
        const slug = normaliseSlug(entry);
        if (slug) {
          results.push(slug);
        }
        continue;
      }
      const record = toRecord(entry);
      if (!record) {
        continue;
      }
      const slug = normaliseSlug(
        (typeof record.slug === 'string' ? record.slug : undefined) ??
          (typeof record.id === 'string' ? record.id : undefined) ??
          (typeof record.code === 'string' ? record.code : undefined),
      );
      if (slug) {
        results.push(slug);
      }
    }
    return results;
  }

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data as UnknownRecord)) {
      const keySlug = normaliseSlug(key);
      if (keySlug) {
        results.push(keySlug);
      }
      if (typeof value === 'string') {
        const valueSlug = normaliseSlug(value);
        if (valueSlug) {
          results.push(valueSlug);
        }
        continue;
      }
      const record = toRecord(value);
      if (!record) {
        continue;
      }
      const slug = normaliseSlug(
        (typeof record.slug === 'string' ? record.slug : undefined) ??
          (typeof record.id === 'string' ? record.id : undefined) ??
          (typeof record.code === 'string' ? record.code : undefined),
      );
      if (slug) {
        results.push(slug);
      }
    }
  }

  return results;
};

const pickSlug = (response: CollectionsResponse | undefined): string => {
  const slugs = collectSlugs(response);
  const match = slugs.find((slug) => ALPHA_PATTERN.test(slug));
  return match ?? FALLBACK_INDEX;
};

const fetchCollectionsDirect = async (): Promise<CollectionsResponse | undefined> => {
  const url = new URL(COLLECTIONS_PATH, UBC_DIRECT_BASE);
  const response = await fetchWithOfflineFallback(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`Direct request to ${url.toString()} failed with status ${response.status}`, {
      status: response.status,
      url: url.toString(),
      contentType: response.headers.get('content-type') ?? undefined,
      sample: text,
    });
  }
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as CollectionsResponse;
};

export const setUbcIndex = (index: string): string => {
  const slug = normaliseSlug(index) ?? FALLBACK_INDEX;
  writeToStorage(slug);
  return slug;
};

export const refreshUbcIndex = async (): Promise<string> => {
  try {
    const response = await fetchJSON<CollectionsResponse>('/ubc/collections', { ttl: 0 });
    const dataRecord = response && typeof response === 'object' ? (response as Record<string, unknown>).data : undefined;
    const routeMessage =
      typeof dataRecord === 'object' && dataRecord && 'route' in (dataRecord as Record<string, unknown>)
        ? String((dataRecord as Record<string, unknown>).route ?? '')
        : '';
    if (routeMessage.toLowerCase().includes('missed route')) {
      throw new Error(routeMessage);
    }
    const slug = pickSlug(response);
    setUbcIndex(slug);
    return slug;
  } catch (error) {
    const response = await fetchCollectionsDirect().catch(() => undefined);
    const slug = pickSlug(response);
    setUbcIndex(slug);
    return slug;
  }
};

export const getUbcIndex = async (): Promise<string> => {
  const cached = readFromStorage();
  if (cached) {
    return cached;
  }
  try {
    return await refreshUbcIndex();
  } catch {
    return FALLBACK_INDEX;
  }
};

type SearchOptions = {
  size?: number;
  from?: number;
  sort?: string;
  index?: string;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const readTotalFromHits = (value: unknown): number | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  const direct = toNumber(record.total ?? record.count ?? record.value);
  if (direct !== undefined) {
    return direct;
  }
  if (typeof record.value === 'number' && Number.isFinite(record.value)) {
    return record.value;
  }
  return undefined;
};

export const getUbcTotal = (resp: unknown): number | undefined => {
  const record = toRecord(resp);
  if (!record) {
    return undefined;
  }

  const hitsRecord = toRecord(record.hits);
  const hitsTotal = hitsRecord ? readTotalFromHits(hitsRecord.total) : undefined;
  if (hitsTotal !== undefined) {
    return hitsTotal;
  }

  const direct = toNumber(record.total);
  if (direct !== undefined) {
    return direct;
  }

  const dataRecord = toRecord(record.data);
  if (dataRecord) {
    const dataTotal = toNumber(dataRecord.total);
    if (dataTotal !== undefined) {
      return dataTotal;
    }
    const dataCount = toNumber(dataRecord.count);
    if (dataCount !== undefined) {
      return dataCount;
    }
  }

  const count = toNumber(record.count);
  return count !== undefined ? count : undefined;
};

export const searchUbc = async (
  q: string,
  opts: SearchOptions = {},
  init?: RequestInit,
): Promise<unknown> => {
  const trimmed = q.trim();
  const override = typeof opts.index === 'string' ? normaliseSlug(opts.index) : undefined;
  const index = override ?? (await getUbcIndex());
  const params: Record<string, string | number> = {};

  if (trimmed.length > 0) {
    params.q = trimmed;
  }

  if (typeof opts.size === 'number' && Number.isFinite(opts.size)) {
    params.size = opts.size;
  }
  if (typeof opts.from === 'number' && Number.isFinite(opts.from) && opts.from >= 0) {
    params.from = opts.from;
  }
  if (typeof opts.sort === 'string' && opts.sort.trim()) {
    params.sort = opts.sort.trim();
  }

  const workerParams = { ...params, index };

  const fetchDirect = async (cause?: unknown): Promise<unknown> => {
    const url = new URL('/search/8.5', UBC_DIRECT_BASE);
    const directParams = toQuery(workerParams);
    url.search = directParams.toString();

    const headers = new Headers({ Accept: 'application/json' });
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    const response = await fetchWithOfflineFallback(url, { ...init, headers });
    const contentType = response.headers.get('content-type') ?? undefined;
    const text = await response.text();

    if (!response.ok) {
      throw new HttpError(
        `Direct request to ${url.toString()} failed with status ${response.status}`,
        { status: response.status, url: url.toString(), contentType, sample: text },
        cause instanceof Error ? { cause } : undefined,
      );
    }

    return text ? (JSON.parse(text) as unknown) : undefined;
  };

  try {
    const response = await fetchJSON('/ubc/search/8.5', workerParams, init);
    const record = toRecord(response);
    const dataRecord = toRecord(record?.data);
    const routeMessage = typeof dataRecord?.route === 'string' ? dataRecord.route : undefined;
    if (routeMessage && routeMessage.toLowerCase().includes('missed route')) {
      return await fetchDirect(response);
    }
    return response;
  } catch (error) {
    if (
      error instanceof HttpError &&
      [400, 401, 403, 404, 500, 502, 503, 504, 522, 523, 524].includes(error.status)
    ) {
      return await fetchDirect(error);
    }
    throw error;
  }
};
