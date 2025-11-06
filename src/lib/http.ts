import { WORKER_BASE } from "./config";

type QueryParamValue = string | number | boolean;

type QueryParams = Record<string, QueryParamValue>;

const toSearchParams = (params: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return searchParams;
};

const buildUrl = (path: string, params: QueryParams = {}): URL => {
  const queryParams: QueryParams = { ...params };

  if (!Object.prototype.hasOwnProperty.call(queryParams, "ttl")) {
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

const request = async <T>(
  path: string,
  params: QueryParams,
  parse: (response: Response) => Promise<T>
): Promise<T> => {
  const url = buildUrl(path, params);
  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status} for ${url.toString()}`
    );
  }

  return parse(response);
};

export async function fetchJSON<T = unknown>(
  path: string,
  params: QueryParams = {}
): Promise<T> {
  return request<T>(path, params, (response) => response.json() as Promise<T>);
}

export async function fetchText(
  path: string,
  params: QueryParams = {}
): Promise<string> {
  return request(path, params, (response) => response.text());
}
