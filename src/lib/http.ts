import { WORKER_BASE } from './config';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue> | undefined;

const SAMPLE_LIMIT = 1200;

const normalizeValue = (value: QueryValue): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  return value ? 'true' : 'false';
};

export const toQuery = (params?: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams;
  for (const [key, rawValue] of Object.entries(params)) {
    const value = normalizeValue(rawValue);
    if (value !== null) searchParams.set(key, value);
  }
  return searchParams;
};

/** Absolute Worker URL for a path + params. A default `ttl` keeps the Worker cache warm. */
export const workerUrl = (path: string, params?: QueryParams): URL => {
  const base = WORKER_BASE.endsWith('/') ? WORKER_BASE : `${WORKER_BASE}/`;
  const url = new URL(path.replace(/^\/+/, ''), base);
  toQuery(params).forEach((value, key) => url.searchParams.set(key, value));
  if (!url.searchParams.has('ttl')) url.searchParams.set('ttl', '3600');
  return url;
};

export interface HttpErrorDetails {
  status: number;
  url: string;
  contentType?: string;
  sample?: string;
}

/** What the Worker returns for any failing upstream (see `forwardBuffered`). */
export type UpstreamDiagnostic = {
  upstream?: string;
  status?: number;
  statusText?: string;
  contentType?: string;
  sample?: string;
  error?: string;
  detail?: string;
};

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly contentType?: string;
  readonly sample?: string;

  constructor(message: string, details: HttpErrorDetails, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = 'HttpError';
    this.status = details.status;
    this.url = details.url;
    this.contentType = details.contentType;
    this.sample = details.sample;
  }

  /** Parsed Worker diagnostic payload, when the body is one. */
  get diagnostic(): UpstreamDiagnostic | undefined {
    if (!this.sample) return undefined;
    try {
      const parsed: unknown = JSON.parse(this.sample);
      if (parsed && typeof parsed === 'object' && ('upstream' in parsed || 'error' in parsed)) {
        return parsed as UpstreamDiagnostic;
      }
    } catch {
      // Not JSON: the raw sample is still shown to the user.
    }
    return undefined;
  }
}

/**
 * Blank out credential parameters before any response text is kept for display. The Worker
 * redacts its own diagnostics; this is a second lock so a key can never reach the page.
 */
export const redactSecrets = (text: string): string =>
  text.replace(/([?&](?:api[-_]?key|key|token|access[-_]?token)=)[^&\s"'<>\\]+/gi, '$1REDACTED');

const readSample = (value: string): string | undefined => {
  if (!value) return undefined;
  const safe = redactSecrets(value);
  return safe.length <= SAMPLE_LIMIT ? safe : `${safe.slice(0, SAMPLE_LIMIT)}…`;
};

const mergeHeaders = (init: RequestInit | undefined, defaults: Record<string, string>): Headers => {
  const headers = new Headers(defaults);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return headers;
};

const request = async (
  url: URL,
  accept: string,
  init?: RequestInit,
): Promise<{ text: string; contentType?: string }> => {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      headers: mergeHeaders(init, { Accept: accept }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new HttpError(
      'The Worker could not be reached (network error or CORS).',
      { status: 0, url: url.toString() },
      { cause: error },
    );
  }
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`Upstream responded with HTTP ${response.status}`, {
      status: response.status,
      url: url.toString(),
      contentType,
      sample: readSample(text),
    });
  }
  return { text, contentType };
};

export async function fetchJSON<T = unknown>(
  path: string,
  params?: QueryParams,
  init?: RequestInit,
): Promise<T> {
  const url = workerUrl(path, params);
  const { text, contentType } = await request(url, 'application/json', init);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new HttpError(
      'The response was not valid JSON.',
      { status: 200, url: url.toString(), contentType, sample: readSample(text) },
      { cause: error },
    );
  }
}

export async function fetchText(
  path: string,
  params?: QueryParams,
  accept = 'application/xml,text/xml,application/atom+xml;q=0.9,*/*;q=0.1',
  init?: RequestInit,
): Promise<string> {
  const { text } = await request(workerUrl(path, params), accept, init);
  return text;
}

export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';
