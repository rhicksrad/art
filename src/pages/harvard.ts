import { createAlert } from "../components/Alert";
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
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`Harvard Art Museums probe failed: ${error.message}`, "error"),
      );
    });
};

export default mount;
