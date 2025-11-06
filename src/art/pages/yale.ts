import type { IIIFCanvas, IIIFManifest } from '../lib/iiif';
import { loadManifest } from '../lib/iiif';
import type { ViewerController, ViewerHooks } from '../components/IIIFViewer';
import { IIIFViewer } from '../components/IIIFViewer';
import type { ThumbStripController } from '../components/ThumbStrip';
import { ThumbStrip } from '../components/ThumbStrip';
import { MetaPanel } from '../components/MetaPanel';
import type { ViewerState } from '../lib/urlState';
import { readViewerState, writeViewerState } from '../lib/urlState';

const DEFAULT_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const editableTags = ['INPUT', 'TEXTAREA'];
  return editableTags.includes(target.tagName) || target.isContentEditable;
};

type StatePatch = Partial<ViewerState>;

export default { mount };

function mount(root: HTMLElement): void {
  root.classList.add('yale-view');
  root.innerHTML = '';

  let state = readViewerState();
  if (!state.manifest) {
    state = { ...state, manifest: DEFAULT_MANIFEST };
  }

  const patchState = (patch: StatePatch, replace = false) => {
    const next: ViewerState = { ...state };
    (Object.entries(patch) as [keyof ViewerState, ViewerState[keyof ViewerState]][]).forEach(([key, value]) => {
      if (value === undefined) {
        delete (next as Record<string, unknown>)[key as string];
      } else {
        (next as Record<string, unknown>)[key as string] = value as never;
      }
    });
    state = next;
    writeViewerState(state, replace);
  };

  const header = document.createElement('header');
  header.className = 'yale-view__header';

  const title = document.createElement('h1');
  title.textContent = 'IIIF Viewer';

  const controls = document.createElement('form');
  controls.className = 'yale-view__form';
  controls.noValidate = true;

  const manifestInput = document.createElement('input');
  manifestInput.type = 'url';
  manifestInput.placeholder = 'https://…/manifest.json';
  manifestInput.value = state.manifest ?? DEFAULT_MANIFEST;
  manifestInput.id = 'manifestUrl';
  manifestInput.setAttribute('aria-label', 'Manifest URL');

  const loadButton = document.createElement('button');
  loadButton.type = 'submit';
  loadButton.id = 'loadManifest';
  loadButton.textContent = 'Load manifest';

  controls.append(manifestInput, loadButton);

  const statusEl = document.createElement('p');
  statusEl.className = 'yale-view__status';

  header.append(title, controls, statusEl);

  const layout = document.createElement('div');
  layout.className = 'yale-view__layout';

  const viewerEl = document.createElement('div');
  viewerEl.className = 'yale-view__viewer';
  viewerEl.id = 'viewer';

  const thumbsEl = document.createElement('div');
  thumbsEl.className = 'yale-view__thumbs';
  thumbsEl.id = 'thumbs';

  const metaEl = document.createElement('aside');
  metaEl.className = 'yale-view__meta';
  metaEl.id = 'meta';

  layout.append(viewerEl, thumbsEl, metaEl);
  root.append(header, layout);

  let controller: ViewerController | null = null;
  let thumbController: ThumbStripController | null = null;
  let currentManifest: IIIFManifest | null = null;
  let currentCanvas: IIIFCanvas | null = null;
  let abortController: AbortController | null = null;
  let initialLoad = true;

  const setStatus = (text: string, isError = false) => {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', isError);
  };

  const updateMeta = () => {
    if (currentManifest && currentCanvas) {
      MetaPanel(metaEl, currentManifest, currentCanvas);
    } else {
      metaEl.innerHTML = '<p class="iiif-meta__empty">Load a manifest to view metadata.</p>';
    }
  };

  setStatus('Drop a manifest URL or paste one above to load a IIIF manifest.');
  updateMeta();

  const viewerHooks: ViewerHooks = {
    onViewChange: (xywh: [number, number, number, number], zoom: number, rotation: 0 | 90 | 180 | 270) => {
      patchState({ xywh, zoom, rotation }, true);
    },
    onCanvasChange: (canvasId: string) => {
      if (!currentManifest) return;
      const next = currentManifest.canvases.find((canvas) => canvas.id === canvasId);
      if (!next) return;
      currentCanvas = next;
      thumbController?.setCurrent(canvasId);
      patchState({ canvas: canvasId, xywh: undefined, zoom: undefined }, false);
      setStatus(`${currentManifest.label} — ${next.label}`);
      updateMeta();
    },
  };

  const applyCanvas = (canvas: IIIFCanvas, preserveView = false) => {
    currentCanvas = canvas;
    const view = preserveView && state.canvas === canvas.id
      ? { xywh: state.xywh, zoom: state.zoom, rotation: state.rotation }
      : { rotation: state.rotation };
    const isInitial = !controller;
    if (!controller) {
      controller = IIIFViewer(viewerEl, canvas, viewerHooks, view);
    } else {
      controller.setCanvas(canvas, view);
    }
    thumbController?.setCurrent(canvas.id);
    if (isInitial) {
      patchState({ canvas: canvas.id, xywh: view.xywh, zoom: view.zoom, rotation: view.rotation }, initialLoad);
    }
    updateMeta();
    if (currentManifest) {
      setStatus(`${currentManifest.label} — ${canvas.label}`);
    }
  };

  const handleCanvasPick = (canvasId: string) => {
    if (!currentManifest) return;
    const next = currentManifest.canvases.find((canvas) => canvas.id === canvasId);
    if (!next || next === currentCanvas) return;
    applyCanvas(next, state.canvas === canvasId);
  };

  const load = async (url: string, replaceHistory = false) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus('Enter a IIIF manifest URL to begin.', true);
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    setStatus('Loading manifest…');
    viewerEl.classList.add('is-loading');
    thumbsEl.innerHTML = '';
    metaEl.innerHTML = '';
    try {
      const manifest = await loadManifest(trimmed, abortController.signal);
      currentManifest = manifest;
      const canvases = manifest.canvases;
      if (canvases.length === 0) {
        throw new Error('The manifest did not contain any canvases.');
      }
      const requestedCanvasId = state.canvas;
      const initialCanvas = requestedCanvasId
        ? canvases.find((canvas) => canvas.id === requestedCanvasId) ?? canvases[0]
        : canvases[0];
      thumbController = ThumbStrip(thumbsEl, canvases, initialCanvas.id, handleCanvasPick);
      patchState({ manifest: trimmed }, replaceHistory || initialLoad);
      applyCanvas(initialCanvas, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
      viewerEl.innerHTML = '<p class="iiif-viewer__message">Unable to load manifest.</p>';
      controller = null;
      thumbController = null;
      currentManifest = null;
      currentCanvas = null;
    } finally {
      viewerEl.classList.remove('is-loading');
      abortController = null;
      initialLoad = false;
    }
  };

  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = manifestInput.value || DEFAULT_MANIFEST;
    load(url, false).catch((error) => {
      console.error(error);
    });
  });

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    root.classList.remove('is-drop-target');
    const data = event.dataTransfer;
    const url = data?.getData('text/uri-list') || data?.getData('text/plain');
    if (url) {
      manifestInput.value = url.trim();
      void load(manifestInput.value, false);
    }
  };

  root.addEventListener('dragover', (event) => {
    event.preventDefault();
    root.classList.add('is-drop-target');
  });
  root.addEventListener('dragleave', (event) => {
    if (event.target === root) {
      root.classList.remove('is-drop-target');
    }
  });
  root.addEventListener('drop', handleDrop);

  window.addEventListener('keydown', (event) => {
    if (!currentManifest || !currentCanvas) return;
    if (isEditableTarget(event.target)) return;
    const index = currentManifest.canvases.findIndex((canvas) => canvas.id === currentCanvas?.id);
    if (event.key === '[' || event.key === 'ArrowLeft') {
      if (index > 0) {
        event.preventDefault();
        handleCanvasPick(currentManifest.canvases[index - 1].id);
      }
    } else if (event.key === ']' || event.key === 'ArrowRight') {
      if (index < currentManifest.canvases.length - 1) {
        event.preventDefault();
        handleCanvasPick(currentManifest.canvases[index + 1].id);
      }
    } else if (event.key.toLowerCase() === 'h') {
      event.preventDefault();
      controller?.goHome();
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      const nextRotation = ((state.rotation ?? 0) + 90) % 360 as 0 | 90 | 180 | 270;
      controller?.setRotation(nextRotation);
    }
  });

  const initialManifest = state.manifest ?? DEFAULT_MANIFEST;
  manifestInput.value = initialManifest;
  void load(initialManifest, true);
}
