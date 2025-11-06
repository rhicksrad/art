import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { fetchJSON } from '../lib/http';
import { toItemCards } from '../adapters/dataverse';

const PAGE_SIZE = 12;

type DataverseResponse = {
  data?: {
    items?: unknown[];
    total_count?: number;
  };
};

const parsePage = (value: string | null): number => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : 1;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Dataverse';

  const status = document.createElement('p');
  status.className = 'page__status';

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';

  const cardsList = document.createElement('div');
  cardsList.className = 'grid cards';

  const alertContainer = document.createElement('div');

  const pagerContainer = document.createElement('div');
  pagerContainer.className = 'page__pager';

  el.append(heading, status, formContainer, alertContainer, resultsContainer, pagerContainer);

  const searchParams = new URLSearchParams(window.location.search);
  let currentPage = parsePage(searchParams.get('page'));
  let currentQuery = {
    q: searchParams.get('q') ?? '',
    type: searchParams.get('type') ?? 'dataset',
  };

  const updateLocation = (): void => {
    const params = new URLSearchParams();
    if (currentQuery.q) params.set('q', currentQuery.q);
    if (currentQuery.type && currentQuery.type !== 'dataset') params.set('type', currentQuery.type);
    if (currentPage > 1) params.set('page', String(currentPage));
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'q', label: 'Keyword', type: 'text', placeholder: 'Search datasets', value: currentQuery.q },
      {
        name: 'type',
        label: 'Result type',
        type: 'select',
        value: currentQuery.type,
        options: [
          { value: 'dataverse', label: 'Dataverse' },
          { value: 'dataset', label: 'Dataset' },
          { value: 'file', label: 'File' },
        ],
      },
    ],
    onSubmit: (values) => {
      currentQuery = {
        q: values.q ?? '',
        type: values.type && values.type.length > 0 ? values.type : 'dataset',
      };
      currentPage = 1;
      updateLocation();
      void load();
    },
  });

  formContainer.appendChild(form);

  const pager = createPager({
    page: currentPage,
    hasPrev: currentPage > 1,
    hasNext: false,
    onPrev: () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      updateLocation();
      void load();
    },
    onNext: () => {
      currentPage += 1;
      updateLocation();
      void load();
    },
  });
  pagerContainer.appendChild(pager);

  const renderCards = (items: ReturnType<typeof toItemCards>): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No items found for this search.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => {
      cardsList.appendChild(renderItemCard(item));
    });
    resultsContainer.replaceChildren(cardsList);
  };

  const updateStatus = (total: number, count: number): void => {
    const value = total || count;
    status.textContent = `${value} result${value === 1 ? '' : 's'}`;
  };

  let isLoading = false;
  const load = async (): Promise<void> => {
    if (isLoading) return;
    isLoading = true;
    alertContainer.innerHTML = '';
    status.textContent = 'Loading…';
    resultsContainer.textContent = '';

    try {
      const start = (currentPage - 1) * PAGE_SIZE;
      const query = currentQuery.q.trim().length > 0 ? currentQuery.q : '*';
      const response = await fetchJSON<DataverseResponse>('/dataverse/search', {
        q: query,
        type: currentQuery.type || 'dataset',
        per_page: PAGE_SIZE,
        start,
      });
      const cards = toItemCards(response);
      renderCards(cards);
      const total = response.data?.total_count ?? cards.length;
      updateStatus(total, cards.length);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      pager.update({
        page: currentPage,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
      });
    } catch (error) {
      renderCards([]);
      status.textContent = 'Unable to load records.';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(message, 'error'));
    } finally {
      isLoading = false;
    }
  };

  setValues(currentQuery);
  updateLocation();
  void load();
};

export default { mount };
