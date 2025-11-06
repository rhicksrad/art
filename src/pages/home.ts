import { toItemCards as toHarvardItemCards } from "../adapters/harvard";
import { toItemCards as toPrincetonItemCards } from "../adapters/princeton";
import { toItemCards as toUbcItemCards } from "../adapters/ubc";
import { toItemCards as toArxivItemCards } from "../adapters/arxiv";
import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { createChartBlock } from "../components/ChartBlock";
import { createTimeline, TimelineSeries } from "../components/Timeline";
import { setSiteStatus } from "../components/SiteHeader";
import { fetchJSON, fetchText } from "../lib/http";
import { toQuery } from "../lib/params";
import { extractYear } from "../lib/analytics";
import { deleteSearch, listSearches, SavedSearch } from "../lib/store";

const AGGREGATION_SLICE_SIZE = 40;
const MAX_TIMELINE_DECADES = 18;

const DEFAULT_QUERIES: Record<SourceKey, Record<string, string>> = {
  harvard: {},
  princeton: {},
  ubc: {},
  arxiv: { search_query: "all" },
};

type DiagResponse = {
  ok: boolean;
  now?: string;
  endpoints?: string[];
  keys?: Record<string, boolean>;
};

type SourceKey = "harvard" | "princeton" | "ubc" | "arxiv";

type AggregationSlice = {
  years: number[];
  total?: number;
};

type SourceConfig = {
  key: SourceKey;
  label: string;
  fetchSlice: (query: Record<string, string>) => Promise<AggregationSlice>;
  summaryKeys: string[];
};

type AggregationResult = {
  key: SourceKey;
  label: string;
  years: number[];
  total?: number;
  error?: string;
};

const getHarvardTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }
  const info = (resp as { info?: { totalrecords?: number; totalrecordsperquery?: number } }).info;
  if (!info) return undefined;
  if (typeof info.totalrecords === "number") return info.totalrecords;
  if (typeof info.totalrecordsperquery === "number") return info.totalrecordsperquery;
  return undefined;
};

const getPrincetonTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }
  const pagination = (resp as { pagination?: { total?: number; total_count?: number } }).pagination;
  if (!pagination || typeof pagination !== "object") {
    return undefined;
  }
  const data = pagination as { total?: number; total_count?: number };
  if (typeof data.total === "number") return data.total;
  if (typeof data.total_count === "number") return data.total_count;
  return undefined;
};

const getUbcTotal = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }
  const data = resp as { total?: number; resultCount?: number };
  if (typeof data.total === "number") return data.total;
  if (typeof data.resultCount === "number") return data.resultCount;
  return undefined;
};

const extractArxivTotal = (xml: string): number | undefined => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return undefined;
  }
  const totalNode =
    doc.querySelector("opensearch\\:totalResults") ?? doc.querySelector("totalResults");
  const text = totalNode?.textContent?.trim();
  if (!text) {
    return undefined;
  }
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? undefined : value;
};

const fetchHarvardSlice = async (query: Record<string, string>): Promise<AggregationSlice> => {
  const params = toQuery({
    ...query,
    page: 1,
    size: AGGREGATION_SLICE_SIZE,
  });
  const response = await fetchJSON<unknown>("/harvard-art/object", params);
  const cards = toHarvardItemCards(response);
  const years = cards
    .slice(0, AGGREGATION_SLICE_SIZE)
    .map((card) => extractYear(card.date))
    .filter((value): value is number => typeof value === "number");
  return { years, total: getHarvardTotal(response) };
};

const fetchPrincetonSlice = async (query: Record<string, string>): Promise<AggregationSlice> => {
  const params = toQuery({
    ...query,
    page: 1,
    size: AGGREGATION_SLICE_SIZE,
  });
  const response = await fetchJSON<unknown>("/princeton-art/objects", params);
  const cards = toPrincetonItemCards(response);
  const years = cards
    .slice(0, AGGREGATION_SLICE_SIZE)
    .map((card) => extractYear(card.date))
    .filter((value): value is number => typeof value === "number");
  return { years, total: getPrincetonTotal(response) };
};

