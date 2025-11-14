import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { leipzigCollection } from '../adapters/leipzig';

const buildHelperText = (): string =>
  'Paste a iiif.ub.uni-leipzig.de manifest or collection path (e.g., /iiif/0000001/manifest.json).';

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Leipzig IIIF Collections';

  const intro = document.createElement('p');
  intro.className = 'page__lede';
  intro.textContent = buildHelperText();

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const status = document.createElement('p');
  status.className = 'page__status';

  const alertContainer = document.createElement('div');
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';
  const cardsList = document.createElement('div');
  cardsList.className = 'grid cards';

  el.append(heading, intro, formContainer, status, alertContainer, resultsContainer);

  const params = new URLSearchParams(window.location.search);
  let currentPath = params.get('id') ?? '';

  const updateLocation = (): void => {
    const next = new URL(window.location.href);
    if (currentPath) {
      next.searchParams.set('id', currentPath);
    } else {
      next.searchParams.delete('id');
    }
    window.history.replaceState({}, '', `${next.pathname}${next.search}`);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: 'id',
        label: 'Manifest or collection path',
        type: 'text',
        placeholder: '/iiif/0000001/manifest.json',
        value: currentPath,
      },
    ],
    submitLabel: 'Load',
    onSubmit: (values) => {
      currentPath = values.id ?? '';
      updateLocation();
      void load();
    },
  });
  formContainer.appendChild(form);

  const renderCards = (items: Awaited<ReturnType<typeof leipzigCollection>>): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No manifests found for this path.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => cardsList.appendChild(renderItemCard(item)));
    resultsContainer.replaceChildren(cardsList);
  };

  let loading = false;
  const load = async (): Promise<void> => {
    if (loading) {
      return;
    }
    alertContainer.innerHTML = '';
    if (!currentPath.trim()) {
      status.textContent = 'Enter a IIIF path to load manifests.';
      resultsContainer.innerHTML = '';
      return;
    }
    loading = true;
    status.textContent = 'Loading…';
    try {
      const cards = await leipzigCollection(currentPath);
      renderCards(cards);
      status.textContent = `${cards.length} manifest${cards.length === 1 ? '' : 's'}`;
    } catch (error) {
      status.textContent = 'Unable to load IIIF resource.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
      resultsContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  setValues({ id: currentPath });
  updateLocation();
  if (currentPath) {
    void load();
  } else {
    status.textContent = 'Enter a IIIF path to load manifests.';
  }
};

export default { mount };
