export type SearchState = {
  q?: string;
  classification?: string[];
  century?: string[];
  sort?: 'relevance' | 'title' | 'date' | 'hasImage';
  page?: number;
  size?: number;
  hasImage?: boolean;
};

function cleanArray(values: (string | null | undefined)[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const uniq = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const piece of value.split(',')) {
      const trimmed = piece.trim();
      if (trimmed) {
        uniq.add(trimmed);
      }
    }
  }
  return uniq.size > 0 ? Array.from(uniq) : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value == null) return undefined;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  return undefined;
}

export function readState(loc: Location = window.location): SearchState {
  const params = new URLSearchParams(loc.search);
  const q = params.get('q')?.trim();
  const classification = cleanArray(params.getAll('classification'));
  const century = cleanArray(params.getAll('century'));
  const sortParam = params.get('sort')?.trim() as SearchState['sort'] | undefined;
  const sort = sortParam && ['relevance', 'title', 'date', 'hasImage'].includes(sortParam)
    ? sortParam
    : undefined;
  const page = parseNumber(params.get('page'));
  const size = parseNumber(params.get('size'));
  const hasImage = parseBoolean(params.get('hasImage'));

  const state: SearchState = {};
  if (q) state.q = q;
  if (classification) state.classification = classification;
  if (century) state.century = century;
  if (sort) state.sort = sort;
  if (page) state.page = page;
  if (size) state.size = size;
  if (hasImage !== undefined) state.hasImage = hasImage;
  return state;
}

function applyParams(params: URLSearchParams, key: string, values: string[] | undefined): void {
  if (!values || values.length === 0) return;
  for (const value of values) {
    params.append(key, value);
  }
}

export function writeState(state: SearchState, replace = false): void {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  applyParams(params, 'classification', state.classification);
  applyParams(params, 'century', state.century);
  if (state.sort) params.set('sort', state.sort);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  if (state.size && state.size > 0) params.set('size', String(state.size));
  if (state.hasImage !== undefined) params.set('hasImage', state.hasImage ? '1' : '0');

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash ?? ''}`;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](state, '', url);
}

export function onStateChange(cb: (s: SearchState) => void): () => void {
  const handler = (): void => {
    cb(readState());
  };
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
