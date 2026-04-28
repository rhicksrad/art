import type { IIIFCanvas } from '../lib/iiif';
import { canvasThumb } from '../lib/iiif';

export type ThumbStripController = {
  setCurrent: (canvasId: string) => void;
  focus: (canvasId?: string) => void;
};

export function ThumbStrip(
  el: HTMLElement,
  canvases: IIIFCanvas[],
  currentId: string,
  onPick: (id: string) => void,
): ThumbStripController {
  el.innerHTML = '';
  el.classList.add('iiif-thumbs__root');

  const list = document.createElement('div');
  list.className = 'iiif-thumbs__list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Canvas thumbnails');

  el.appendChild(list);

  const buttons = new Map<string, HTMLButtonElement>();
  const images = new Map<string, HTMLImageElement>();

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLButtonElement;
        const id = target.dataset.canvasId;
        if (!id) continue;
        const img = images.get(id);
        const thumbUrl = img?.dataset.src;
        if (img && thumbUrl && !img.src) {
          img.src = thumbUrl;
        }
      }
    },
    { root: list, rootMargin: '200px', threshold: 0.1 },
  );

  const renderButton = (canvas: IIIFCanvas, index: number) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'iiif-thumbs__button';
    button.dataset.canvasId = canvas.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', canvas.label);
    button.setAttribute('aria-posinset', String(index + 1));
    button.setAttribute('aria-setsize', String(canvases.length));

    const thumbUrl = canvasThumb(canvas);
    const img = document.createElement('img');
    img.alt = canvas.label;
    img.decoding = 'async';
    img.loading = 'lazy';
    if (thumbUrl) {
      img.dataset.src = thumbUrl;
    } else {
      img.alt = `${canvas.label} (no preview available)`;
      img.className = 'iiif-thumbs__placeholder';
    }

    const label = document.createElement('span');
    label.className = 'iiif-thumbs__label';
    label.textContent = canvas.label;

    button.append(img, label);
    list.appendChild(button);

    buttons.set(canvas.id, button);
    images.set(canvas.id, img);

    intersectionObserver.observe(button);

    button.addEventListener('click', () => {
      onPick(canvas.id);
    });
  };

  canvases.forEach(renderButton);

  const updateCurrent = (canvasId: string) => {
    for (const [id, button] of buttons.entries()) {
      const isCurrent = id === canvasId;
      button.classList.toggle('is-active', isCurrent);
      button.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    }
  };

  updateCurrent(currentId);

  const focusCanvas = (canvasId?: string) => {
    if (canvasId && buttons.has(canvasId)) {
      buttons.get(canvasId)!.focus();
      return;
    }
    const current = buttons.get(currentId);
    if (current) {
      current.focus();
      return;
    }
    const first = buttons.values().next().value as HTMLButtonElement | undefined;
    first?.focus();
  };

  list.addEventListener('keydown', (event) => {
    const key = event.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      return;
    }
    event.preventDefault();
    const entries = Array.from(buttons.values());
    const active = document.activeElement as HTMLButtonElement | null;
    let index = active ? entries.indexOf(active) : -1;
    if (key === 'Home') {
      index = 0;
    } else if (key === 'End') {
      index = entries.length - 1;
    } else if (key === 'ArrowRight' || key === 'ArrowDown') {
      index = Math.min(entries.length - 1, index + 1);
    } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
      index = Math.max(0, index - 1);
    }
    const nextButton = entries[index];
    nextButton?.focus();
    if (nextButton) {
      const id = nextButton.dataset.canvasId;
      if (id) {
        updateCurrent(id);
        onPick(id);
      }
    }
  });

  return {
    setCurrent(canvasId: string) {
      currentId = canvasId;
      updateCurrent(canvasId);
    },
    focus(canvasId?: string) {
      focusCanvas(canvasId);
    },
  };
}
