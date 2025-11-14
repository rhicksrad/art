import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { htrcLookup } from '../adapters/htrc';

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'HTRC Analytics';

  const intro = document.createElement('p');
  intro.className = 'page__lede';
  intro.textContent = 'Enter an HTID (e.g., mdp.39015078572457) to fetch metadata from the HathiTrust Research Center.';

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const status = document.createElement('p');
  status.className = 'page__status';

  const alertContainer = document.createElement('div');
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';

  el.append(heading, intro, formContainer, status, alertContainer, resultsContainer);

  const params = new URLSearchParams(window.location.search);
  let currentId = params.get('id') ?? '';

  const updateLocation = (): void => {
    const next = new URL(window.location.href);
    if (currentId) {
      next.searchParams.set('id', currentId);
    } else {
      next.searchParams.delete('id');
    }
    window.history.replaceState({}, '', `${next.pathname}${next.search}`);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: 'id',
        label: 'HTID',
        type: 'text',
        placeholder: 'mdp.39015078572457',
        value: currentId,
      },
    ],
    submitLabel: 'Lookup',
    onSubmit: (values) => {
      currentId = values.id ?? '';
      updateLocation();
      void load();
    },
  });
  formContainer.appendChild(form);

  const renderCard = (card: Awaited<ReturnType<typeof htrcLookup>>): void => {
    resultsContainer.innerHTML = '';
    if (!card) {
      const empty = document.createElement('p');
      empty.textContent = 'No metadata returned for this HTID.';
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
    if (!currentId.trim()) {
      status.textContent = 'Enter an HTID to fetch analytics metadata.';
      resultsContainer.innerHTML = '';
      return;
    }
    loading = true;
    status.textContent = 'Loading…';
    try {
      const card = await htrcLookup(currentId);
      renderCard(card);
      status.textContent = card ? `Resolved ${card.id}` : 'No metadata returned.';
    } catch (error) {
      status.textContent = 'Unable to load metadata.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
      resultsContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  setValues({ id: currentId });
  updateLocation();
  if (currentId) {
    void load();
  } else {
    status.textContent = 'Enter an HTID to fetch analytics metadata.';
  }
};

export default { mount };
