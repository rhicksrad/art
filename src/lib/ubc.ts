import { fetchJSON } from './http';

const STORAGE_KEY = 'ubcIndex';
const FALLBACK_INDEX = 'aaah';

type CollectionsResponse = {
  data?: Record<string, unknown>;
};

const readFromStorage = (): string | undefined => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return undefined;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value || undefined;
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
    // ignore quota and privacy errors
  }
};

const pickIndex = (data: CollectionsResponse | undefined): string => {
  const source = data?.data;
  if (!source || typeof source !== 'object') {
    return FALLBACK_INDEX;
  }

  for (const value of Object.values(source)) {
    if (typeof value === 'string' && /^[A-Za-z]/.test(value)) {
      return value;
    }
  }

  return FALLBACK_INDEX;
};

export const getUbcIndex = async (): Promise<string> => {
  const cached = readFromStorage();
  if (cached) {
    return cached;
  }

  const response = await fetchJSON<CollectionsResponse>('/ubc/collections', { ttl: 3600 });
  const index = pickIndex(response);
  writeToStorage(index);
  return index;
};

type SearchOptions = {
  size?: number;
  from?: number;
  sort?: string;
};

export const searchUbc = async (
  q: string,
  opts: SearchOptions = {},
): Promise<unknown> => {
  const trimmed = q.trim();
  const index = await getUbcIndex();
  const params: Record<string, string | number> = { q: trimmed };

  if (typeof opts.size === 'number' && Number.isFinite(opts.size)) {
    params.size = opts.size;
  }
  if (typeof opts.from === 'number' && Number.isFinite(opts.from) && opts.from >= 0) {
    params.from = opts.from;
  }
  if (typeof opts.sort === 'string' && opts.sort.trim()) {
    params.sort = opts.sort.trim();
  }

  return fetchJSON(`/ubc/search/8.5/${index}`, params);
};
