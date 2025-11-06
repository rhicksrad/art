import { createAlert } from "../components/Alert";
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
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(
          `Princeton University Art Museum probe failed: ${error.message}`,
          "error",
        ),
      );
    });
};

export default mount;
