import { createAlert } from "../components/Alert";
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
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`Dataverse probe failed: ${error.message}`, "error"),
      );
    });
};

export default mount;
