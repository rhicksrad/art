import { toItemCards as toDataverseItemCards } from "../adapters/dataverse";
import { createAlert } from "../components/Alert";
import { renderItemCard } from "../components/Card";
import { createPager } from "../components/Pager";
import { createSearchForm } from "../components/SearchForm";
import { fetchJSON } from "../lib/http";
import { int, pageFromUrl, toQuery } from "../lib/params";

const PAGE_SIZE = 12;

const TYPE_OPTIONS = [
  { value: "", label: "Any type" },
  { value: "dataverse", label: "Dataverse" },
  { value: "dataset", label: "Dataset" },
  { value: "file", label: "File" },
];

const getTotalResults = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }

  const data = resp as { total_count?: number; count?: number; data?: { total_count?: number } };
  if (typeof data.data?.total_count === "number") {
    return data.data.total_count;
  }
  if (typeof data.total_count === "number") {
    return data.total_count;
  }
  if (typeof data.count === "number") {
    return data.count;
  }
  return undefined;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => ({
  q: query.q ?? "",
  type: query.type ?? "",
  page: query.page ?? "1",
});

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    q: searchParams.get("q") ?? "",
    type: searchParams.get("type") ?? "",
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

  const renderCards = (cards: ReturnType<typeof toDataverseItemCards>): void => {
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
        placeholder: "Search Harvard Dataverse",
        value: currentQuery.q,
      },
      {
        name: "type",
        label: "Type",
        type: "select",
        placeholder: "Any type",
        options: TYPE_OPTIONS.filter((option) => option.value !== ""),
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

  const requestParamsFromQuery = (query: Record<string, string>) => {
    const pageNumber = Math.max(1, int(query.page, 1));
    return toQuery({
      q: query.q,
      type: query.type,
      per_page: PAGE_SIZE,
      start: (pageNumber - 1) * PAGE_SIZE,
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
    setValues({ q: currentQuery.q, type: currentQuery.type });

    try {
      const response = await fetchJSON<unknown>("/dataverse/search", requestParams);
      if (token !== requestToken) {
        return;
      }

      const cards = toDataverseItemCards(response);
      const total = getTotalResults(response);
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
        createAlert(`Dataverse search failed: ${message}`, "error"),
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
      createAlert(`Dataverse search failed: ${message}`, "error"),
    );
  });
};

export default mount;
