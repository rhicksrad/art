import { createAlert } from "../components/Alert";
import { fetchJSON } from "../lib/http";

type IdentifyResponse = {
  repositoryName?: string;
  Identify?: {
    repositoryName?: string;
  };
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.textContent = "Running UBC OAI Identify probe…";
  el.appendChild(status);

  fetchJSON<IdentifyResponse>("/ubc-oai", { verb: "Identify" })
    .then((data) => {
      const repositoryName =
        data.repositoryName ?? data.Identify?.repositoryName ?? undefined;

      const detail = repositoryName ?? "Endpoint responded";
      status.textContent = `Probe OK: ${detail}.`;
    })
    .catch((error: Error) => {
      status.remove();
      el.appendChild(
        createAlert(`UBC OAI probe failed: ${error.message}`, "error"),
      );
    });
};

export default mount;
