import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { fetchJSON } from '../lib/http';
import { toItemCards } from '../adapters/ubc';
import { getUbcIndex, searchUbc } from '../lib/ubc';

const PAGE_SIZE = 12;

type CollectionsResponse = {
  data?: Record<string, unknown>;
};

const parsePage = (value: string | null): number => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : 1;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'UBC Open Collections';

  const indexLine = document.createElement('p');
  indexLine.className = 'page__status';
  indexLine.textContent = 'Resolved index: loading…';

  const collectionsSection = document.createElement('section');
  collectionsSection.className = 'ubc-section';
  const collectionsHeading = document.createElement('h2');
  collectionsHeading.textContent = 'Collections probe';
  const collectionsStatus = document.createElement('p');
  collectionsStatus.textContent = 'Collections not loaded yet.';
  const collectionsList = document.createElement('ul');
  collectionsList.className = 'collection-list';
  collectionsSection.append(collectionsHeading, collectionsStatus, collectionsList);

  const searchSection = document.createElement('section');
  searchSection.className = 'ubc-section';
  const searchHeading = document.createElement('h2');
  searchHeading.textContent = 'Search index';
  const searchFormContainer = document.createElement('div');
  const searchAlertContainer = document.createElement('div');
  const searchStatus = document.createElement('p');
  searchStatus.className = 'page__status';
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';
  const cardsList = document.createElement('div');
  cardsList.className = 'card-grid';
  const pagerContainer = document.createElement('div');
  pagerContainer.className = 'page__pager';
  searchSection.append(searchHeading, searchFormContainer, searchAlertContainer, searchStatus, resultsContainer, pagerContainer);

  el.append(heading, indexLine, collectionsSection, searchSection);

  void getUbcIndex()
    .then((index) => {
      indexLine.textContent = `Resolved index: ${index}`;
    })
    .catch(() => {
      indexLine.textContent = 'Resolved index: aaah (fallback)';
    });

  const loadCollections = async (): Promise<void> => {
    collectionsStatus.textContent = 'Loading collections…';
    collectionsList.innerHTML = '';
    try {
      const response = await fetchJSON<CollectionsResponse>('/ubc/collections', { ttl: 3600 });
      const values = response.data ? Object.values(response.data) : [];
      const slugs = values
        .filter((value): value is string => typeof value === 'string')
        .filter((slug) => /^[A-Za-z]/.test(slug));
      collectionsStatus.textContent = `${slugs.length} collections discovered.`;
      slugs.slice(0, 20).forEach((slug) => {
        const item = document.createElement('li');
        item.textContent = slug;
        collectionsList.appendChild(item);
      });
    } catch (error) {
      collectionsStatus.textContent = 'Unable to load collections.';
      const message = error instanceof Error ? error.message : String(error);
      collectionsList.replaceChildren(createAlert(message, 'error'));
    }
  };

  void loadCollections();

  const searchParams = new URLSearchParams(window.location.search);
  let currentPage = parsePage(searchParams.get('page'));
  let currentQuery = {
    q: searchParams.get('q') ?? 'newspaper',
    size: searchParams.get('size') ?? String(PAGE_SIZE),
    sort: searchParams.get('sort') ?? '',
  };

  const updateLocation = (): void => {
    const params = new URLSearchParams();
    if (currentQuery.q) params.set('q', currentQuery.q);
    if (currentQuery.size && currentQuery.size !== String(PAGE_SIZE)) params.set('size', currentQuery.size);
    if (currentQuery.sort) params.set('sort', currentQuery.sort);
    if (currentPage > 1) params.set('page', String(currentPage));
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'q', label: 'Keyword', type: 'text', placeholder: 'Search UBC collections', value: currentQuery.q },
      { name: 'size', label: 'Results per page', type: 'number', value: currentQuery.size },
      { name: 'sort', label: 'Sort', type: 'text', placeholder: 'e.g. date:desc', value: currentQuery.sort },
    ],
    submitLabel: 'Search',
    onSubmit: (values) => {
      currentQuery = {
        q: values.q ?? currentQuery.q,
        size: values.size && values.size.length > 0 ? values.size : String(PAGE_SIZE),
        sort: values.sort ?? '',
      };
      currentPage = 1;
      updateLocation();
      void loadSearch();
    },
  });
  searchFormContainer.appendChild(form);

  const pager = createPager({
    page: currentPage,
    hasPrev: currentPage > 1,
    hasNext: false,
    onPrev: () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      updateLocation();
      void loadSearch();
    },
    onNext: () => {
      currentPage += 1;
      updateLocation();
      void loadSearch();
    },
  });
  pagerContainer.appendChild(pager);

  const renderCards = (items: ReturnType<typeof toItemCards>): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No results found.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => {
      cardsList.appendChild(renderItemCard(item));
    });
    resultsContainer.replaceChildren(cardsList);
  };

  const updateStatus = (count: number, pageSize: number): void => {
    const from = (currentPage - 1) * pageSize + 1;
    const to = from + count - 1;
    searchStatus.textContent = `Showing ${from}-${to}`;
  };

  let isLoading = false;
  const loadSearch = async (): Promise<void> => {
    if (isLoading) return;
    isLoading = true;
    searchAlertContainer.innerHTML = '';
    searchStatus.textContent = 'Searching…';
    resultsContainer.textContent = '';

    try {
      const sizeValue = Number(currentQuery.size);
      const pageSize = Number.isInteger(sizeValue) && sizeValue > 0 ? sizeValue : PAGE_SIZE;
      const from = (currentPage - 1) * pageSize;
      const response = await searchUbc(currentQuery.q, {
        size: pageSize,
        from,
        sort: currentQuery.sort,
      });
      const cards = toItemCards(response);
      renderCards(cards);
      updateStatus(cards.length, pageSize);
      pager.update({
        page: currentPage,
        hasPrev: currentPage > 1,
        hasNext: cards.length === pageSize,
      });
    } catch (error) {
      renderCards([]);
      searchStatus.textContent = 'Search failed.';
      const message = error instanceof Error ? error.message : String(error);
      searchAlertContainer.replaceChildren(createAlert(message, 'error'));
    } finally {
      isLoading = false;
    }
  };

  setValues(currentQuery);
  updateLocation();
  void loadSearch();
};

export default { mount };
