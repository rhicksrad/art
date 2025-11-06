import { toItemCards as toPrincetonItemCards } from "../adapters/princeton";
import { createAlert } from "../components/Alert";
import { renderItemCard } from "../components/Card";
import { createPager } from "../components/Pager";
import { createSearchForm } from "../components/SearchForm";
import { fetchJSON } from "../lib/http";
import { int, pageFromUrl, toQuery } from "../lib/params";

const PAGE_SIZE = 12;

const getTotalRecords = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }

  const data = resp as Record<string, unknown>;

  const direct = data.count ?? data.total ?? data.total_count;
  if (typeof direct === "number") {
    return direct;
  }

  const info = data.info;
  if (info && typeof info === "object") {
    const infoData = info as Record<string, unknown>;
    const infoTotal = infoData.total ?? infoData.total_count;
    if (typeof infoTotal === "number") {
      return infoTotal;
    }
  }

  const pagination = data.pagination;
  if (pagination && typeof pagination === "object") {
    const paginationData = pagination as Record<string, unknown>;
    const paginationTotal = paginationData.total ?? paginationData.total_count;
    if (typeof paginationTotal === "number") {
      return paginationTotal;
    }
  }

  return undefined;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => ({
  q: query.q ?? "",
  page: query.page ?? "1",
});

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    q: searchParams.get("q") ?? "",
    page: String(pageFromUrl()),
  });

  let currentQuery = { ...initialQuery };
  let currentPage = int(currentQuery.page, 1);
  let isLoading = false;
  let requestToken = 0;

  el.innerHTML = "";

  const alertContainer = document.createElement("div");
  const resultsInfo = document.createElement("p");
  resultsInfo.className = "results-count";
  resultsInfo.textContent = "0 results";

  const resultsList = document.createElement("div");
  resultsList.className = "results-list";

  const renderCards = (cards: ReturnType<typeof toPrincetonItemCards>): void => {
    resultsList.innerHTML = "";
    if (cards.length === 0) {
      const placeholder = document.createElement("p");
      placeholder.className = "results-placeholder";
      placeholder.textContent = "No results found.";
      resultsList.appendChild(placeholder);
      return;
    }

    cards.forEach((card) => {
      resultsList.appendChild(renderItemCard(card));
    });
  };

  const updateInfo = (total: number | undefined, count: number): void => {
    const value = typeof total === "number" ? total : count;
    resultsInfo.textContent = `${value} results`;
  };

  const updateLocation = (query: Record<string, string>): void => {
    const sanitized = sanitizeQuery(query);
    const search = new URLSearchParams(toQuery(sanitized)).toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  };

  const submitForm = (values: Record<string, string>): void => {
    const nextQuery = sanitizeQuery({ ...values, page: "1" });
    currentQuery = nextQuery;
    currentPage = 1;
    void performSearch();
  };

  const { element: form, setValues } = createSearchForm({
    fields: [
      {
        name: "q",
        label: "Keyword",
        type: "text",
        placeholder: "Search Princeton University Art Museum",
        value: currentQuery.q,
      },
    ],
    onSubmit: submitForm,
  });

  setValues({ q: currentQuery.q });

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

  const requestParamsFromQuery = (query: Record<string, string>) => {
    return toQuery({
      q: query.q,
      size: PAGE_SIZE,
      page: int(query.page, 1),
    });
  };

  const performSearch = async (): Promise<void> => {
    const pageNumber = Math.max(1, int(currentQuery.page, 1));
    currentQuery.page = String(pageNumber);
    currentPage = pageNumber;

    const requestParams = requestParamsFromQuery(currentQuery);
    const token = ++requestToken;
    isLoading = true;
    alertContainer.innerHTML = "";
    resultsList.innerHTML = "";
    resultsInfo.textContent = "Loading…";
    pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext: false });
    updateLocation(currentQuery);
    setValues({ q: currentQuery.q });

    try {
      const response = await fetchJSON<unknown>("/princeton-art/objects", requestParams);
      if (token !== requestToken) {
        return;
      }

      const cards = toPrincetonItemCards(response);
      const total = getTotalRecords(response);
      const hasNext = typeof total === "number"
        ? pageNumber * PAGE_SIZE < total
        : cards.length === PAGE_SIZE;

      renderCards(cards);
      updateInfo(total, cards.length);
      pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext });
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      renderCards([]);
      resultsInfo.textContent = "0 results";
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(
        createAlert(`Princeton search failed: ${message}`, "error"),
      );
      pager.update({ page: pageNumber, hasPrev: pageNumber > 1, hasNext: false });
    } finally {
      if (token === requestToken) {
        isLoading = false;
      }
    }
  };

  el.append(form, alertContainer, resultsInfo, resultsList, pager);

  performSearch().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    alertContainer.replaceChildren(
      createAlert(`Princeton search failed: ${message}`, "error"),
    );
  });
};

export default mount;
