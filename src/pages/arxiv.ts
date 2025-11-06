import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { fetchText } from '../lib/http';
import { toItemCards } from '../adapters/arxiv';

const PAGE_SIZE = 12;

const parsePage = (value: string | null): number => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : 1;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'arXiv';

  const status = document.createElement('p');
  status.className = 'page__status';

  const formContainer = document.createElement('div');
  formContainer.className = 'page__search';

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';

  const cardsList = document.createElement('div');
  cardsList.className = 'card-grid';

  const alertContainer = document.createElement('div');

  const pagerContainer = document.createElement('div');
  pagerContainer.className = 'page__pager';

  el.append(heading, status, formContainer, alertContainer, resultsContainer, pagerContainer);

  const searchParams = new URLSearchParams(window.location.search);
  let currentPage = parsePage(searchParams.get('page'));
  let currentQuery = {
    search_query: searchParams.get('search_query') ?? 'cat:cs.AI',
    sortBy: searchParams.get('sortBy') ?? 'relevance',
    sortOrder: searchParams.get('sortOrder') ?? 'descending',
  };

  const updateLocation = (): void => {
    const params = new URLSearchParams();
    params.set('search_query', currentQuery.search_query);
    if (currentQuery.sortBy !== 'relevance') params.set('sortBy', currentQuery.sortBy);
    if (currentQuery.sortOrder !== 'descending') params.set('sortOrder', currentQuery.sortOrder);
    if (currentPage > 1) params.set('page', String(currentPage));
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'search_query', label: 'Query', type: 'text', placeholder: 'arXiv search query', value: currentQuery.search_query },
      {
        name: 'sortBy',
        label: 'Sort by',
        type: 'select',
        value: currentQuery.sortBy,
        options: [
          { value: 'relevance', label: 'Relevance' },
          { value: 'lastUpdatedDate', label: 'Last updated' },
          { value: 'submittedDate', label: 'Submission date' },
        ],
      },
      {
        name: 'sortOrder',
        label: 'Sort order',
        type: 'select',
        value: currentQuery.sortOrder,
        options: [
          { value: 'descending', label: 'Descending' },
          { value: 'ascending', label: 'Ascending' },
        ],
      },
    ],
    onSubmit: (values) => {
      currentQuery = {
        search_query: values.search_query ?? currentQuery.search_query,
        sortBy: values.sortBy && values.sortBy.length > 0 ? values.sortBy : 'relevance',
        sortOrder: values.sortOrder && values.sortOrder.length > 0 ? values.sortOrder : 'descending',
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
      empty.textContent = 'No results for this query.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => {
      cardsList.appendChild(renderItemCard(item));
    });
    resultsContainer.replaceChildren(cardsList);
  };

  const updateStatus = (count: number): void => {
    const from = (currentPage - 1) * PAGE_SIZE + 1;
    const to = from + count - 1;
    status.textContent = `Showing ${from}-${to} (page ${currentPage})`;
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
      const response = await fetchText('/arxiv/search', {
        search_query: currentQuery.search_query,
        sortBy: currentQuery.sortBy,
        sortOrder: currentQuery.sortOrder,
        start,
        max_results: PAGE_SIZE,
      });
      const cards = toItemCards(response);
      renderCards(cards);
      updateStatus(cards.length);
      pager.update({
        page: currentPage,
        hasPrev: currentPage > 1,
        hasNext: cards.length === PAGE_SIZE,
      });
    } catch (error) {
      renderCards([]);
      status.textContent = 'Unable to load feed.';
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
