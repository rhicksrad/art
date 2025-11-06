import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { fetchJSON } from '../lib/http';
import { parseManifest, toItemCards } from '../adapters/yale';

const DEFAULT_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Yale / IIIF Viewer';

  const status = document.createElement('p');
  status.className = 'page__status';

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const previewContainer = document.createElement('div');
  previewContainer.className = 'iiif-preview';

  const thumbnailsContainer = document.createElement('div');
  thumbnailsContainer.className = 'thumbnail-grid';

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'card-grid';

  const alertContainer = document.createElement('div');

  el.append(heading, status, formContainer, alertContainer, previewContainer, thumbnailsContainer, cardsContainer);

  const searchParams = new URLSearchParams(window.location.search);
  let currentUrl = searchParams.get('url') ?? DEFAULT_MANIFEST;

  const updateLocation = (): void => {
    const params = new URLSearchParams();
    if (currentUrl && currentUrl !== DEFAULT_MANIFEST) {
      params.set('url', currentUrl);
    }
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: 'url',
        label: 'Manifest URL',
        type: 'text',
        placeholder: 'https://…',
        value: currentUrl,
      },
    ],
    submitLabel: 'Load manifest',
    onSubmit: (values) => {
      currentUrl = values.url && values.url.length > 0 ? values.url : DEFAULT_MANIFEST;
      updateLocation();
      void load();
    },
  });

  formContainer.appendChild(form);

  const renderPreview = (imgUrl: string | undefined): void => {
    previewContainer.innerHTML = '';
    if (!imgUrl) {
      status.textContent = 'Manifest loaded but no image found.';
      return;
    }
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = 'Manifest preview';
    figure.appendChild(img);
    previewContainer.appendChild(figure);
  };

  const renderThumbnails = (images: Array<{ id: string; title: string; img?: string }>): void => {
    thumbnailsContainer.innerHTML = '';
    if (images.length === 0) {
      return;
    }
    images.forEach((canvas) => {
      if (!canvas.img) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thumbnail';
      const image = document.createElement('img');
      image.src = canvas.img;
      image.alt = canvas.title;
      button.appendChild(image);
      button.addEventListener('click', () => {
        renderPreview(canvas.img);
      });
      thumbnailsContainer.appendChild(button);
    });
  };

  const renderCards = (items: ReturnType<typeof toItemCards>): void => {
    cardsContainer.innerHTML = '';
    if (items.length === 0) {
      return;
    }
    items.forEach((item) => {
      cardsContainer.appendChild(renderItemCard(item));
    });
  };

  let isLoading = false;
  const load = async (): Promise<void> => {
    if (isLoading) return;
    isLoading = true;
    alertContainer.innerHTML = '';
    status.textContent = 'Loading manifest…';
    previewContainer.innerHTML = '';
    thumbnailsContainer.innerHTML = '';
    cardsContainer.innerHTML = '';

    try {
      const response = await fetchJSON('/yale-iiif', { url: currentUrl });
      const manifest = parseManifest(response);
      status.textContent = manifest.label ?? 'Manifest loaded';
      renderPreview(manifest.canvases[0]?.image ?? manifest.canvases[0]?.thumbnail);
      const thumbnailItems = manifest.canvases.map((canvas, index) => ({
        id: canvas.id || `canvas-${index}`,
        title: canvas.label ?? `Canvas ${index + 1}`,
        img: canvas.image ?? canvas.thumbnail,
      }));
      renderThumbnails(thumbnailItems);
      const cards = toItemCards(response);
      renderCards(cards);
    } catch (error) {
      status.textContent = 'Unable to load manifest.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
    } finally {
      isLoading = false;
    }
  };

  setValues({ url: currentUrl });
  updateLocation();
  void load();
};

export default { mount };
