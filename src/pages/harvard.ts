import { toItemCards as toHarvardItemCards } from '../adapters/harvard';
import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createFacetBar } from '../components/FacetBar';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { createVirtualList } from '../components/VirtualList';
import { createBar } from '../components/Bar';
import { createChartBlock } from '../components/ChartBlock';
import { fetchJSON, clearCache as clearHttpCache } from '../lib/http';
import { int, pageFromUrl, toQuery } from '../lib/params';
import { countDecades, extractYear } from '../lib/analytics';

const PAGE_SIZE = 12;
const CARD_ROW_HEIGHT = 280;

const CLASSIFICATION_OPTIONS = [
  { value: '', label: 'Any classification' },
  { value: 'Prints', label: 'Prints' },
  { value: 'Paintings', label: 'Paintings' },
  { value: 'Drawings', label: 'Drawings' },
  { value: 'Photographs', label: 'Photographs' },
];

const CENTURY_OPTIONS = [
  { value: '', label: 'Any century' },
  { value: '16th century', label: '16th century' },
  { value: '17th century', label: '17th century' },
  { value: '18th century', label: '18th century' },
  { value: '19th century', label: '19th century' },
  { value: '20th century', label: '20th century' },
  { value: '21st century', label: '21st century' },
];

const getTotalRecords = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== 'object') {
    return undefined;
  }

  const info = (resp as { info?: { totalrecords?: number; totalrecordsperquery?: number } }).info;
  if (!info) return undefined;
  if (typeof info.totalrecords === 'number') return info.totalrecords;
  if (typeof info.totalrecordsperquery === 'number') return info.totalrecordsperquery;
  return undefined;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => {
  return {
    q: query.q ?? '',
    classification: query.classification ?? '',
    century: query.century ?? '',
    page: query.page ?? '1',
  };
};

