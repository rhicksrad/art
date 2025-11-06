import { toItemCards as toHarvardItemCards } from '../adapters/harvard';
import { toItemCards as toPrincetonItemCards } from '../adapters/princeton';
import { toItemCards as toUbcItemCards } from '../adapters/ubc';
import { toItemCards as toArxivItemCards } from '../adapters/arxiv';
import { createAlert } from '../components/Alert';
import { createCard, CardProps } from '../components/Card';
import { createPager } from '../components/Pager';
import { createTimeline, type TimelineSeries } from '../components/Timeline';
import { createChartBlock } from '../components/ChartBlock';
import { setSiteStatus } from '../components/SiteHeader';
import { fetchJSON, fetchText } from '../lib/http';
import { extractYear } from '../lib/analytics';
import { listSavedSearches, deleteSavedSearch, type SavedSearch } from '../lib/store';
import { toQuery } from '../lib/params';
import type { ItemCard } from '../lib/types';

type DiagResponse = {
  ok: boolean;
  now?: string;
  endpoints?: string[];
  keys?: Record<string, boolean>;
};

type SourceSummary = {
  cards: ItemCard[];
  total?: number;
};

type SavedSearchEntry = {
  source: string;
  entry: SavedSearch;
};

const AGGREGATE_LIMIT = 24;

const SOURCE_ROUTES: Record<string, { label: string; route: string }> = {
  harvard: { label: 'Harvard Art Museums', route: 'harvard.html' },
  princeton: { label: 'Princeton University Art Museum', route: 'princeton.html' },
  ubc: { label: 'UBC Open Collections', route: 'ubc.html' },
  arxiv: { label: 'arXiv', route: 'arxiv.html' },
  dataverse: { label: 'Dataverse', route: 'dataverse.html' },
  yale: { label: 'Yale', route: 'yale.html' },
};

const getHarvardTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== 'object') {
    return undefined;
  }

  const info = (resp as { info?: { totalrecords?: number; totalrecordsperquery?: number } }).info;
  if (!info) return undefined;
  if (typeof info.totalrecords === 'number') return info.totalrecords;
  if (typeof info.totalrecordsperquery === 'number') return info.totalrecordsperquery;
  return undefined;
};

const getPrincetonTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== 'object') {
    return undefined;
  }

  const data = resp as Record<string, unknown>;
  const direct = data.count ?? data.total ?? data.total_count;
  if (typeof direct === 'number') {
    return direct;
  }

  const info = data.info;
  if (info && typeof info === 'object') {
    const infoData = info as Record<string, unknown>;
    const infoTotal = infoData.total ?? infoData.total_count;
    if (typeof infoTotal === 'number') {
      return infoTotal;
    }
  }

  const pagination = data.pagination;
  if (pagination && typeof pagination === 'object') {
    const paginationData = pagination as Record<string, unknown>;
    const paginationTotal = paginationData.total ?? paginationData.total_count;
    if (typeof paginationTotal === 'number') {
      return paginationTotal;
    }
  }

  return undefined;
};

const getUbcTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== 'object') {
    return undefined;
  }

  const data = resp as { total?: number; resultCount?: number };
  if (typeof data.total === 'number') {
    return data.total;
  }
  if (typeof data.resultCount === 'number') {
    return data.resultCount;
  }
  return undefined;
};

const extractArxivTotal = (xml: string): number | undefined => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return undefined;
  }

  const totalNode = doc.querySelector('opensearch\\:totalResults') ?? doc.querySelector('totalResults');
  const text = totalNode?.textContent?.trim();
  if (!text) {
    return undefined;
  }

  const value = parseInt(text, 10);
  return Number.isNaN(value) ? undefined : value;
};

const toTimelinePoints = (cards: ItemCard[]): { x: number; y: number }[] => {
  const counts = new Map<number, number>();
  cards.forEach((card) => {
    const year = extractYear(card.date);
    if (typeof year === 'number') {
      const decade = Math.trunc(year / 10) * 10;
      counts.set(decade, (counts.get(decade) ?? 0) + 1);
    }
  });

  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([decade, value]) => ({ x: decade, y: value }));
};

const gatherSavedSearches = (): SavedSearchEntry[] => {
  return Object.keys(SOURCE_ROUTES)
    .flatMap((source) => {
      return listSavedSearches(source).map((entry) => ({ source, entry }));
    })
    .sort((a, b) => b.entry.createdAt - a.entry.createdAt);
};

