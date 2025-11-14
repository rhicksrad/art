import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { hathiSearchById, type HathiIdType } from '../adapters/hathiCatalog';

const ID_TYPE_OPTIONS: { value: HathiIdType; label: string }[] = [
  { value: 'oclc', label: 'OCLC' },
  { value: 'isbn', label: 'ISBN' },
  { value: 'lccn', label: 'LCCN' },
  { value: 'htid', label: 'HTID' },
];

const isHathiIdType = (value: string | null): HathiIdType => {
  const match = ID_TYPE_OPTIONS.find((option) => option.value === value);
  return match ? match.value : 'oclc';
};

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'HathiTrust Catalog';

  const intro = document.createElement('p');
  intro.className = 'page__lede';
  intro.textContent = 'Lookup volumes by OCLC, ISBN, LCCN, or HTID using the catalog.volumes API.';

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
  let currentType = isHathiIdType(params.get('type'));
  let currentId = params.get('id') ?? '';

  const updateLocation = (): void => {
    const next = new URL(window.location.href);
    next.searchParams.set('type', currentType);
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
        name: 'type',
        label: 'Identifier type',
        type: 'select',
        value: currentType,
        options: ID_TYPE_OPTIONS,
      },
      {
        name: 'id',
        label: 'Identifier value',
        type: 'text',
        placeholder: 'e.g., 3185585 or mdp.39015078572457',
        value: currentId,
      },
    ],
    onSubmit: (values) => {
      currentType = isHathiIdType(values.type ?? '');
      currentId = values.id ?? '';
      updateLocation();
      void load();
    },
  });
  formContainer.appendChild(form);

  const renderCards = (items: Awaited<ReturnType<typeof hathiSearchById>>): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No volumes found for this identifier.';
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
    if (!currentId.trim()) {
      status.textContent = 'Enter an identifier to search the catalog.';
      resultsContainer.innerHTML = '';
      return;
    }
    loading = true;
    status.textContent = 'Loading…';
    try {
      const cards = await hathiSearchById(currentType, currentId);
      renderCards(cards);
      status.textContent = `${cards.length} result${cards.length === 1 ? '' : 's'}`;
    } catch (error) {
      status.textContent = 'Unable to load catalog results.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
      resultsContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  setValues({ type: currentType, id: currentId });
  updateLocation();
  if (currentId) {
    void load();
  } else {
    status.textContent = 'Enter an identifier to search the catalog.';
  }
};

export default { mount };
