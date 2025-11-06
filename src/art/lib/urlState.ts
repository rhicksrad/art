export type SearchState = {
  q?: string;
  classification?: string[];
  century?: string[];
  sort?: 'relevance' | 'title' | 'date' | 'hasImage';
  page?: number;
  size?: number;
  hasImage?: boolean;
};

const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'off']);

const parseNumber = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const parseArray = (values: string[]): string[] | undefined => {
  const all: string[] = [];
  for (const value of values) {
    const parts = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    all.push(...parts);
  }
  if (all.length === 0) {
    return undefined;
  }
  const unique = Array.from(new Set(all));
  return unique.length > 0 ? unique : undefined;
};

const toSearchParams = (state: SearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  const writeMulti = (key: 'classification' | 'century', values?: string[]) => {
    if (!values || values.length === 0) return;
    values.forEach((value) => params.append(key, value));
  };
  writeMulti('classification', state.classification);
  writeMulti('century', state.century);
  if (state.sort) params.set('sort', state.sort);
  if (typeof state.page === 'number' && state.page > 1) {
    params.set('page', String(Math.trunc(state.page)));
  } else if (state.page === 1) {
    params.set('page', '1');
  }
  if (typeof state.size === 'number' && state.size > 0) {
    params.set('size', String(Math.trunc(state.size)));
  }
  if (typeof state.hasImage === 'boolean') {
    params.set('hasImage', state.hasImage ? '1' : '0');
  }
  return params;
};

export function readState(loc: Location = window.location): SearchState {
  const params = new URLSearchParams(loc.search);
  const classification = parseArray(params.getAll('classification'));
  const century = parseArray(params.getAll('century'));
  const sort = params.get('sort') as SearchState['sort'] | null;
  const size = parseNumber(params.get('size'));
  const page = parseNumber(params.get('page'));
  const hasImageParam = params.get('hasImage');
  let hasImage: boolean | undefined;
  if (hasImageParam) {
    const lower = hasImageParam.toLowerCase();
    if (truthyValues.has(lower)) hasImage = true;
    else if (falsyValues.has(lower)) hasImage = false;
  }

  const state: SearchState = {};
  const q = params.get('q');
  if (q && q.trim()) state.q = q.trim();
  if (classification) state.classification = classification;
  if (century) state.century = century;
  if (sort && ['relevance', 'title', 'date', 'hasImage'].includes(sort)) {
    state.sort = sort;
  }
  if (typeof size === 'number' && size > 0) state.size = size;
  if (typeof page === 'number' && page > 0) state.page = page;
  if (typeof hasImage === 'boolean') state.hasImage = hasImage;
  return state;
}

export function writeState(state: SearchState, replace = false): void {
  const params = toSearchParams(state);
  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
}

export function onStateChange(cb: (s: SearchState) => void): () => void {
  const handler = () => cb(readState());
  window.addEventListener('popstate', handler);
  cb(readState());
  return () => window.removeEventListener('popstate', handler);
}

export { toSearchParams as _internalStateToSearchParams };
