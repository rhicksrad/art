import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { fetchJSON } from "../lib/http";

type HarvardResponse = {
  info?: {
    totalrecords?: number;
    totalrecordsperquery?: number;
  };
  records?: unknown[];
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running Harvard Art Museums probe…";
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

  const toCard = (record: unknown, index: number): CardProps => {
    if (!record || typeof record !== "object") {
      return { title: `Result #${index + 1}` };
    }

    const data = record as Record<string, unknown>;
    const title = typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : typeof data.objectnumber === "string" && data.objectnumber.length > 0
        ? data.objectnumber
        : `Result #${index + 1}`;
    const sub = typeof data.dated === "string" && data.dated.trim().length > 0
      ? data.dated.trim()
      : undefined;

    let meta: string | undefined;
    const people = data.people;
    if (Array.isArray(people)) {
      for (const person of people) {
        if (person && typeof person === "object") {
          const name = (person as Record<string, unknown>).name;
          if (typeof name === "string" && name.length > 0) {
            meta = name;
            break;
          }
        }
      }
    }

    if (!meta && typeof data.culture === "string" && data.culture.length > 0) {
      meta = data.culture;
    }

    const href = typeof data.url === "string" && data.url.length > 0 ? data.url : undefined;
    const img = typeof data.primaryimageurl === "string" && data.primaryimageurl.length > 0
      ? data.primaryimageurl
      : undefined;

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

  fetchJSON<HarvardResponse>("/harvard-art/object", { size: 1 })
    .then((data) => {
      const totalRecords =
        data.info?.totalrecords ?? data.info?.totalrecordsperquery;
      const recordCount = Array.isArray(data.records) ? data.records.length : undefined;

      const parts: string[] = [];
      if (typeof recordCount === "number") {
        parts.push(`${recordCount} record${recordCount === 1 ? "" : "s"}`);
      }
      if (typeof totalRecords === "number") {
        parts.push(`${totalRecords} total`);
      }

      const detail = parts.length > 0 ? parts.join(", ") : "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;

      const results = Array.isArray(data.records)
        ? data.records.slice(0, 3).map((record, index) => toCard(record, index))
        : [];

      if (results.length === 0) {
        results.push({ title: "Result #1" });
      }

      updateResults(results);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`Harvard Art Museums probe failed: ${error.message}`, "error"),
      );
      updateResults([]);
    });
};

export default mount;
