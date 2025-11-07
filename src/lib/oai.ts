import { toQuery } from './http';
import { UBC_OC_API_KEY, WORKER_BASE } from './config';
import { HttpError } from './http';

const WORKER_OAI_PATH = '/ubc-oai';
const UBC_OAI_DIRECT_BASE = 'https://oc-index.library.ubc.ca/oai';

type QueryRecord = Record<string, string | number | boolean | null | undefined>;

const normaliseHeaders = (init: RequestInit | undefined, defaults: HeadersInit): HeadersInit => {
  if (!init?.headers) {
    return defaults;
  }
  const headers = new Headers(defaults);
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
};

export type OaiTransport =
  | { kind: 'json'; data: unknown }
  | { kind: 'xml'; xml: string };

const buildWorkerUrl = (params: QueryRecord): string => {
  const url = new URL(WORKER_OAI_PATH, WORKER_BASE);
  const nextParams = toQuery(params);
  url.search = nextParams.toString();
  return url.toString();
};

const fetchWorker = async (params: QueryRecord, init?: RequestInit): Promise<unknown> => {
  const url = buildWorkerUrl(params);
  const headers = normaliseHeaders(init, { Accept: 'application/json' });
  const response = await fetch(url, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`Request to ${url} failed with status ${response.status}`, {
      status: response.status,
      url,
      contentType,
      sample: text,
    });
  }
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
};

const fetchDirect = async (params: QueryRecord, init?: RequestInit): Promise<string> => {
  const url = new URL(UBC_OAI_DIRECT_BASE);
  const searchParams = toQuery({
    ...params,
    key: UBC_OC_API_KEY ?? undefined,
    api_key: UBC_OC_API_KEY ?? undefined,
  });
  url.search = searchParams.toString();
  const headers = normaliseHeaders(init, {
    Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
  });
  const response = await fetch(url.toString(), { ...init, headers });
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`Direct request to ${url.toString()} failed with status ${response.status}`, {
      status: response.status,
      url: url.toString(),
      contentType,
      sample: text,
    });
  }
  return text;
};

export const requestUbcOai = async (params: QueryRecord, init?: RequestInit): Promise<OaiTransport> => {
  try {
    const data = await fetchWorker(params, init);
    return { kind: 'json', data };
  } catch (error) {
    if (!(error instanceof HttpError)) {
      throw error;
    }
    if (!UBC_OC_API_KEY) {
      throw error;
    }
    const xml = await fetchDirect(params, init);
    return { kind: 'xml', xml };
  }
};

export const isJsonTransport = (value: OaiTransport): value is { kind: 'json'; data: unknown } => {
  return value.kind === 'json';
};
