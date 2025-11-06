import { createAlert } from "../components/Alert";
import { WORKER_BASE } from "../lib/config";

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running arXiv probe…";
  el.appendChild(status);

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
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`arXiv probe failed: ${error.message}`, "error"),
      );
    });
};

export default mount;
