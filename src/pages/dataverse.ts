import { toItemCards as toDataverseItemCards } from '../adapters/dataverse';
import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createFacetBar } from '../components/FacetBar';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { createVirtualList } from '../components/VirtualList';
import { createBar } from '../components/Bar';
import { createHistogram } from '../components/Histogram';
import { createChartBlock } from '../components/ChartBlock';
import { fetchJSON, clearCache as clearHttpCache } from '../lib/http';
import { int, pageFromUrl, toQuery } from '../lib/params';
import { countStrings, findNumericByKey, parseNumericValue } from '../lib/analytics';

const PAGE_SIZE = 12;
const CARD_ROW_HEIGHT = 280;

const TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'dataverse', label: 'Dataverse' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'file', label: 'File' },
];

const getTotalResults = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== 'object') {
    return undefined;
  }

  const data = resp as { total_count?: number; count?: number; data?: { total_count?: number } };
  if (typeof data.data?.total_count === 'number') {
    return data.data.total_count;
  }
  if (typeof data.total_count === 'number') {
    return data.total_count;
  }
  if (typeof data.count === 'number') {
    return data.count;
  }
  return undefined;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => ({
  q: query.q ?? '',
  type: query.type ?? '',
  page: query.page ?? '1',
});

const FILE_SIZE_KEYS = ['file_size', 'filesize', 'size', 'bytes', 'filesizebytes'];

const extractFileSize = (raw: unknown): number | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  for (const key of FILE_SIZE_KEYS) {
    if (key in record) {
      const parsed = parseNumericValue(record[key]);
      if (typeof parsed === 'number' && parsed >= 0) {
        return parsed;
      }
    }
  }
  const nested = findNumericByKey(raw, FILE_SIZE_KEYS);
  return typeof nested === 'number' && nested >= 0 ? nested : undefined;
};

const splitSubjects = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return value
      .split(/[,;|]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitSubjects(entry));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => splitSubjects(entry));
  }
  return [];
};

const extractSubjects = (raw: unknown): string[] => {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const results: string[] = [];
  const stack: unknown[] = [raw];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current as object)) {
      continue;
    }
    visited.add(current as object);

    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase().includes('subject')) {
        results.push(...splitSubjects(value));
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return results;
};

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    q: searchParams.get('q') ?? '',
    type: searchParams.get('type') ?? '',
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

  const fileHistogram = createHistogram({ values: [], bins: 12 });
  const fileHistogramBlock = createChartBlock('File size distribution', fileHistogram.element);
  chartsContainer.append(fileHistogramBlock);

  const subjectBar = createBar({ data: [], xLabel: 'Subject', yLabel: 'Items' });
  const subjectBarBlock = createChartBlock('Items by subject', subjectBar.element);
  chartsContainer.append(subjectBarBlock);

  const virtualList = createVirtualList({
    items: [] as ReturnType<typeof toDataverseItemCards>,
    rowHeight: CARD_ROW_HEIGHT,
    renderItem: (item) => renderItemCard(item),
  });

  const renderCards = (cards: ReturnType<typeof toDataverseItemCards>): void => {
    if (cards.length === 0) {
      resultsList.replaceChildren(emptyPlaceholder);
      return;
    }

    virtualList.setItems(cards);
    resultsList.replaceChildren(virtualList.element);
  };

  const updateCharts = (cards: ReturnType<typeof toDataverseItemCards>): void => {
    if (currentQuery.type === 'file') {
      fileHistogramBlock.hidden = false;
      subjectBarBlock.hidden = true;
      const sizes = cards
        .map((card) => extractFileSize(card.raw))
        .filter((value): value is number => typeof value === 'number');
      fileHistogram.setValues(sizes);
    } else {
      fileHistogramBlock.hidden = true;
      subjectBarBlock.hidden = false;
      const subjects = cards.flatMap((card) => extractSubjects(card.raw));
      const data = countStrings(subjects);
      subjectBar.setData(data);
    }
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
        name: 'q',
        label: 'Keyword',
        type: 'text',
        placeholder: 'Search Harvard Dataverse',
        value: currentQuery.q,
      },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        placeholder: 'Any type',
        options: TYPE_OPTIONS.filter((option) => option.value !== ''),
        value: currentQuery.type,
      },
    ],
    onSubmit: submitForm,
  });

  setValues({ q: currentQuery.q, type: currentQuery.type });

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
    return {
      ...toQuery({
        q: query.q,
        type: query.type,
        per_page: PAGE_SIZE,
        start: (pageNumber - 1) * PAGE_SIZE,
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
    setValues({ q: currentQuery.q, type: currentQuery.type });

    try {
      const response = await fetchJSON<unknown>('/dataverse/search', requestParams, {
        signal: controller.signal,
      });
      if (token !== requestToken) {
        return;
      }

      const cards = toDataverseItemCards(response);
      const total = getTotalResults(response);
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
      alertContainer.replaceChildren(createAlert(`Dataverse search failed: ${message}`, 'error'));
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
    alertContainer.replaceChildren(createAlert(`Dataverse search failed: ${message}`, 'error'));
  });
};

export default mount;
