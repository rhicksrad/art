import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { fetchJSON } from "../lib/http";

type PrincetonResponse = {
  count?: number;
  info?: {
    total?: number;
    total_count?: number;
  };
  pagination?: {
    total?: number;
    total_count?: number;
  };
  records?: unknown[];
  results?: unknown[];
  data?: unknown[];
  hits?: unknown[];
};

const getRecordCount = (data: PrincetonResponse): number | undefined => {
  if (Array.isArray(data.records)) return data.records.length;
  if (Array.isArray(data.results)) return data.results.length;
  if (Array.isArray(data.data)) return data.data.length;
  if (Array.isArray(data.hits)) return data.hits.length;
  return undefined;
};

const getTotal = (data: PrincetonResponse): number | undefined => {
  return (
    (typeof data.count === "number" ? data.count : undefined) ??
    data.info?.total ??
    data.info?.total_count ??
    data.pagination?.total ??
    data.pagination?.total_count
  );
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running Princeton University Art Museum probe…";
  el.appendChild(status);

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

  const extractRecords = (data: PrincetonResponse): unknown[] => {
    if (Array.isArray(data.records) && data.records.length > 0) return data.records;
    if (Array.isArray(data.results) && data.results.length > 0) return data.results;
    if (Array.isArray(data.data) && data.data.length > 0) return data.data;
    if (Array.isArray(data.hits) && data.hits.length > 0) return data.hits;
    return [];
  };

  const firstString = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const result = firstString(entry);
        if (result) {
          return result;
        }
      }
    }

    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const result = firstString(entry);
        if (result) {
          return result;
        }
      }
    }

    return undefined;
  };

  const toCard = (record: unknown, index: number): CardProps => {
    if (!record || typeof record !== "object") {
      return { title: `Result #${index + 1}` };
    }

    const data = record as Record<string, unknown>;
    const title =
      firstString(data.title) ??
      firstString(data.label) ??
      firstString(data.display_title) ??
      firstString(data.name) ??
      `Result #${index + 1}`;

    const sub =
      firstString(data.display_date) ??
      firstString(data.displayDate) ??
      firstString(data.date) ??
      undefined;

    const meta =
      firstString(data.maker) ??
      firstString(data.makers) ??
      firstString(data.artist) ??
      firstString(data.artists) ??
      undefined;

    const href = firstString(data.url) ?? firstString(data.href) ?? firstString(data.link);
    const img = firstString(data.primaryimageurl) ?? firstString(data.thumbnail) ?? undefined;

    return {
      title,
      sub,
      meta,
      href,
      img,
      rawLink: !!href && /^https?:/i.test(href),
    };
  };

  updateResults([]);
  el.appendChild(resultsSection);

  fetchJSON<PrincetonResponse>("/princeton-art/objects", { size: 1 })
    .then((data) => {
      const recordCount = getRecordCount(data);
      const total = getTotal(data);

      const parts: string[] = [];
      if (typeof recordCount === "number") {
        parts.push(`${recordCount} record${recordCount === 1 ? "" : "s"}`);
      }
      if (typeof total === "number") {
        parts.push(`${total} total`);
      }

      const detail = parts.length > 0 ? parts.join(", ") : "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;

      const records = extractRecords(data).slice(0, 3);
      const results = records.map((record, index) => toCard(record, index));

      if (results.length === 0) {
        results.push({ title: "Result #1" });
      }

      updateResults(results);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(
          `Princeton University Art Museum probe failed: ${error.message}`,
          "error",
        ),
      );
      updateResults([]);
    });
};

export default mount;
