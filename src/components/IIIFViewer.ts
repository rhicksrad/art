import { buildImageUrl, buildThumbnailUrl, ParsedIIIFManifest } from '../lib/iiif';

export type IIIFViewerProps = {
  manifest: ParsedIIIFManifest;
};

export const createIIIFViewer = ({ manifest }: IIIFViewerProps): HTMLElement => {
  const container = document.createElement('section');
  container.className = 'iiif-viewer';

  if (!manifest.canvases.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'iiif-viewer__empty';
    emptyMessage.textContent = 'No canvases with images were found in this manifest.';
    container.appendChild(emptyMessage);
    return container;
  }

  let currentIndex = 0;

  const controls = document.createElement('div');
  controls.className = 'iiif-viewer__controls';

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'iiif-viewer__nav-button';
  prevButton.textContent = 'Previous';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'iiif-viewer__nav-button';
  nextButton.textContent = 'Next';

  controls.append(prevButton, nextButton);

  const main = document.createElement('div');
  main.className = 'iiif-viewer__main';

  const mainImage = document.createElement('img');
  mainImage.className = 'iiif-viewer__image';
  mainImage.loading = 'lazy';

  const canvasLabel = document.createElement('p');
  canvasLabel.className = 'iiif-viewer__canvas-label';

  const canvasMeta = document.createElement('p');
  canvasMeta.className = 'iiif-viewer__canvas-meta';

  main.append(mainImage, canvasLabel, canvasMeta);

  const thumbnailsWrapper = document.createElement('div');
  thumbnailsWrapper.className = 'iiif-viewer__thumbnails';

  const thumbnails: HTMLButtonElement[] = [];

  manifest.canvases.forEach((canvas, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'iiif-viewer__thumbnail';
    button.dataset.index = index.toString();
    button.setAttribute('aria-label', canvas.label ?? `Canvas ${index + 1}`);
    button.setAttribute('aria-pressed', 'false');

    const thumbUrl = buildThumbnailUrl(canvas, 280);
    if (thumbUrl) {
      const thumbImg = document.createElement('img');
      thumbImg.decoding = 'async';
      thumbImg.loading = 'lazy';
      thumbImg.src = thumbUrl;
      thumbImg.alt = '';
      button.appendChild(thumbImg);
    } else {
      const thumbLabel = document.createElement('span');
      thumbLabel.className = 'iiif-viewer__thumbnail-label';
      thumbLabel.textContent = canvas.label ?? `Canvas ${index + 1}`;
      button.appendChild(thumbLabel);
    }

    button.addEventListener('click', () => {
      const newIndex = Number.parseInt(button.dataset.index ?? '0', 10);
      if (!Number.isNaN(newIndex)) {
        currentIndex = newIndex;
        updateView();
      }
    });

    thumbnails.push(button);
    thumbnailsWrapper.appendChild(button);
  });

  const updateView = (): void => {
    const canvas = manifest.canvases[currentIndex];
    const imageUrl = buildImageUrl(canvas, 1600);
    if (imageUrl) {
      mainImage.src = imageUrl;
    } else if (canvas.image) {
      mainImage.src = canvas.image;
    } else {
      mainImage.removeAttribute('src');
    }

    mainImage.alt = canvas.label ?? `Canvas ${currentIndex + 1}`;

    canvasLabel.textContent = canvas.label ?? `Canvas ${currentIndex + 1}`;

    if (canvas.width && canvas.height) {
      canvasMeta.textContent = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} pixels`;
    } else {
      canvasMeta.textContent = '';
    }

    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex >= manifest.canvases.length - 1;

    thumbnails.forEach((thumbnail, index) => {
      const isActive = index === currentIndex;
      thumbnail.classList.toggle('iiif-viewer__thumbnail--active', isActive);
      thumbnail.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  prevButton.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      updateView();
      thumbnails[currentIndex].focus();
    }
  });

  nextButton.addEventListener('click', () => {
    if (currentIndex < manifest.canvases.length - 1) {
      currentIndex += 1;
      updateView();
      thumbnails[currentIndex].focus();
    }
  });

  container.append(controls, main, thumbnailsWrapper);

  updateView();

  return container;
};

export default createIIIFViewer;

