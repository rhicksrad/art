import { createAlert } from "../components/Alert";
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
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`UBC Open Collections probe failed: ${error.message}`, "error"),
      );
    });
};

export default mount;
