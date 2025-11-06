import { SearchState } from './types';

type Listener = (state: SearchState) => void;

const listeners = new Set<Listener>();

const DEFAULTS: Required<Pick<SearchState, 'page' | 'size' | 'hasImage' | 'sort'>> = {
  page: 1,
  size: 30,
  hasImage: true,
  sort: 'relevance',
};

const isTruthy = (value: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const parseNumber = (value: string | null, fallback?: number): number | undefined => {
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
};

const parseArray = (params: URLSearchParams, key: string): string[] | undefined => {
  const values = params.getAll(key).map((entry) => entry.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

let currentState: SearchState | null = null;

export const readState = (): SearchState => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q')?.trim() || undefined;
  const classification = parseArray(params, 'classification');
  const century = parseArray(params, 'century');
  const sortParam = params.get('sort') as SearchState['sort'] | null;
  const sort: SearchState['sort'] = sortParam && ['relevance', 'title', 'date', 'hasImage'].includes(sortParam)
    ? sortParam
    : DEFAULTS.sort;
  const page = clamp(parseNumber(params.get('page'), DEFAULTS.page) ?? DEFAULTS.page, 1, 9999);
  const size = clamp(parseNumber(params.get('size'), DEFAULTS.size) ?? DEFAULTS.size, 10, 100);
  const hasImageParam = params.has('hasImage') ? params.get('hasImage') : null;
  const hasImage = hasImageParam === null ? DEFAULTS.hasImage : isTruthy(hasImageParam);

  const state: SearchState = {
    q,
    classification,
    century,
    sort,
    page,
    size,
    hasImage,
  };

  currentState = state;
  return state;
};

const toSearchParams = (state: SearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const value of state.classification ?? []) {
    params.append('classification', value);
  }
  for (const value of state.century ?? []) {
    params.append('century', value);
  }
  const size = state.size ?? DEFAULTS.size;
  if (size !== DEFAULTS.size) params.set('size', String(clamp(size, 10, 100)));
  const page = state.page ?? DEFAULTS.page;
  if (page !== DEFAULTS.page) params.set('page', String(Math.max(1, page)));
  const sort = state.sort ?? DEFAULTS.sort;
  if (sort !== DEFAULTS.sort) params.set('sort', sort);
  const hasImage = state.hasImage ?? DEFAULTS.hasImage;
  if (hasImage !== DEFAULTS.hasImage) params.set('hasImage', hasImage ? '1' : '0');
  return params;
};

const notify = (state: SearchState): void => {
  for (const listener of listeners) {
    listener(state);
  }
};

export const writeState = (state: SearchState, options: { replace?: boolean } = {}): void => {
  const params = toSearchParams(state);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', url);
  currentState = { ...state };
  notify(currentState);
};

window.addEventListener('popstate', () => {
  const next = readState();
  notify(next);
});

export const onStateChange = (listener: Listener): (() => void) => {
  listeners.add(listener);
  if (currentState == null) {
    currentState = readState();
  }
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
};