const fetchUbcSlice = async (query: Record<string, string>): Promise<AggregationSlice> => {
  const params = toQuery({
    ...query,
    page: query.page ?? "1",
    limit: AGGREGATION_SLICE_SIZE,
  });
  const response = await fetchJSON<unknown>("/ubc/search", params);
  const cards = toUbcItemCards(response);
  const years = cards
    .slice(0, AGGREGATION_SLICE_SIZE)
    .map((card) => extractYear(card.date))
    .filter((value): value is number => typeof value === "number");
  return { years, total: getUbcTotal(response) };
};

const fetchArxivSlice = async (query: Record<string, string>): Promise<AggregationSlice> => {
  const params = toQuery({
    ...DEFAULT_QUERIES.arxiv,
    ...query,
    start: 0,
    max_results: AGGREGATION_SLICE_SIZE,
  });
  const response = await fetchText("/arxiv/search", params);
  const cards = toArxivItemCards(response);
  const years = cards
    .slice(0, AGGREGATION_SLICE_SIZE)
    .map((card) => extractYear(card.date))
    .filter((value): value is number => typeof value === "number");
  return { years, total: extractArxivTotal(response) };
};

const SOURCE_CONFIGS: SourceConfig[] = [
  {
    key: "harvard",
    label: "Harvard Art Museums",
    fetchSlice: fetchHarvardSlice,
    summaryKeys: ["q", "classification", "century"],
  },
  {
    key: "princeton",
    label: "Princeton Art Museum",
    fetchSlice: fetchPrincetonSlice,
    summaryKeys: ["q"],
  },
  {
    key: "ubc",
    label: "UBC Open Collections",
    fetchSlice: fetchUbcSlice,
    summaryKeys: ["q"],
  },
  {
    key: "arxiv",
    label: "arXiv",
    fetchSlice: fetchArxivSlice,
    summaryKeys: ["search_query"],
  },
];

const SOURCE_CONFIG_MAP = new Map<SourceKey, SourceConfig>(
  SOURCE_CONFIGS.map((config) => [config.key, config])
);

