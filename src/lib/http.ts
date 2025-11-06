import { WORKER_BASE } from './config';
import { clear, get, set } from './cache';

type QueryParamValue = string | number | boolean;

type QueryParams = Record<string, QueryParamValue>;

type RequestOptions = {
  signal?: AbortSignal;
  method?: string;
  cache?: boolean;
};

const toSearchParams = (params: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return searchParams;
};

const buildUrl = (path: string, params: QueryParams = {}): URL => {
  const queryParams: QueryParams = { ...params };

  if (!Object.prototype.hasOwnProperty.call(queryParams, 'ttl')) {
    queryParams.ttl = 3600;
  }

  const url = new URL(path, WORKER_BASE);
  const searchParams = toSearchParams(queryParams);
  const queryString = searchParams.toString();

  if (queryString) {
    url.search = queryString;
  }

  return url;
};

const cloneIfNeeded = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value) as T;
    } catch {
      // ignore and fall back to JSON cloning
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const request = async <T>(
  path: string,
  params: QueryParams,
  parse: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> => {
  const method = options.method?.toUpperCase() ?? 'GET';
  const url = buildUrl(path, params);
  const urlString = url.toString();
  const useCache = options.cache !== false;

  if (useCache) {
    const cached = get<T>(urlString, method);
    if (cached !== undefined) {
      return cloneIfNeeded(cached);
    }
  }

  try {
    const response = await fetch(urlString, {
      method,
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} for ${urlString}`);
    }

    const parsed = await parse(response);

    if (useCache) {
      set(urlString, parsed, method);
    }

    return cloneIfNeeded(parsed);
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')) {
      throw error;
    }

    throw error;
  }
};

export async function fetchJSON<T = unknown>(
  path: string,
  params: QueryParams = {},
  options: RequestOptions = {},
): Promise<T> {
  return request<T>(path, params, (response) => response.json() as Promise<T>, options);
}

export async function fetchText(
  path: string,
  params: QueryParams = {},
  options: RequestOptions = {},
): Promise<string> {
  return request(path, params, (response) => response.text(), options);
}

export { clear as clearCache } from './cache';
