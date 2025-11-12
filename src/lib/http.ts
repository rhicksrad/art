import { WORKER_BASE } from './config';
import { fetchWithOfflineFallback } from './offlineFixtures';

export type QueryValue = string | number | boolean | null | undefined;

export type QueryParams = Record<string, QueryValue> | undefined;

const SAMPLE_LIMIT = 400;

const normalizeValue = (value: QueryValue): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
};

export const toQuery = (params?: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if (!params) {
    return searchParams;
  }

  for (const [key, rawValue] of Object.entries(params)) {
    const value = normalizeValue(rawValue);
    if (value !== null) {
      searchParams.set(key, value);
    }
  }

  return searchParams;
};

const buildUrl = (path: string, params?: QueryParams): URL => {
  const url = new URL(path, WORKER_BASE);
  const searchParams = new URLSearchParams(url.search);
  const nextParams = toQuery(params);

  nextParams.forEach((value, key) => {
    searchParams.set(key, value);
  });

  if (!searchParams.has('ttl')) {
    searchParams.set('ttl', '3600');
  }

  url.search = searchParams.toString();
  return url;
};

export interface HttpErrorDetails {
  status: number;
  url: string;
  contentType?: string;
  sample?: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly contentType?: string;
  readonly sample?: string;

  constructor(message: string, details: HttpErrorDetails, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = 'HttpError';
    this.status = details.status;
    this.url = details.url;
    this.contentType = details.contentType;
    this.sample = details.sample;
  }
}

const mergeHeaders = (init: RequestInit | undefined, defaults: HeadersInit): HeadersInit => {
  const provided = init?.headers;
  if (!provided) {
    return defaults;
  }

  const headers = new Headers(defaults);
  new Headers(provided).forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
};

const readSample = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.length <= SAMPLE_LIMIT) {
    return value;
  }
  return `${value.slice(0, SAMPLE_LIMIT)}…`;
};

export async function fetchJSON<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  init?: RequestInit,
): Promise<T> {
  const url = buildUrl(path, params);
  const headers = mergeHeaders(init, { Accept: 'application/json' });

  const response = await fetchWithOfflineFallback(url, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();

  if (!response.ok) {
    throw new HttpError(
      `Request to ${url.toString()} failed with status ${response.status}`,
      {
        status: response.status,
        url: url.toString(),
        contentType,
        sample: readSample(text),
      },
    );
  }

  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new HttpError(
      `Invalid JSON received from ${url.toString()}`,
      {
        status: response.status,
        url: url.toString(),
        contentType,
        sample: readSample(text),
      },
      { cause: error },
    );
  }
}

export async function fetchText(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  accept = 'application/xml,text/xml,application/atom+xml;q=0.9,*/*;q=0.1',
  init?: RequestInit,
): Promise<string> {
  const url = buildUrl(path, params);
  const headers = mergeHeaders(init, { Accept: accept });

  const response = await fetchWithOfflineFallback(url, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();

  if (!response.ok) {
    throw new HttpError(
      `Request to ${url.toString()} failed with status ${response.status}`,
      {
        status: response.status,
        url: url.toString(),
        contentType,
        sample: readSample(text),
      },
    );
  }

  return text;
}