const collectDecadeData = (
  cards: ReturnType<typeof toHarvardItemCards>,
): ReturnType<typeof countDecades> => {
  const years: number[] = [];
  for (const card of cards) {
    const year = extractYear(card.date);
    if (typeof year === 'number') {
      years.push(year);
    }
  }
  return countDecades(years);
};

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    q: searchParams.get('q') ?? '',
    classification: searchParams.get('classification') ?? '',
    century: searchParams.get('century') ?? '',
    page: String(pageFromUrl()),
  });

  let currentQuery = { ...initialQuery };
  let currentPage = int(currentQuery.page, 1);
  let currentTtl = 3600;
  let isLoading = false;
  let requestToken = 0;
  let abortController: AbortController | null = null;

  el.innerHTML = '';

  const alertContainer = document.createElement('div');
  const resultsInfo = document.createElement('p');
  resultsInfo.className = 'results-count';
  resultsInfo.textContent = '0 results';

  const resultsList = document.createElement('div');
  resultsList.className = 'results-list';

  const emptyPlaceholder = document.createElement('p');
  emptyPlaceholder.className = 'results-placeholder';
  emptyPlaceholder.textContent = 'No results found.';

  const chartsContainer = document.createElement('div');
  chartsContainer.className = 'results-charts';

  const decadeBar = createBar({
    data: [],
    xLabel: 'Decade',
    yLabel: 'Objects',
  });
  const decadeBlock = createChartBlock('Objects by decade', decadeBar.element);
  chartsContainer.append(decadeBlock);

  const virtualList = createVirtualList({
    items: [] as ReturnType<typeof toHarvardItemCards>,
    rowHeight: CARD_ROW_HEIGHT,
    renderItem: (item) => renderItemCard(item),
  });

  const renderCards = (cards: ReturnType<typeof toHarvardItemCards>): void => {
    if (cards.length === 0) {
      resultsList.replaceChildren(emptyPlaceholder);
      return;
    }

    virtualList.setItems(cards);
    resultsList.replaceChildren(virtualList.element);
  };

  const updateCharts = (cards: ReturnType<typeof toHarvardItemCards>): void => {
    const data = collectDecadeData(cards);
    decadeBar.setData(data);
  };

  const updateInfo = (total: number | undefined, count: number): void => {
    const value = typeof total === 'number' ? total : count;
    resultsInfo.textContent = `${value} results`;
  };

  const updateLocation = (query: Record<string, string>): void => {
    const sanitized = sanitizeQuery(query);
    const urlQuery = toQuery({
      q: sanitized.q,
      classification: sanitized.classification,
      century: sanitized.century,
      page: sanitized.page,
    });
    const search = new URLSearchParams(urlQuery).toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const submitForm = (values: Record<string, string>): void => {
    const nextQuery = sanitizeQuery({ ...values, page: '1' });
    currentQuery = nextQuery;
    currentPage = 1;
    void performSearch();
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: 'q',
        label: 'Keyword',
        type: 'text',
        placeholder: 'Search Harvard Art Museums',
        value: currentQuery.q,
      },
      {
        name: 'classification',
        label: 'Classification',
        type: 'select',
        placeholder: 'Any classification',
        options: CLASSIFICATION_OPTIONS.filter((option) => option.value !== ''),
        value: currentQuery.classification,
      },
      {
        name: 'century',
        label: 'Century',
        type: 'select',
        placeholder: 'Any century',
        options: CENTURY_OPTIONS.filter((option) => option.value !== ''),
        value: currentQuery.century,
      },
    ],
    onSubmit: submitForm,
  });

  setValues({
    q: currentQuery.q,
    classification: currentQuery.classification,
    century: currentQuery.century,
  });

  const pager = createPager({
    page: currentPage,
    hasPrev: currentPage > 1,
    hasNext: false,
    onPrev: () => {
      if (isLoading || currentPage <= 1) return;
      currentQuery.page = String(currentPage - 1);
      currentPage -= 1;
      void performSearch();
    },
    onNext: () => {
      if (isLoading) return;
      currentQuery.page = String(currentPage + 1);
      currentPage += 1;
      void performSearch();
    },
  });

  const requestParamsFromQuery = (
    query: Record<string, string>,
    ttl: number,
  ): Record<string, string | number> => {
    return {
      ...toQuery({
        q: query.q,
        classification: query.classification,
        century: query.century,
        size: PAGE_SIZE,
        page: int(query.page, 1),
      }),
      ttl,
    };
  };

  const performSearch = async (): Promise<void> => {
    const pageNumber = Math.max(1, int(currentQuery.page, 1));
    currentQuery.page = String(pageNumber);
    currentPage = pageNumber;

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    const requestParams = requestParamsFromQuery(currentQuery, currentTtl);
    const token = ++requestToken;
    isLoading = true;
    alertContainer.innerHTML = '';
    resultsList.innerHTML = '';
    resultsInfo.textContent = 'Loading…';
    pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext: false });
    updateLocation(currentQuery);
    setValues({
      q: currentQuery.q,
      classification: currentQuery.classification,
      century: currentQuery.century,
    });

    try {
      const response = await fetchJSON<unknown>('/harvard-art/object', requestParams, {
        signal: controller.signal,
      });
      if (token !== requestToken) {
        return;
      }

      const cards = toHarvardItemCards(response);
      const total = getTotalRecords(response);
      const hasNext =
        typeof total === 'number' ? pageNumber * PAGE_SIZE < total : cards.length === PAGE_SIZE;

      renderCards(cards);
      updateCharts(cards);
      updateInfo(total, cards.length);
      pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext });
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      if (controller.signal.aborted) {
        return;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      renderCards([]);
      updateCharts([]);
      resultsInfo.textContent = '0 results';
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(`Harvard search failed: ${message}`, 'error'));
      pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext: false });
    } finally {
      if (token === requestToken) {
        isLoading = false;
        if (abortController === controller) {
          abortController = null;
        }
      }
    }
  };

  const facetBar = createFacetBar({
    ttl: currentTtl,
    onTtlChange: (value) => {
      currentTtl = value;
    },
    onClear: () => {
      clearHttpCache();
      alertContainer.replaceChildren(createAlert('Cache cleared', 'info'));
    },
  });

  el.append(
    form,
    facetBar.element,
    alertContainer,
    resultsInfo,
    chartsContainer,
    resultsList,
    pager,
  );

  performSearch().catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    alertContainer.replaceChildren(createAlert(`Harvard search failed: ${message}`, 'error'));
  });
};

export default mount;