const describeSavedSearch = (sourceKey: SourceKey, search: SavedSearch): string => {
  if (typeof search.label === "string" && search.label.trim().length > 0) {
    return search.label.trim();
  }
  const config = SOURCE_CONFIG_MAP.get(sourceKey);
  const query = search.query ?? {};
  const keys = config?.summaryKeys ?? [];
  for (const key of keys) {
    const value = query[key];
    if (typeof value === "string" && value.length > 0) {
      if (key === "q" || key === "search_query") {
        return value;
      }
      return `${key}: ${value}`;
    }
  }
  const entries = Object.entries(query);
  if (entries.length === 0) {
    return "All records";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
};

const formatTimestamp = (timestamp: number): string | undefined => {
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleString();
};

const toDecadePoints = (years: number[]): TimelineSeries["points"] => {
  const counts = new Map<number, number>();
  years.forEach((year) => {
    const decade = Math.floor(year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  const limited =
    sorted.length > MAX_TIMELINE_DECADES
      ? sorted.slice(sorted.length - MAX_TIMELINE_DECADES)
      : sorted;
  return limited.map(([decade, count]) => ({ x: decade, y: count }));
};

const renderStatus = (container: HTMLElement, data: DiagResponse): void => {
  container.innerHTML = "";

  const okRow = document.createElement("p");
  okRow.innerHTML = `<strong>ok:</strong> ${String(data.ok)}`;

  const nowRow = document.createElement("p");
  nowRow.innerHTML = `<strong>now:</strong> ${data.now ?? "unknown"}`;

  const endpointsList = document.createElement("ul");
  endpointsList.className = "status-list";
  (data.endpoints ?? []).forEach((endpoint) => {
    const item = document.createElement("li");
    item.textContent = endpoint;
    endpointsList.appendChild(item);
  });

  const endpointsWrapper = document.createElement("div");
  const endpointsTitle = document.createElement("strong");
  endpointsTitle.textContent = "endpoints:";
  endpointsWrapper.append(endpointsTitle);
  if (endpointsList.childElementCount > 0) {
    endpointsWrapper.appendChild(endpointsList);
  } else {
    const none = document.createElement("p");
    none.textContent = "No endpoints reported.";
    endpointsWrapper.appendChild(none);
  }

  const keysWrapper = document.createElement("div");
  const keysTitle = document.createElement("strong");
  keysTitle.textContent = "keys:";
  keysWrapper.appendChild(keysTitle);

  const keysList = document.createElement("ul");
  keysList.className = "status-list";
  const keysEntries = Object.entries(data.keys ?? {});
  if (keysEntries.length === 0) {
    const none = document.createElement("p");
    none.textContent = "No key information.";
    keysWrapper.appendChild(none);
  } else {
    keysEntries.forEach(([key, value]) => {
      const item = document.createElement("li");
      item.textContent = `keys.${key}: ${String(value)}`;
      keysList.appendChild(item);
    });
    keysWrapper.appendChild(keysList);
  }

  container.append(okRow, nowRow, endpointsWrapper, keysWrapper);
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const section = document.createElement("section");
  section.className = "home-status";

  const heading = document.createElement("h2");
  heading.textContent = "Service diagnostics";
  section.appendChild(heading);

  const statusContainer = document.createElement("div");
  statusContainer.className = "status-container";
  statusContainer.textContent = "Loading status check…";
  section.appendChild(statusContainer);

  const savedSection = document.createElement("section");
  savedSection.className = "home-saved";
  const savedHeading = document.createElement("h2");
  savedHeading.textContent = "Saved searches";
  savedSection.appendChild(savedHeading);
  const savedContainer = document.createElement("div");
  savedContainer.className = "saved-searches";
  savedSection.appendChild(savedContainer);

  const summarySection = document.createElement("section");
  summarySection.className = "home-summary";
  const summaryHeading = document.createElement("h2");
  summaryHeading.textContent = "Cross-source summary";
  summarySection.appendChild(summaryHeading);

  const timelineHandle = createTimeline({ series: [] });
  const timelineBlock = createChartBlock(
    "Per-decade timeline",
    timelineHandle.element
  );
  summarySection.appendChild(timelineBlock);

  const timelineStatus = document.createElement("p");
  timelineStatus.className = "timeline-status";
  timelineStatus.textContent = "Timeline not loaded yet.";
  summarySection.appendChild(timelineStatus);

  const totalsList = document.createElement("ul");
  totalsList.className = "timeline-summary";
  summarySection.appendChild(totalsList);

  const resultsSection = document.createElement("section");
  resultsSection.className = "results";

  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "Results";
  resultsSection.appendChild(resultsHeading);

  const resultsList = document.createElement("div");
  resultsList.className = "results-list";
  resultsSection.appendChild(resultsList);

  const pager = createPager({
    page: 1,
    hasPrev: false,
    hasNext: false,
    onPrev: () => {},
    onNext: () => {},
  });
  resultsSection.appendChild(pager);

  const updateResults = (items: CardProps[]): void => {
    resultsList.innerHTML = "";
    if (items.length === 0) {
      const placeholder = document.createElement("p");
      placeholder.className = "results-placeholder";
      placeholder.textContent = "No results yet.";
      resultsList.appendChild(placeholder);
      return;
    }

    items.forEach((item) => {
      resultsList.appendChild(createCard(item));
    });
  };

  updateResults([]);

  el.append(section, savedSection, summarySection, resultsSection);

  const savedSearchState: Record<SourceKey, SavedSearch[]> = {
    harvard: [],
    princeton: [],
    ubc: [],
    arxiv: [],
  };
  const activeSearchIds: Partial<Record<SourceKey, string>> = {};
  const currentQueries: Record<SourceKey, Record<string, string>> = {
    harvard: { ...DEFAULT_QUERIES.harvard },
    princeton: { ...DEFAULT_QUERIES.princeton },
    ubc: { ...DEFAULT_QUERIES.ubc },
    arxiv: { ...DEFAULT_QUERIES.arxiv },
  };

  let aggregationToken = 0;
  let isAggregating = false;

  const syncActiveSearch = (key: SourceKey): void => {
    const entries = savedSearchState[key];
    const activeId = activeSearchIds[key];
    if (activeId) {
      const match = entries.find((entry) => entry.id === activeId);
      if (match) {
        currentQueries[key] = { ...match.query };
        return;
      }
    }
    const [first] = entries;
    if (first) {
      activeSearchIds[key] = first.id;
      currentQueries[key] = { ...first.query };
    } else {
      delete activeSearchIds[key];
      currentQueries[key] = { ...DEFAULT_QUERIES[key] };
    }
  };

  const refreshSavedSearches = (): void => {
    SOURCE_CONFIGS.forEach((config) => {
      savedSearchState[config.key] = listSearches(config.key);
      syncActiveSearch(config.key);
    });
  };

  function runSavedSearch(sourceKey: SourceKey, search: SavedSearch): void {
    activeSearchIds[sourceKey] = search.id;
    currentQueries[sourceKey] = { ...search.query };
    renderSavedSearches();
    void runAggregation();
  }

  function removeSavedSearch(sourceKey: SourceKey, id: string): void {
    deleteSearch(sourceKey, id);
    savedSearchState[sourceKey] = listSearches(sourceKey);
    syncActiveSearch(sourceKey);
    renderSavedSearches();
    void runAggregation();
  }

  function renderSavedSearches(): void {
    savedContainer.innerHTML = "";
    SOURCE_CONFIGS.forEach((config) => {
      const group = document.createElement("div");
      group.className = "saved-searches__group";

      const title = document.createElement("h3");
      title.className = "saved-searches__title";
      title.textContent = config.label;
      group.appendChild(title);

      const entries = savedSearchState[config.key];
      if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "saved-searches__empty";
        empty.textContent = "No saved searches. Using default query.";
        group.appendChild(empty);
      } else {
        const list = document.createElement("ul");
        list.className = "saved-searches__list";

        entries.forEach((search) => {
          const item = document.createElement("li");
          item.className = "saved-searches__item";
          const isActive = activeSearchIds[config.key] === search.id;
          if (isActive) {
            item.classList.add("saved-searches__item--active");
          }

          const label = document.createElement("span");
          label.className = "saved-searches__label";
          label.textContent = describeSavedSearch(config.key, search);
          item.appendChild(label);

          const timestamp = formatTimestamp(search.createdAt);
          if (timestamp) {
            const meta = document.createElement("small");
            meta.className = "saved-searches__meta";
            meta.textContent = timestamp;
            item.appendChild(meta);
          }

          if (isActive) {
            const badge = document.createElement("span");
            badge.className = "saved-searches__badge";
            badge.textContent = "Active";
            item.appendChild(badge);
          }

          const actions = document.createElement("div");
          actions.className = "saved-searches__actions";

          const runButton = document.createElement("button");
          runButton.type = "button";
          runButton.textContent = "Run";
          runButton.disabled = isAggregating || isActive;
          runButton.addEventListener("click", () => {
            runSavedSearch(config.key, search);
          });
          actions.appendChild(runButton);

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.textContent = "Delete";
          deleteButton.disabled = isAggregating;
          deleteButton.addEventListener("click", () => {
            removeSavedSearch(config.key, search.id);
          });
          actions.appendChild(deleteButton);

          item.appendChild(actions);
          list.appendChild(item);
        });

        group.appendChild(list);
      }

      savedContainer.appendChild(group);
    });
  }

  async function runAggregation(): Promise<void> {
    const token = ++aggregationToken;
    isAggregating = true;
    timelineStatus.textContent = "Loading timeline…";
    timelineHandle.setSeries([]);
    totalsList.innerHTML = "";
    renderSavedSearches();

    try {
    const results = await Promise.all(
        SOURCE_CONFIGS.map(async (config): Promise<AggregationResult> => {
          const baseQuery = currentQueries[config.key];
          const effectiveQuery =
            baseQuery && Object.keys(baseQuery).length > 0
              ? baseQuery
              : DEFAULT_QUERIES[config.key];
          try {
            const slice = await config.fetchSlice({ ...effectiveQuery });
            return {
              key: config.key,
              label: config.label,
              years: slice.years,
              total: slice.total,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              key: config.key,
              label: config.label,
              years: [],
              error: message,
            };
          }
        })
      );

      if (token !== aggregationToken) {
        return;
      }

      const series: TimelineSeries[] = results
        .filter((result) => result.years.length > 0)
        .map((result) => ({
          name: result.label,
          points: toDecadePoints(result.years),
        }));

      timelineHandle.setSeries(series);

      totalsList.innerHTML = "";
      results.forEach((result) => {
        const item = document.createElement("li");
        item.className = "timeline-summary__item";

        const label = document.createElement("span");
        label.className = "timeline-summary__label";
        label.textContent = result.label;
        item.appendChild(label);

        const value = document.createElement("strong");
        value.className = "timeline-summary__value";
        if (typeof result.total === "number" && Number.isFinite(result.total)) {
          value.textContent = result.total.toLocaleString();
        } else if (result.error) {
          value.textContent = "Error";
        } else {
          value.textContent = "n/a";
        }
        item.appendChild(value);

        if (result.error) {
          const errorNote = document.createElement("span");
          errorNote.className = "timeline-summary__error";
          errorNote.textContent = result.error;
          item.appendChild(errorNote);
        } else if (result.years.length > 0) {
          const countNote = document.createElement("span");
          countNote.className = "timeline-summary__count";
          countNote.textContent = `${result.years.length} sample${
            result.years.length === 1 ? "" : "s"
          }`;
          item.appendChild(countNote);
        }

        totalsList.appendChild(item);
      });

      if (totalsList.childElementCount === 0) {
        const empty = document.createElement("li");
        empty.className = "timeline-summary__item timeline-summary__item--empty";
        empty.textContent = "No totals available.";
        totalsList.appendChild(empty);
      }

      if (series.length === 0) {
        timelineStatus.textContent = "No timeline data available for the selected queries.";
      } else if (results.some((result) => typeof result.error === "string" && result.error.length > 0)) {
        timelineStatus.textContent = "Timeline updated with partial data.";
      } else {
        timelineStatus.textContent = "Timeline updated.";
      }
    } catch (error) {
      if (token !== aggregationToken) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      timelineHandle.setSeries([]);
      totalsList.innerHTML = "";
      const failure = document.createElement("li");
      failure.className = "timeline-summary__item timeline-summary__item--error";
      failure.textContent = `Timeline failed: ${message}`;
      totalsList.appendChild(failure);
      timelineStatus.textContent = "Timeline failed to load.";
    } finally {
      if (token === aggregationToken) {
        isAggregating = false;
        renderSavedSearches();
      }
    }
  }

  refreshSavedSearches();
  renderSavedSearches();
  void runAggregation();

  setSiteStatus("loading");

  fetchJSON<DiagResponse>("/diag")
    .then((data) => {
      renderStatus(statusContainer, data);
      setSiteStatus(data.ok ? "ok" : "error", data.ok ? "Online" : "Check service");

      const endpointSummary = (data.endpoints ?? []).slice(0, 2).join(", ");
      const keyEntries = Object.entries(data.keys ?? {}).slice(0, 2);

      const results: CardProps[] = [
        {
          title: data.ok ? "Service online" : "Service issue detected",
          sub: data.now ? `Reported ${data.now}` : undefined,
          meta:
            endpointSummary.length > 0
              ? `Endpoints: ${endpointSummary}`
              : undefined,
        },
      ];

      if (endpointSummary.length === 0 && (data.endpoints ?? []).length > 0) {
        const [firstEndpoint] = data.endpoints ?? [];
        if (typeof firstEndpoint === "string" && firstEndpoint.length > 0) {
          results.push({
            title: firstEndpoint,
            sub: "Endpoint",
            meta: data.ok ? "Reachable" : "Check status",
          });
        }
      }

      if (keyEntries.length > 0) {
        const [firstKey] = keyEntries[0];
        const keyMeta = keyEntries
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(", ");
        results.push({
          title: `Key ${firstKey}`,
          sub: `${keyEntries.length} key${keyEntries.length === 1 ? "" : "s"}`,
          meta: keyMeta,
        });
      }

      updateResults(results.slice(0, 3));
    })
    .catch((error: Error) => {
      statusContainer.innerHTML = "";
      const alert = createAlert(
        `Unable to load status diagnostics: ${error.message}`,
        "error"
      );
      section.insertBefore(alert, statusContainer);
      statusContainer.textContent = "Status information is unavailable.";
      setSiteStatus("error", "Unavailable");
      updateResults([]);
    });
};

export default mount;
