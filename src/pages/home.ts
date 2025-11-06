import { createAlert } from "../components/Alert";
import { setSiteStatus } from "../components/SiteHeader";
import { fetchJSON } from "../lib/http";

type DiagResponse = {
  ok: boolean;
  now?: string;
  endpoints?: string[];
  keys?: Record<string, boolean>;
};

const renderStatus = (container: HTMLElement, data: DiagResponse): void => {
  container.innerHTML = "";

  const okRow = document.createElement("p");
  okRow.innerHTML = `<strong>ok:</strong> ${String(data.ok)}`;

  const nowRow = document.createElement("p");
  nowRow.innerHTML = `<strong>now:</strong> ${data.now ?? "unknown"}`;

  const endpointsList = document.createElement("ul");
  endpointsList.className = "status-list";
  (data.endpoints ?? []).forEach((endpoint) => {
    const item = document.createElement("li");
    item.textContent = endpoint;
    endpointsList.appendChild(item);
  });

  const endpointsWrapper = document.createElement("div");
  const endpointsTitle = document.createElement("strong");
  endpointsTitle.textContent = "endpoints:";
  endpointsWrapper.append(endpointsTitle);
  if (endpointsList.childElementCount > 0) {
    endpointsWrapper.appendChild(endpointsList);
  } else {
    const none = document.createElement("p");
    none.textContent = "No endpoints reported.";
    endpointsWrapper.appendChild(none);
  }

  const keysWrapper = document.createElement("div");
  const keysTitle = document.createElement("strong");
  keysTitle.textContent = "keys:";
  keysWrapper.appendChild(keysTitle);

  const keysList = document.createElement("ul");
  keysList.className = "status-list";
  const keysEntries = Object.entries(data.keys ?? {});
  if (keysEntries.length === 0) {
    const none = document.createElement("p");
    none.textContent = "No key information.";
    keysWrapper.appendChild(none);
  } else {
    keysEntries.forEach(([key, value]) => {
      const item = document.createElement("li");
      item.textContent = `keys.${key}: ${String(value)}`;
      keysList.appendChild(item);
    });
    keysWrapper.appendChild(keysList);
  }

  container.append(okRow, nowRow, endpointsWrapper, keysWrapper);
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const section = document.createElement("section");
  section.className = "home-status";

  const heading = document.createElement("h2");
  heading.textContent = "Service diagnostics";
  section.appendChild(heading);

  const statusContainer = document.createElement("div");
  statusContainer.className = "status-container";
  statusContainer.textContent = "Loading status check…";
  section.appendChild(statusContainer);

  el.appendChild(section);

  setSiteStatus("loading");

  fetchJSON<DiagResponse>("/diag")
    .then((data) => {
      renderStatus(statusContainer, data);
      setSiteStatus(data.ok ? "ok" : "error", data.ok ? "Online" : "Check service");
    })
    .catch((error: Error) => {
      statusContainer.innerHTML = "";
      const alert = createAlert(
        `Unable to load status diagnostics: ${error.message}`,
        "error"
      );
      section.insertBefore(alert, statusContainer);
      statusContainer.textContent = "Status information is unavailable.";
      setSiteStatus("error", "Unavailable");
    });
};

export default mount;
