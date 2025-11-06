import { DVSearchState } from './types';

type DVType = NonNullable<DVSearchState['type']>[number];

const TYPE_VALUES: DVType[] = ['dataset', 'file', 'dataverse'];
const VALID_TYPES = new Set<DVType>(TYPE_VALUES);
const VALID_SORTS = new Set<DVSearchState['sort']>(['name', 'date', 'citation', 'relevance']);
const VALID_ORDER = new Set<DVSearchState['order']>(['asc', 'desc']);
const DEFAULT_PAGE = 1;
const DEFAULT_SIZE = 20;

const listeners = new Set<(state: DVSearchState) => void>();

const parseNumber = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
};

const parseMulti = (params: URLSearchParams, keys: string[]): string[] | undefined => {
  const values = keys.flatMap((key) => params.getAll(key));
  const normalized = Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  return normalized.length > 0 ? normalized : undefined;
};

const filterValidTypes = (types: string[] | undefined): DVSearchState['type'] | undefined => {
  if (!types) return undefined;
  const filtered = types.filter((type): type is DVType => VALID_TYPES.has(type as DVType));
  return filtered.length > 0 ? filtered : undefined;
};

const clampSize = (size: number | undefined): number | undefined => {
  if (size === undefined) return undefined;
  if (size < 10) return 10;
  if (size > 100) return 100;
  return size;
};

const sanitizeState = (state: DVSearchState): DVSearchState => {
  const next: DVSearchState = {};

  if (state.q) {
    const q = state.q.trim();
    if (q.length > 0) next.q = q;
  }

  const type = filterValidTypes(state.type);
  if (type) next.type = type;

  if (state.subject?.length) next.subject = Array.from(new Set(state.subject));
  if (state.dataverse?.length) next.dataverse = Array.from(new Set(state.dataverse));
  if (state.fileType?.length) next.fileType = Array.from(new Set(state.fileType));

  if (typeof state.yearStart === 'number' && Number.isFinite(state.yearStart)) next.yearStart = Math.trunc(state.yearStart);
  if (typeof state.yearEnd === 'number' && Number.isFinite(state.yearEnd)) next.yearEnd = Math.trunc(state.yearEnd);

  if (state.yearStart !== undefined && state.yearEnd !== undefined && state.yearStart > state.yearEnd) {
    const start = next.yearEnd;
    next.yearEnd = next.yearStart;
    next.yearStart = start;
  }

  if (state.sort && VALID_SORTS.has(state.sort)) next.sort = state.sort;
  if (state.order && VALID_ORDER.has(state.order)) next.order = state.order;

  const page = state.page ?? DEFAULT_PAGE;
  next.page = page > 0 ? page : DEFAULT_PAGE;

  const size = clampSize(state.size ?? DEFAULT_SIZE);
  if (size) next.size = size;

  return next;
};

const parseState = (search: string): DVSearchState => {
  const params = new URLSearchParams(search);
  const q = params.get('q') ?? undefined;
  const type = filterValidTypes(parseMulti(params, ['type']));
  const subject = parseMulti(params, ['subject']);
  const dataverse = parseMulti(params, ['dataverse', 'dv']);
  const fileType = parseMulti(params, ['fileType', 'file_type', 'filetype']);
  const yearStart = parseNumber(params.get('yearStart') ?? params.get('year_start'));
  const yearEnd = parseNumber(params.get('yearEnd') ?? params.get('year_end'));
  const sort = params.get('sort') as DVSearchState['sort'] | null;
  const order = params.get('order') as DVSearchState['order'] | null;
  const page = parseNumber(params.get('page')) ?? DEFAULT_PAGE;
  const size = parseNumber(params.get('size') ?? params.get('per_page') ?? params.get('rows')) ?? DEFAULT_SIZE;

  const state: DVSearchState = {
    q: q ?? undefined,
    type,
    subject,
    dataverse,
    fileType,
    yearStart: yearStart ?? undefined,
    yearEnd: yearEnd ?? undefined,
    sort: sort && VALID_SORTS.has(sort) ? sort : undefined,
    order: order && VALID_ORDER.has(order) ? order : undefined,
    page: page > 0 ? page : DEFAULT_PAGE,
    size: clampSize(size) ?? DEFAULT_SIZE,
  };

  return sanitizeState(state);
};

export const readState = (): DVSearchState => {
  return parseState(window.location.search);
};

export const encodeState = (state: DVSearchState): string => {
  const params = new URLSearchParams();
  const next = sanitizeState(state);

  if (next.q) params.set('q', next.q);
  next.type?.forEach((value) => params.append('type', value));
  next.subject?.forEach((value) => params.append('subject', value));
  next.dataverse?.forEach((value) => params.append('dataverse', value));
  next.fileType?.forEach((value) => params.append('fileType', value));
  if (typeof next.yearStart === 'number') params.set('yearStart', String(next.yearStart));
  if (typeof next.yearEnd === 'number') params.set('yearEnd', String(next.yearEnd));
  if (next.sort) params.set('sort', next.sort);
  if (next.order) params.set('order', next.order);
  if (typeof next.page === 'number' && next.page > 1) params.set('page', String(next.page));
  if (typeof next.size === 'number' && next.size !== DEFAULT_SIZE) params.set('size', String(next.size));

  return params.toString();
};

export const writeState = (state: DVSearchState, options: { replace?: boolean } = {}): void => {
  const query = encodeState(state);
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  const method: 'replaceState' | 'pushState' = options.replace ?? true ? 'replaceState' : 'pushState';
  window.history[method](window.history.state, '', url);
};

export const onStateChange = (callback: (state: DVSearchState) => void): (() => void) => {
  listeners.add(callback);
  const handler = (): void => {
    callback(readState());
  };
  window.addEventListener('popstate', handler);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('popstate', handler);
  };
};

export const DEFAULT_STATE: DVSearchState = {
  q: undefined,
  type: ['dataset'],
  page: DEFAULT_PAGE,
  size: DEFAULT_SIZE,
};

export const mergeState = (base: DVSearchState, patch: Partial<DVSearchState>): DVSearchState => {
  return sanitizeState({ ...base, ...patch });
};
