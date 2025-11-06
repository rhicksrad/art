import type { IIIFCanvas } from '../lib/iiif';

type ViewTuple = [number, number, number, number];

type ViewState = {
  xywh?: ViewTuple;
  zoom?: number;
  rotation?: 0 | 90 | 180 | 270;
};

export type ViewerHooks = {
  onViewChange?: (xywh: ViewTuple, zoom: number, rotation: 0 | 90 | 180 | 270) => void;
  onCanvasChange?: (canvasId: string) => void;
};

export type ViewerController = {
  setCanvas: (canvas: IIIFCanvas, viewStateOverride?: ViewState) => void;
  setRotation: (rotation: 0 | 90 | 180 | 270) => void;
  goHome: () => void;
};

const OSD_URL =
  'https://cdn.jsdelivr.net/npm/openseadragon@4/dist/openseadragon.min.js';

const PREFERRED_TILE_PREFIX =
  'https://cdn.jsdelivr.net/npm/openseadragon@4/dist/images/';

let osdLoader: Promise<any> | null = null;

const loadOpenSeadragon = async (): Promise<any> => {
  if (osdLoader) return osdLoader;
  osdLoader = import(/* @vite-ignore */ OSD_URL)
    .then(() => {
      const globalNs = (globalThis as typeof globalThis & { OpenSeadragon?: any }).OpenSeadragon;
      if (!globalNs) {
        throw new Error('OpenSeadragon did not expose a global namespace.');
      }
      return globalNs;
    })
    .catch((error) => {
      osdLoader = null;
      throw error;
    });
  return osdLoader;
};

const clampRotation = (rotation: number): 0 | 90 | 180 | 270 => {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90) return 90;
  if (normalized === 180) return 180;
  if (normalized === 270) return 270;
  return 0;
};

const canvasDimensions = (canvas: IIIFCanvas): { width: number; height: number } => {
  if (canvas.image) {
    return { width: canvas.image.width, height: canvas.image.height };
  }
  return { width: Math.max(canvas.width, 1), height: Math.max(canvas.height, 1) };
};

const createButton = (label: string, icon: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'iiif-viewer__control';
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  return button;
};

const reduceMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export function IIIFViewer(
  root: HTMLElement,
  initialCanvas: IIIFCanvas,
  hooks: ViewerHooks = {},
  initialView: ViewState = {},
): ViewerController {
  root.innerHTML = '';
  root.classList.add('iiif-viewer__root');

  const message = document.createElement('p');
  message.className = 'iiif-viewer__message';
  message.setAttribute('role', 'status');

  const stageWrapper = document.createElement('div');
  stageWrapper.className = 'iiif-viewer__stage';
  stageWrapper.setAttribute('role', 'application');
  stageWrapper.setAttribute('aria-label', 'IIIF deep zoom viewer');

  const controls = document.createElement('div');
  controls.className = 'iiif-viewer__controls';

  const zoomIn = createButton('Zoom in', '+');
  const zoomOut = createButton('Zoom out', '−');
  const reset = createButton('Reset view', '⤺');
  const rotateLeft = createButton('Rotate counter-clockwise', '⟲');
  const rotateRight = createButton('Rotate clockwise', '⟳');

  controls.append(zoomIn, zoomOut, reset, rotateLeft, rotateRight);
  root.append(stageWrapper, controls, message);

  let viewer: any | null = null;
  let osd: any | null = null;
  let canvas = initialCanvas;
  let ready = false;
  let pendingView: ViewState | undefined = { ...initialView };
  let lastView: ViewState = { ...initialView };
  let storedRotation: 0 | 90 | 180 | 270 = initialView.rotation ?? 0;

  const hideMessage = () => {
    message.hidden = true;
    message.textContent = '';
  };

  const showMessage = (text: string) => {
    message.hidden = false;
    message.textContent = text;
  };

  const destroyViewer = () => {
    if (viewer && typeof viewer.destroy === 'function') {
      viewer.destroy();
    }
    viewer = null;
    stageWrapper.innerHTML = '';
    ready = false;
  };

  const emitViewChange = () => {
    if (!viewer || !ready) return;
    const viewport = viewer.viewport;
    if (!viewport) return;
    const dims = canvasDimensions(canvas);
    const bounds = viewport.getBounds?.(true);
    if (!bounds) return;
    const rotation = clampRotation(viewport.getRotation?.() ?? storedRotation);
    const xywh: ViewTuple = [
      Math.max(0, Math.round(bounds.x * dims.width)),
      Math.max(0, Math.round(bounds.y * dims.height)),
      Math.max(1, Math.round(bounds.width * dims.width)),
      Math.max(1, Math.round(bounds.height * dims.height)),
    ];
    const zoom = Number.parseFloat((viewport.getZoom?.(true) ?? 1).toFixed(4));
    storedRotation = rotation;
    lastView = { xywh, zoom, rotation };
    hooks.onViewChange?.(xywh, zoom, rotation);
  };

  const applyView = () => {
    if (!viewer || !osd) return;
    const viewport = viewer.viewport;
    if (!viewport) return;
    const dims = canvasDimensions(canvas);
    const rotation =
      pendingView?.rotation ?? lastView.rotation ?? storedRotation ?? (initialView.rotation ?? 0);
    storedRotation = rotation;
    viewport.setRotation?.(rotation);

    const xywh = pendingView?.xywh ?? lastView.xywh;
    if (xywh) {
      const rect = new osd.Rect(xywh[0] / dims.width, xywh[1] / dims.height, xywh[2] / dims.width, xywh[3] / dims.height);
      viewport.fitBounds(rect, true);
    } else {
      viewport.goHome?.(true);
    }

    const zoom = pendingView?.zoom ?? lastView.zoom;
    if (zoom) {
      viewport.zoomTo?.(zoom, undefined, true);
    }

    pendingView = undefined;
    emitViewChange();
  };

  const openTileSource = async (nextCanvas: IIIFCanvas) => {
    canvas = nextCanvas;
    const tileSource = (() => {
      if (!nextCanvas.image) return null;
      if (nextCanvas.image.service) {
        return `${nextCanvas.image.service}/info.json`;
      }
      return {
        type: 'image',
        url: nextCanvas.image.best,
        buildPyramid: false,
        width: nextCanvas.image.width,
        height: nextCanvas.image.height,
        crossOriginPolicy: 'Anonymous',
      };
    })();

    destroyViewer();

    if (!tileSource) {
      showMessage('No image service is available for this canvas.');
      return;
    }

    showMessage('Loading canvas…');
    const container = document.createElement('div');
    container.className = 'iiif-viewer__osd';
    stageWrapper.replaceChildren(container);

    try {
      osd = await loadOpenSeadragon();
    } catch (error) {
      console.error(error);
      showMessage('Unable to load deep-zoom viewer.');
      return;
    }

    viewer = osd({
      element: container,
      tileSources: tileSource,
      prefixUrl: PREFERRED_TILE_PREFIX,
      showZoomControl: false,
      showHomeControl: false,
      showFullPageControl: false,
      showNavigator: false,
      crossOriginPolicy: 'Anonymous',
      animationTime: reduceMotion() ? 0 : 1.2,
      gestureSettingsMouse: {
        clickToZoom: true,
        dblClickToZoom: true,
        flickEnabled: false,
      },
      gestureSettingsTouch: {
        pinchToZoom: true,
      },
    });

    ready = false;

    viewer.addHandler('open', () => {
      ready = true;
      hideMessage();
      applyView();
    });
    const handleMutate = () => {
      if (ready) emitViewChange();
    };
    viewer.addHandler('animation-finish', handleMutate);
    viewer.addHandler('rotate', handleMutate);
    viewer.addHandler('zoom', handleMutate);
    viewer.addHandler('pan', handleMutate);
  };

  const adjustZoom = (factor: number) => {
    if (!viewer || !viewer.viewport) return;
    viewer.viewport.zoomBy(factor);
    viewer.viewport.applyConstraints?.();
  };

  zoomIn.addEventListener('click', () => adjustZoom(1.3));
  zoomOut.addEventListener('click', () => adjustZoom(0.77));
  reset.addEventListener('click', () => {
    pendingView = { rotation: storedRotation };
    viewer?.viewport?.goHome?.();
  });
  rotateLeft.addEventListener('click', () => {
    const nextRotation = clampRotation((viewer?.viewport?.getRotation?.() ?? storedRotation) - 90);
    if (viewer && viewer.viewport) {
      viewer.viewport.setRotation(nextRotation);
    } else {
      pendingView = { ...(pendingView ?? lastView), rotation: nextRotation };
    }
    storedRotation = nextRotation;
    emitViewChange();
  });
  rotateRight.addEventListener('click', () => {
    const nextRotation = clampRotation((viewer?.viewport?.getRotation?.() ?? storedRotation) + 90);
    if (viewer && viewer.viewport) {
      viewer.viewport.setRotation(nextRotation);
    } else {
      pendingView = { ...(pendingView ?? lastView), rotation: nextRotation };
    }
    storedRotation = nextRotation;
    emitViewChange();
  });

  void openTileSource(initialCanvas);

  return {
    setCanvas(next, viewOverride) {
      pendingView = viewOverride ? { ...viewOverride } : { rotation: storedRotation };
      lastView = viewOverride ? { ...viewOverride } : { rotation: storedRotation };
      void openTileSource(next);
      hooks.onCanvasChange?.(next.id);
    },
    setRotation(rotation) {
      const nextRotation = clampRotation(rotation);
      storedRotation = nextRotation;
      if (viewer && viewer.viewport) {
        viewer.viewport.setRotation(nextRotation);
        emitViewChange();
      } else {
        pendingView = { ...(pendingView ?? lastView), rotation: nextRotation };
      }
    },
    goHome() {
      pendingView = { rotation: storedRotation };
      viewer?.viewport?.goHome?.();
    },
  };
}
