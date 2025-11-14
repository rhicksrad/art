import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createSearchForm } from '../components/SearchForm';
import { northwesternSearch } from '../adapters/northwestern';
import type { ItemCard } from '../lib/types';

const SIZE_OPTIONS = [6, 12, 24, 48];

const parseSize = (value: string | null): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SIZE_OPTIONS[1];
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Northwestern Digital Collections';

  const intro = document.createElement('p');
  intro.className = 'page__lede';
  intro.textContent = 'Search works, posters, recordings, and manuscripts from Northwestern University Libraries.';

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
  let currentQuery = params.get('q') ?? '';
  let currentSize = parseSize(params.get('size'));

  const updateLocation = (): void => {
    const next = new URL(window.location.href);
    if (currentQuery) {
      next.searchParams.set('q', currentQuery);
    } else {
      next.searchParams.delete('q');
    }
    if (currentSize !== SIZE_OPTIONS[1]) {
      next.searchParams.set('size', String(currentSize));
    } else {
      next.searchParams.delete('size');
    }
    window.history.replaceState({}, '', `${next.pathname}${next.search}`);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'q', label: 'Keyword', type: 'text', placeholder: 'e.g., chicago jazz festival', value: currentQuery },
      {
        name: 'size',
        label: 'Results',
        type: 'select',
        value: String(currentSize),
        options: SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) })),
      },
    ],
    onSubmit: (values) => {
      currentQuery = values.q ?? '';
      currentSize = parseSize(values.size ?? String(SIZE_OPTIONS[1]));
      updateLocation();
      void load();
    },
  });
  formContainer.appendChild(form);

  const renderCards = (items: ItemCard[]): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No items found for this search.';
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
    if (!currentQuery.trim()) {
      status.textContent = 'Enter a keyword to search the collection.';
      resultsContainer.innerHTML = '';
      return;
    }
    loading = true;
    status.textContent = 'Loading…';
    try {
      const cards = await northwesternSearch(currentQuery, currentSize);
      renderCards(cards);
      status.textContent = `${cards.length} result${cards.length === 1 ? '' : 's'}`;
    } catch (error) {
      status.textContent = 'Unable to load results.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
      resultsContainer.innerHTML = '';
    } finally {
      loading = false;
    }
  };

  setValues({ q: currentQuery, size: String(currentSize) });
  updateLocation();
  if (currentQuery) {
    void load();
  } else {
    status.textContent = 'Enter a keyword to search the collection.';
  }
};

export default { mount };
