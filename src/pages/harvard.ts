import { toItemCards as toHarvardItemCards } from "../adapters/harvard";
import { createAlert } from "../components/Alert";
import { renderItemCard } from "../components/Card";
import { createPager } from "../components/Pager";
import { createSearchForm } from "../components/SearchForm";
import { fetchJSON } from "../lib/http";
import { int, pageFromUrl, toQuery } from "../lib/params";

const PAGE_SIZE = 12;

const CLASSIFICATION_OPTIONS = [
  { value: "", label: "Any classification" },
  { value: "Prints", label: "Prints" },
  { value: "Paintings", label: "Paintings" },
  { value: "Drawings", label: "Drawings" },
  { value: "Photographs", label: "Photographs" },
];

const CENTURY_OPTIONS = [
  { value: "", label: "Any century" },
  { value: "16th century", label: "16th century" },
  { value: "17th century", label: "17th century" },
  { value: "18th century", label: "18th century" },
  { value: "19th century", label: "19th century" },
  { value: "20th century", label: "20th century" },
  { value: "21st century", label: "21st century" },
];

const getTotalRecords = (resp: unknown): number | undefined => {
  if (!resp || typeof resp !== "object") {
    return undefined;
  }

  const info = (resp as { info?: { totalrecords?: number; totalrecordsperquery?: number } }).info;
  if (!info) return undefined;
  if (typeof info.totalrecords === "number") return info.totalrecords;
  if (typeof info.totalrecordsperquery === "number") return info.totalrecordsperquery;
  return undefined;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => {
  return {
    q: query.q ?? "",
    classification: query.classification ?? "",
    century: query.century ?? "",
    page: query.page ?? "1",
  };
};

const mount = (el: HTMLElement): void => {
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = sanitizeQuery({
    q: searchParams.get("q") ?? "",
    classification: searchParams.get("classification") ?? "",
    century: searchParams.get("century") ?? "",
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

  const renderCards = (cards: ReturnType<typeof toHarvardItemCards>): void => {
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
    const urlQuery = toQuery({
      q: sanitized.q,
      classification: sanitized.classification,
      century: sanitized.century,
      page: sanitized.page,
    });
    const search = new URLSearchParams(urlQuery).toString();
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
        placeholder: "Search Harvard Art Museums",
        value: currentQuery.q,
      },
      {
        name: "classification",
        label: "Classification",
        type: "select",
        placeholder: "Any classification",
        options: CLASSIFICATION_OPTIONS.filter((option) => option.value !== ""),
        value: currentQuery.classification,
      },
      {
        name: "century",
        label: "Century",
        type: "select",
        placeholder: "Any century",
        options: CENTURY_OPTIONS.filter((option) => option.value !== ""),
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

  const requestParamsFromQuery = (query: Record<string, string>) => {
    return toQuery({
      q: query.q,
      classification: query.classification,
      century: query.century,
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
    setValues({
      q: currentQuery.q,
      classification: currentQuery.classification,
      century: currentQuery.century,
    });

    try {
      const response = await fetchJSON<unknown>("/harvard-art/object", requestParams);
      if (token !== requestToken) {
        return;
      }

      const cards = toHarvardItemCards(response);
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
        createAlert(`Harvard search failed: ${message}`, "error"),
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
      createAlert(`Harvard search failed: ${message}`, "error"),
    );
  });
};

export default mount;
