import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { WORKER_BASE } from "../lib/config";

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running arXiv probe…";
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

  const createEntryCard = (entry: Element, index: number): CardProps => {
    const getText = (selector: string): string | undefined => {
      const value = entry.querySelector(selector)?.textContent?.trim();
      return value && value.length > 0 ? value : undefined;
    };

    const title = getText("title") ?? `Result #${index + 1}`;
    const sub = getText("published") ?? getText("updated");
    const meta = getText("author > name") ?? getText("category");

    const linkElement =
      entry.querySelector("link[rel='alternate']") ??
      entry.querySelector("link[href]") ??
      null;
    const href =
      linkElement?.getAttribute("href") ?? getText("id") ?? undefined;

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

  const url = new URL("/arxiv/search", WORKER_BASE);
  const params = new URLSearchParams({
    search_query: "cat:cs.AI",
    max_results: "1",
  });
  url.search = params.toString();

  fetch(url.toString())
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response.text();
    })
    .then((body) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(body, "application/xml");
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        throw new Error("Received invalid XML from arXiv endpoint");
      }

      const title = doc.querySelector("entry > title")?.textContent?.trim();
      const detail = title && title.length > 0 ? title : "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;

      const entries = Array.from(doc.querySelectorAll("entry")).slice(0, 3);
      const results = entries.map((entry, index) => createEntryCard(entry, index));

      if (results.length === 0) {
        results.push({ title: "Result #1" });
      }

      updateResults(results);
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`arXiv probe failed: ${error.message}`, "error"),
      );
      updateResults([]);
    });
};

export default mount;
