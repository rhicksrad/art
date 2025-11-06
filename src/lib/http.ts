import { WORKER_BASE } from "./config";

type QueryParams = Record<string, string | number | boolean>;

const toSearchParams = (params: QueryParams): URLSearchParams => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  return searchParams;
};

export async function fetchJSON<T = unknown>(
  path: string,
  params: QueryParams = {}
): Promise<T> {
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

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status} for ${url.toString()}`
    );
  }

  return response.json() as Promise<T>;
}
