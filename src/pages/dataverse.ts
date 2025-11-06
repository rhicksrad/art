import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { fetchJSON } from "../lib/http";

type DataverseResponse = {
  status?: string;
  total_count?: number;
  count?: number;
  data?: {
    total_count?: number;
    count_in_response?: number;
    items?: unknown[];
  };
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running Dataverse probe…";
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
      firstString(data.name) ??
      firstString(data.title) ??
      firstString(data.label) ??
      `Result #${index + 1}`;

    const sub =
      firstString(data.published_at) ??
      firstString(data.release_date) ??
      firstString(data.publicationDate) ??
      undefined;

    const meta =
      firstString(data.type) ??
      firstString(data.kind) ??
      firstString(data.collection) ??
      undefined;

    const href = firstString(data.url) ?? firstString(data.global_id) ?? firstString(data.identifier);

    return {
      title,
      sub,
      meta,
      href,
      rawLink: !!href && /^https?:/i.test(href),
    };
  };

  updateResults([]);
  el.appendChild(resultsSection);

  fetchJSON<DataverseResponse>("/dataverse/search", { q: "data", per_page: 1 })
    .then((data) => {
      const total =
        data.data?.total_count ??
        data.total_count ??
        (typeof data.count === "number" ? data.count : undefined);
      const count = Array.isArray(data.data?.items)
        ? data.data?.items.length
        : undefined;

      const parts: string[] = [];
      if (typeof count === "number") {
        parts.push(`${count} result${count === 1 ? "" : "s"}`);
      }
      if (typeof total === "number") {
        parts.push(`${total} total`);
      }

      const detail = parts.length > 0 ? parts.join(", ") : "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;

      const items = Array.isArray(data.data?.items) ? data.data.items.slice(0, 3) : [];
      const results = items.map((item, index) => toCard(item, index));

      if (results.length === 0) {
        results.push({ title: "Result #1" });
      }

      updateResults(results);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`Dataverse probe failed: ${error.message}`, "error"),
      );
      updateResults([]);
    });
};

export default mount;