const renderStatus = (container: HTMLElement, data: DiagResponse): void => {
  container.innerHTML = '';

  const okRow = document.createElement('p');
  okRow.innerHTML = `<strong>ok:</strong> ${String(data.ok)}`;

  const nowRow = document.createElement('p');
  nowRow.innerHTML = `<strong>now:</strong> ${data.now ?? 'unknown'}`;

  const endpointsList = document.createElement('ul');
  endpointsList.className = 'status-list';
  (data.endpoints ?? []).forEach((endpoint) => {
    const item = document.createElement('li');
    item.textContent = endpoint;
    endpointsList.appendChild(item);
  });

  const endpointsWrapper = document.createElement('div');
  const endpointsTitle = document.createElement('strong');
  endpointsTitle.textContent = 'endpoints:';
  endpointsWrapper.append(endpointsTitle);
  if (endpointsList.childElementCount > 0) {
    endpointsWrapper.appendChild(endpointsList);
  } else {
    const none = document.createElement('p');
    none.textContent = 'No endpoints reported.';
    endpointsWrapper.appendChild(none);
  }

  const keysWrapper = document.createElement('div');
  const keysTitle = document.createElement('strong');
  keysTitle.textContent = 'keys:';
  keysWrapper.appendChild(keysTitle);

  const keysList = document.createElement('ul');
  keysList.className = 'status-list';
  const keysEntries = Object.entries(data.keys ?? {});
  if (keysEntries.length === 0) {
    const none = document.createElement('p');
    none.textContent = 'No key information.';
    keysWrapper.appendChild(none);
  } else {
    keysEntries.forEach(([key, value]) => {
      const item = document.createElement('li');
      item.textContent = `keys.${key}: ${String(value)}`;
      keysList.appendChild(item);
    });
    keysWrapper.appendChild(keysList);
  }

  container.append(okRow, nowRow, endpointsWrapper, keysWrapper);
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'home-status';

  const heading = document.createElement('h2');
  heading.textContent = 'Service diagnostics';
  section.appendChild(heading);

  const statusContainer = document.createElement('div');
  statusContainer.className = 'status-container';
  statusContainer.textContent = 'Loading status check…';
  section.appendChild(statusContainer);

  const resultsSection = document.createElement('section');
  resultsSection.className = 'results';

  const resultsHeading = document.createElement('h3');
  resultsHeading.textContent = 'Results';
  resultsSection.appendChild(resultsHeading);

  const resultsList = document.createElement('div');
  resultsList.className = 'results-list';
  resultsSection.appendChild(resultsList);

  const pager = createPager({
    page: 1,
    hasPrev: false,
    hasNext: false,
    onPrev: () => {},
    onNext: () => {},
  });
  resultsSection.appendChild(pager);

  const savedSection = document.createElement('section');
  savedSection.className = 'home-saved';

  const savedHeading = document.createElement('h2');
  savedHeading.textContent = 'Saved searches';
  savedSection.appendChild(savedHeading);

  const savedList = document.createElement('div');
  savedList.className = 'home-saved__list';
  savedSection.appendChild(savedList);

  const timelineSection = document.createElement('section');
  timelineSection.className = 'home-timeline';

  const timelineHeading = document.createElement('h2');
  timelineHeading.textContent = 'Collection overview';
  timelineSection.appendChild(timelineHeading);

  const timelineHandle = createTimeline({ series: [] });
  const timelineBlock = createChartBlock('Cross-source timeline', timelineHandle.element);
  timelineSection.appendChild(timelineBlock);

  const totalsHeading = document.createElement('h3');
  totalsHeading.textContent = 'Totals by source';
  timelineSection.appendChild(totalsHeading);

  const totalsList = document.createElement('ul');
  totalsList.className = 'home-timeline__totals';
  timelineSection.appendChild(totalsList);

  const updateResults = (items: CardProps[]): void => {
    resultsList.innerHTML = '';
    if (items.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'results-placeholder';
      placeholder.textContent = 'No results yet.';
      resultsList.appendChild(placeholder);
      return;
    }

    items.forEach((item) => {
      resultsList.appendChild(createCard(item));
    });
  };

  updateResults([]);

  el.appendChild(section);
  el.appendChild(resultsSection);
  el.appendChild(savedSection);
  el.appendChild(timelineSection);

  setSiteStatus('loading');

  const renderSavedSearches = (): void => {
    const entries = gatherSavedSearches();
    savedList.innerHTML = '';
    if (entries.length === 0) {
      const placeholder = document.createElement('p');
      placeholder.className = 'results-placeholder';
      placeholder.textContent = 'No saved searches yet.';
      savedList.appendChild(placeholder);
      return;
    }

    entries.forEach(({ source, entry }) => {
      const card = document.createElement('article');
      card.className = 'saved-search';

      const title = document.createElement('h4');
      title.textContent = entry.label;
      card.appendChild(title);

      const sourceInfo = SOURCE_ROUTES[source]?.label ?? source;
      const meta = document.createElement('p');
      meta.className = 'saved-search__meta';
      meta.textContent = sourceInfo;
      card.appendChild(meta);

      const queryString = new URLSearchParams(entry.query).toString();
      const query = document.createElement('p');
      query.className = 'saved-search__query';
      query.textContent = queryString.length > 0 ? `Query: ${queryString}` : 'Default query';
      card.appendChild(query);

      const actions = document.createElement('div');
      actions.className = 'saved-search__actions';

      const runButton = document.createElement('button');
      runButton.type = 'button';
      runButton.textContent = 'Run';
      runButton.addEventListener('click', () => {
        const config = SOURCE_ROUTES[source];
        if (!config) {
          return;
        }
        const base = import.meta.env.BASE_URL ?? '/';
        const search = new URLSearchParams(entry.query).toString();
        const href = `${base}${config.route}${search ? `?${search}` : ''}`;
        window.location.href = href;
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => {
        deleteSavedSearch(source, entry.id);
        renderSavedSearches();
      });

      actions.append(runButton, deleteButton);
      card.appendChild(actions);

      savedList.appendChild(card);
    });
  };

  const searchParams = new URLSearchParams(window.location.search);

  const fetchHarvardSummary = async (): Promise<SourceSummary> => {
    const query = {
      q: searchParams.get('harvard.q') ?? '',
      classification: searchParams.get('harvard.classification') ?? '',
      century: searchParams.get('harvard.century') ?? '',
    };
    const params = {
      ...toQuery({
        q: query.q,
        classification: query.classification,
        century: query.century,
        size: AGGREGATE_LIMIT,
        page: 1,
      }),
      ttl: 900,
    };
    const response = await fetchJSON<unknown>('/harvard-art/object', params);
    const cards = toHarvardItemCards(response).slice(0, AGGREGATE_LIMIT);
    return { cards, total: getHarvardTotal(response) };
  };

  const fetchPrincetonSummary = async (): Promise<SourceSummary> => {
    const query = {
      q: searchParams.get('princeton.q') ?? '',
    };
    const params = {
      ...toQuery({
        q: query.q,
        size: AGGREGATE_LIMIT,
        page: 1,
      }),
      ttl: 900,
    };
    const response = await fetchJSON<unknown>('/princeton-art/objects', params);
    const cards = toPrincetonItemCards(response).slice(0, AGGREGATE_LIMIT);
    return { cards, total: getPrincetonTotal(response) };
  };

  const fetchUbcSummary = async (): Promise<SourceSummary> => {
    const query = {
      q: searchParams.get('ubc.q') ?? '',
    };
    const params = {
      ...toQuery({
        q: query.q,
        limit: AGGREGATE_LIMIT,
        page: 1,
      }),
      ttl: 900,
    };
    const response = await fetchJSON<unknown>('/ubc/search', params);
    const cards = toUbcItemCards(response).slice(0, AGGREGATE_LIMIT);
    return { cards, total: getUbcTotal(response) };
  };

  const fetchArxivSummary = async (): Promise<SourceSummary> => {
    const query = {
      search_query: searchParams.get('arxiv.search_query') ?? '',
      sortBy: searchParams.get('arxiv.sortBy') ?? '',
      sortOrder: searchParams.get('arxiv.sortOrder') ?? '',
    };
    const searchQuery = query.search_query.trim().length > 0 ? query.search_query : 'all';
    const params = {
      ...toQuery({
        search_query: searchQuery,
        max_results: AGGREGATE_LIMIT,
        start: 0,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      ttl: 900,
    };
    const response = await fetchText('/arxiv/search', params);
    const cards = toArxivItemCards(response).slice(0, AGGREGATE_LIMIT);
    return { cards, total: extractArxivTotal(response) };
  };

  const loadSummaries = async (): Promise<void> => {
    totalsList.innerHTML = '';
    const loadingItem = document.createElement('li');
    loadingItem.textContent = 'Loading cross-source summary…';
    totalsList.appendChild(loadingItem);

    const configs = [
      { label: SOURCE_ROUTES.harvard.label, fetch: fetchHarvardSummary },
      { label: SOURCE_ROUTES.princeton.label, fetch: fetchPrincetonSummary },
      { label: SOURCE_ROUTES.ubc.label, fetch: fetchUbcSummary },
      { label: SOURCE_ROUTES.arxiv.label, fetch: fetchArxivSummary },
    ];

    const results = await Promise.allSettled(configs.map((config) => config.fetch()));

    totalsList.innerHTML = '';
    const series: TimelineSeries[] = [];

    results.forEach((result, index) => {
      const config = configs[index];
      if (result.status === 'fulfilled') {
        const { cards, total } = result.value;
        const points = toTimelinePoints(cards);
        if (points.length > 0) {
          series.push({ name: config.label, points });
        }
        const value = typeof total === 'number' ? total : cards.length;
        const item = document.createElement('li');
        item.innerHTML = `<strong>${config.label}:</strong> ${value.toLocaleString()}`;
        totalsList.appendChild(item);
      } else {
        const item = document.createElement('li');
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        item.innerHTML = `<strong>${config.label}:</strong> ${reason || 'Unable to load summary'}`;
        totalsList.appendChild(item);
      }
    });

    if (totalsList.childElementCount === 0) {
      const item = document.createElement('li');
      item.textContent = 'No summary data available.';
      totalsList.appendChild(item);
    }

    timelineHandle.setSeries(series);
  };

  renderSavedSearches();
  loadSummaries().catch((error: unknown) => {
    totalsList.innerHTML = '';
    const item = document.createElement('li');
    const message = error instanceof Error ? error.message : String(error);
    item.textContent = `Unable to load summary: ${message}`;
    totalsList.appendChild(item);
    timelineHandle.setSeries([]);
  });

  window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('art:saved-searches:')) {
      renderSavedSearches();
    }
  });

  fetchJSON<DiagResponse>('/diag')
    .then((data) => {
      renderStatus(statusContainer, data);
      setSiteStatus(data.ok ? 'ok' : 'error', data.ok ? 'Online' : 'Check service');

      const endpointSummary = (data.endpoints ?? []).slice(0, 2).join(', ');
      const keyEntries = Object.entries(data.keys ?? {}).slice(0, 2);

      const results: CardProps[] = [
        {
          title: data.ok ? 'Service online' : 'Service issue detected',
          sub: data.now ? `Reported ${data.now}` : undefined,
          meta: endpointSummary.length > 0 ? `Endpoints: ${endpointSummary}` : undefined,
        },
      ];

      if (endpointSummary.length === 0 && (data.endpoints ?? []).length > 0) {
        const [firstEndpoint] = data.endpoints ?? [];
        if (typeof firstEndpoint === 'string' && firstEndpoint.length > 0) {
          results.push({
            title: firstEndpoint,
            sub: 'Endpoint',
            meta: data.ok ? 'Reachable' : 'Check status',
          });
        }
      }

      if (keyEntries.length > 0) {
        const [firstKey] = keyEntries[0];
        const keyMeta = keyEntries.map(([key, value]) => `${key}: ${String(value)}`).join(', ');
        results.push({
          title: `Key ${firstKey}`,
          sub: `${keyEntries.length} key${keyEntries.length === 1 ? '' : 's'}`,
          meta: keyMeta,
        });
      }

      updateResults(results.slice(0, 3));
    })
    .catch((error: Error) => {
      statusContainer.innerHTML = '';
      const alert = createAlert(`Unable to load status diagnostics: ${error.message}`, 'error');
      section.insertBefore(alert, statusContainer);
      statusContainer.textContent = 'Status information is unavailable.';
      setSiteStatus('error', 'Unavailable');
      updateResults([]);
    });
};

export default mount;
