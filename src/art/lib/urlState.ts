import type { SearchState } from './types';

export type ViewerState = {
  manifest?: string;
  canvas?: string;
  xywh?: [number, number, number, number];
  zoom?: number;
  rotation?: 0 | 90 | 180 | 270;
};

const ROTATION_VALUES: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];

const clampRotation = (value: number | undefined): 0 | 90 | 180 | 270 | undefined => {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  const normalized = ((value % 360) + 360) % 360;
  const match = ROTATION_VALUES.find((r) => r === normalized);
  return match;
};

const parseNumber = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseXYWH = (value: string | null): [number, number, number, number] | undefined => {
  if (!value) return undefined;
  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  return [parts[0], parts[1], parts[2], parts[3]];
};

export function readViewerState(loc: Location = window.location): ViewerState {
  const params = new URLSearchParams(loc.search);

  const manifest = params.get('manifest') ?? undefined;
  const canvas = params.get('canvas') ?? undefined;
  const xywh = parseXYWH(params.get('xywh'));
  const zoom = parseNumber(params.get('zoom'));
  const rotation = clampRotation(parseNumber(params.get('rotation')));

  const state: ViewerState = {};
  if (manifest) state.manifest = manifest;
  if (canvas) state.canvas = canvas;
  if (xywh) state.xywh = xywh;
  if (zoom !== undefined) state.zoom = zoom;
  if (rotation !== undefined) state.rotation = rotation;
  return state;
}

const formatXYWH = (xywh: [number, number, number, number]): string => {
  return xywh.map((value, index) => (index < 2 ? Math.round(value) : Math.max(Math.round(value), 1))).join(',');
};

export function writeViewerState(state: ViewerState, replace = false): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = url.searchParams;

  const assign = (key: string, value: string | undefined) => {
    if (value === undefined || value.length === 0) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  };

  assign('manifest', state.manifest);
  assign('canvas', state.canvas);
  assign('zoom', state.zoom !== undefined ? state.zoom.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : undefined);
  assign('rotation', state.rotation !== undefined ? String(state.rotation) : undefined);
  assign('xywh', state.xywh ? formatXYWH(state.xywh) : undefined);

  const nextUrl = `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}${url.hash}`;
  if (replace) {
    window.history.replaceState(null, '', nextUrl);
  } else {
    window.history.pushState(null, '', nextUrl);
  }
}

type StateParser<TState> = (params: URLSearchParams) => TState;
type StateSerializer<TState> = (state: TState) => URLSearchParams;
type Listener<TState> = (state: TState) => void;

export type UrlStateController<TState> = {
  readState: () => TState;
  writeState: (next: TState, options?: { replace?: boolean }) => void;
  onStateChange: (listener: Listener<TState>) => () => void;
  toSearchParams: (state: TState) => URLSearchParams;
};

const parseBoolean = (value: string | null): boolean | undefined => {
  if (value === null) return undefined;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
};

const parseList = (params: URLSearchParams, key: string): string[] | undefined => {
  const values = params.getAll(key);
  if (!values.length) return undefined;
  const set = new Set<string>();
  for (const entry of values) {
    if (!entry) continue;
    const segments = entry.split(',');
    for (const segment of segments) {
      const normalized = segment.trim();
      if (normalized) set.add(normalized);
    }
  }
  return set.size ? Array.from(set) : undefined;
};

const formatList = (params: URLSearchParams, key: string, values: string[] | undefined): void => {
  if (!values || values.length === 0) return;
  for (const value of values) {
    if (value) params.append(key, value);
  }
};

const parseSearchState = (params: URLSearchParams): SearchState => {
  const q = params.get('q') ?? undefined;
  const classification = parseList(params, 'classification');
  const century = parseList(params, 'century');
  const sort = params.get('sort') as SearchState['sort'] | null;
  const pageValue = parseNumber(params.get('page'));
  const sizeValue = parseNumber(params.get('size'));
  const hasImage = parseBoolean(params.get('hasImage'));

  const state: SearchState = {};
  if (q) state.q = q;
  if (classification) state.classification = classification;
  if (century) state.century = century;
  if (sort && ['relevance', 'title', 'date', 'hasImage'].includes(sort)) state.sort = sort;
  if (pageValue && Number.isFinite(pageValue) && pageValue > 0) state.page = Math.floor(pageValue);
  if (sizeValue && Number.isFinite(sizeValue) && sizeValue > 0) state.size = Math.floor(sizeValue);
  if (hasImage !== undefined) state.hasImage = hasImage;
  return state;
};

const serializeSearchState = (state: SearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  formatList(params, 'classification', state.classification);
  formatList(params, 'century', state.century);
  if (state.sort) params.set('sort', state.sort);
  if (state.page) params.set('page', String(state.page));
  if (state.size) params.set('size', String(state.size));
  if (state.hasImage === true) params.set('hasImage', '1');
  if (state.hasImage === false) params.set('hasImage', '0');
  return params;
};

const paramsFromLocation = (): URLSearchParams => {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
};

export function createUrlState<TState>(
  parser: StateParser<TState>,
  serializer: StateSerializer<TState>,
): UrlStateController<TState> {
  let lastSerialized = serializer(parser(paramsFromLocation())).toString();
  let lastState = parser(paramsFromLocation());
  const listeners = new Set<Listener<TState>>();

  const readState = (): TState => {
    return parser(paramsFromLocation());
  };

  const emit = (state: TState): void => {
    lastState = state;
    lastSerialized = serializer(state).toString();
    listeners.forEach((listener) => listener(state));
  };

  const writeState = (next: TState, options?: { replace?: boolean }): void => {
    if (typeof window === 'undefined') return;
    const params = serializer(next);
    const nextSearch = params.toString();
    const url = new URL(window.location.href);
    url.search = nextSearch;
    const href = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    if (options?.replace) {
      window.history.replaceState(null, '', href);
    } else {
      window.history.pushState(null, '', href);
    }
    emit(next);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      const state = parser(paramsFromLocation());
      const serialized = serializer(state).toString();
      if (serialized === lastSerialized) {
        lastState = state;
        return;
      }
      emit(state);
    });
  }

  const onStateChange = (listener: Listener<TState>): (() => void) => {
    lastState = parser(paramsFromLocation());
    lastSerialized = serializer(lastState).toString();
    listeners.add(listener);
    listener(lastState);
    return () => {
      listeners.delete(listener);
    };
  };

  const toSearchParams = (state: TState): URLSearchParams => {
    return serializer(state);
  };

  return { readState, writeState, onStateChange, toSearchParams };
}

const defaultController = createUrlState<SearchState>(parseSearchState, serializeSearchState);

export const readState = defaultController.readState;
export const writeState = defaultController.writeState;
export const onStateChange = defaultController.onStateChange;
export const toSearchParams = defaultController.toSearchParams;
