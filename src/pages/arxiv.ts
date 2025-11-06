import { toItemCards as toArxivItemCards } from '../adapters/arxiv';
import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createFacetBar } from '../components/FacetBar';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { createVirtualList } from '../components/VirtualList';
import { createSparkline } from '../components/Sparkline';
import { createChartBlock } from '../components/ChartBlock';
import { fetchText, clearCache as clearHttpCache } from '../lib/http';
import { int, pageFromUrl, toQuery } from '../lib/params';

const PAGE_SIZE = 12;
const CARD_ROW_HEIGHT = 280;

const SORT_BY_OPTIONS = [
  { value: '', label: 'Default order' },
  { value: 'relevance', label: 'Relevance' },
  { value: 'lastUpdatedDate', label: 'Last updated' },
  { value: 'submittedDate', label: 'Submitted date' },
];

const SORT_ORDER_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'ascending', label: 'Ascending' },
  { value: 'descending', label: 'Descending' },
];

const extractTotalResults = (xml: string): number | undefined => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Received invalid XML from arXiv');
  }

  const totalNode =
    doc.querySelector('opensearch\\:totalResults') ?? doc.querySelector('totalResults');
  const text = totalNode?.textContent?.trim();
  if (!text) {
    return undefined;
  }

  const value = parseInt(text, 10);
  return Number.isNaN(value) ? undefined : value;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => ({
  search_query: query.search_query ?? '',
  sortBy: query.sortBy ?? '',
  sortOrder: query.sortOrder ?? '',
  page: query.page ?? '1',
});

const extractUpdatedTimestamp = (
  entry: ReturnType<typeof toArxivItemCards>[number],
): number | undefined => {
  const raw = entry.raw;
  if (raw instanceof Element) {
    const updated =
      raw.querySelector('updated')?.textContent ??
      raw.querySelector('published')?.textContent ??
      undefined;
    if (updated) {
      const parsed = Date.parse(updated);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  if (typeof entry.date === 'string' && entry.date.length > 0) {
    const parsed = Date.parse(entry.date);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    search_query: searchParams.get('search_query') ?? '',
    sortBy: searchParams.get('sortBy') ?? '',
    sortOrder: searchParams.get('sortOrder') ?? '',
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

  const updatedSparkline = createSparkline({ values: [] });
  const updatedBlock = createChartBlock('Updated dates trend', updatedSparkline.element);
  chartsContainer.append(updatedBlock);

  const virtualList = createVirtualList({
    items: [] as ReturnType<typeof toArxivItemCards>,
    rowHeight: CARD_ROW_HEIGHT,
    renderItem: (item) => renderItemCard(item),
  });

  const renderCards = (cards: ReturnType<typeof toArxivItemCards>): void => {
    if (cards.length === 0) {
      resultsList.replaceChildren(emptyPlaceholder);
      return;
    }

    virtualList.setItems(cards);
    resultsList.replaceChildren(virtualList.element);
  };

  const updateCharts = (cards: ReturnType<typeof toArxivItemCards>): void => {
    const values = cards
      .map((card) => extractUpdatedTimestamp(card))
      .filter((value): value is number => typeof value === 'number');
    updatedSparkline.setValues(values);
  };

  updateCharts([]);

  const updateInfo = (total: number | undefined, count: number): void => {
    const value = typeof total === 'number' ? total : count;
    resultsInfo.textContent = `${value} results`;
  };

  const updateLocation = (query: Record<string, string>): void => {
    const sanitized = sanitizeQuery(query);
    const search = new URLSearchParams(toQuery(sanitized)).toString();
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
        name: 'search_query',
        label: 'Query',
        type: 'text',
        placeholder: 'Search arXiv',
        value: currentQuery.search_query,
      },
      {
        name: 'sortBy',
        label: 'Sort by',
        type: 'select',
        placeholder: 'Default order',
        options: SORT_BY_OPTIONS.filter((option) => option.value !== ''),
        value: currentQuery.sortBy,
      },
      {
        name: 'sortOrder',
        label: 'Sort order',
        type: 'select',
        placeholder: 'Default',
        options: SORT_ORDER_OPTIONS.filter((option) => option.value !== ''),
        value: currentQuery.sortOrder,
      },
    ],
    onSubmit: submitForm,
  });

  setValues({
    search_query: currentQuery.search_query,
    sortBy: currentQuery.sortBy,
    sortOrder: currentQuery.sortOrder,
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
    const pageNumber = Math.max(1, int(query.page, 1));
    const trimmed = query.search_query?.trim();
    const searchQuery = trimmed && trimmed.length > 0 ? trimmed : 'all';
    return {
      ...toQuery({
        search_query: searchQuery,
        max_results: PAGE_SIZE,
        start: (pageNumber - 1) * PAGE_SIZE,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
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
      search_query: currentQuery.search_query,
      sortBy: currentQuery.sortBy,
      sortOrder: currentQuery.sortOrder,
    });

    try {
      const response = await fetchText('/arxiv/search', requestParams, {
        signal: controller.signal,
      });
      if (token !== requestToken) {
        return;
      }

      const total = extractTotalResults(response);
      const cards = toArxivItemCards(response);
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
      alertContainer.replaceChildren(createAlert(`arXiv search failed: ${message}`, 'error'));
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
    alertContainer.replaceChildren(createAlert(`arXiv search failed: ${message}`, 'error'));
  });
};

export default mount;
