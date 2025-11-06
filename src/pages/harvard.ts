import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { fetchJSON } from '../lib/http';
import { toItemCards } from '../adapters/harvard';

const PAGE_SIZE = 12;

type HarvardInfo = {
  page?: number;
  pages?: number;
  totalrecords?: number;
  totalrecordsperquery?: number;
};

type HarvardResponse = {
  records?: unknown[];
  info?: HarvardInfo;
};

const parsePage = (value: string | null): number => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : 1;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Art Museums';

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
    q: searchParams.get('q') ?? '',
    classification: searchParams.get('classification') ?? '',
    century: searchParams.get('century') ?? '',
  };

  const updateLocation = (): void => {
    const next = new URLSearchParams();
    if (currentQuery.q) next.set('q', currentQuery.q);
    if (currentQuery.classification) next.set('classification', currentQuery.classification);
    if (currentQuery.century) next.set('century', currentQuery.century);
    if (currentPage > 1) next.set('page', String(currentPage));
    const queryString = next.toString();
    const url = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'q', label: 'Keyword', type: 'text', placeholder: 'Search objects', value: currentQuery.q },
      { name: 'classification', label: 'Classification', type: 'text', value: currentQuery.classification },
      { name: 'century', label: 'Century', type: 'text', value: currentQuery.century },
    ],
    onSubmit: (values) => {
      currentQuery = {
        q: values.q ?? '',
        classification: values.classification ?? '',
        century: values.century ?? '',
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
      empty.textContent = 'No records found for this query.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => {
      cardsList.appendChild(renderItemCard(item));
    });
    resultsContainer.replaceChildren(cardsList);
  };

  const updateStatus = (info: HarvardInfo | undefined, count: number): void => {
    const total = info?.totalrecordsperquery ?? info?.totalrecords ?? count;
    status.textContent = `${total ?? 0} result${(total ?? 0) === 1 ? '' : 's'}`;
  };

  let isLoading = false;
  const load = async (): Promise<void> => {
    if (isLoading) return;
    isLoading = true;
    alertContainer.innerHTML = '';
    status.textContent = 'Loading…';
    resultsContainer.textContent = '';

    try {
      const params = {
        q: currentQuery.q,
        classification: currentQuery.classification,
        century: currentQuery.century,
        size: PAGE_SIZE,
        page: currentPage,
      };
      const response = await fetchJSON<HarvardResponse>('/harvard-art/object', params);
      const cards = toItemCards(response);
      renderCards(cards);
      updateStatus(response.info, cards.length);
      const info = response.info;
      const current = info?.page ?? currentPage;
      const totalPages = info?.pages ?? (cards.length === PAGE_SIZE ? current + 1 : current);
      currentPage = current;
      pager.update({
        page: currentPage,
        hasPrev: currentPage > 1,
        hasNext: totalPages > currentPage,
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
