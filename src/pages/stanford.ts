import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { normalizePurlId, stanfordLookupPurl } from '../adapters/stanford';

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Stanford PURL Explorer';

  const intro = document.createElement('p');
  intro.className = 'page__lede';
  intro.textContent = 'Paste a Stanford PURL id (bb112zx3193) or full https://purl.stanford.edu URL to fetch metadata.';

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const status = document.createElement('p');
  status.className = 'page__status';

  const alertContainer = document.createElement('div');

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';

  el.append(heading, intro, formContainer, status, alertContainer, resultsContainer);

  const params = new URLSearchParams(window.location.search);
  let currentPurl = params.get('purl') ?? '';

  const updateLocation = (): void => {
    const next = new URL(window.location.href);
    if (currentPurl) {
      next.searchParams.set('purl', currentPurl);
    } else {
      next.searchParams.delete('purl');
    }
    window.history.replaceState({}, '', `${next.pathname}${next.search}`);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: 'purl',
        label: 'Stanford PURL id or URL',
        type: 'text',
        placeholder: 'bb112zx3193 or https://purl.stanford.edu/bb112zx3193',
        value: currentPurl,
      },
    ],
    submitLabel: 'Lookup',
    onSubmit: (values) => {
      currentPurl = values.purl ?? '';
      updateLocation();
      void load();
    },
  });
  formContainer.appendChild(form);

  const renderCard = async (): Promise<void> => {
    const card = await stanfordLookupPurl(currentPurl);
    resultsContainer.innerHTML = '';
    if (!card) {
      const empty = document.createElement('p');
      empty.textContent = 'No record found for this PURL id.';
      resultsContainer.appendChild(empty);
      return;
    }
    resultsContainer.appendChild(renderItemCard(card));
  };

  let loading = false;
  const load = async (): Promise<void> => {
    if (loading) {
      return;
    }
    alertContainer.innerHTML = '';
    const normalized = normalizePurlId(currentPurl ?? '');
    if (!normalized) {
      status.textContent = 'Enter an 11-character PURL id to fetch metadata.';
      resultsContainer.innerHTML = '';
      return;
    }
    loading = true;
    status.textContent = `Loading ${normalized}…`;
    try {
      await renderCard();
      status.textContent = `Resolved ${normalized}`;
    } catch (error) {
      status.textContent = 'Unable to load record.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
      resultsContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  setValues({ purl: currentPurl });
  updateLocation();
  if (currentPurl) {
    void load();
  } else {
    status.textContent = 'Enter a PURL id to begin.';
  }
};

export default { mount };
