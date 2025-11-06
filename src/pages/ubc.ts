import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { fetchJSON } from "../lib/http";

type UbcResponse = {
  total?: number;
  resultCount?: number;
  results?: unknown[];
  items?: unknown[];
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running UBC Open Collections probe…";
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
      firstString(data.title) ??
      firstString(data.label) ??
      firstString(data.name) ??
      `Result #${index + 1}`;

    const sub =
      firstString(data.date) ??
      firstString(data.issued) ??
      firstString(data.displayDate) ??
      undefined;

    const meta =
      firstString(data.creator) ??
      firstString(data.contributor) ??
      firstString(data.collection) ??
      undefined;

    const href =
      firstString(data.url) ??
      firstString(data.id) ??
      firstString(data.identifier) ??
      firstString(data.source);

    const img =
      firstString(data.thumbnail) ??
      firstString(data.image) ??
      firstString(data.img) ??
      undefined;

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

  fetchJSON<UbcResponse>("/ubc/search", { q: "newspaper", limit: 1 })
    .then((data) => {
      const total = data.total ?? data.resultCount;
      const results = Array.isArray(data.results)
        ? data.results.length
        : Array.isArray(data.items)
          ? data.items.length
          : undefined;

      const parts: string[] = [];
      if (typeof results === "number") {
        parts.push(`${results} result${results === 1 ? "" : "s"}`);
      }
      if (typeof total === "number") {
        parts.push(`${total} total`);
      }

      const detail = parts.length > 0 ? parts.join(", ") : "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;

      const entries = Array.isArray(data.results)
        ? data.results.slice(0, 3)
        : Array.isArray(data.items)
          ? data.items.slice(0, 3)
          : [];
      const cards = entries.map((entry, index) => toCard(entry, index));

      if (cards.length === 0) {
        cards.push({ title: "Result #1" });
      }

      updateResults(cards);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`UBC Open Collections probe failed: ${error.message}`, "error"),
      );
      updateResults([]);
    });
};

export default mount;
