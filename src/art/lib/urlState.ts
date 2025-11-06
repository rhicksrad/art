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
