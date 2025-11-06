import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
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

  updateResults([]);

  el.appendChild(section);
  el.appendChild(resultsSection);

  setSiteStatus("loading");

  fetchJSON<DiagResponse>("/diag")
    .then((data) => {
      renderStatus(statusContainer, data);
      setSiteStatus(data.ok ? "ok" : "error", data.ok ? "Online" : "Check service");

      const endpointSummary = (data.endpoints ?? []).slice(0, 2).join(", ");
      const keyEntries = Object.entries(data.keys ?? {}).slice(0, 2);

      const results: CardProps[] = [
        {
          title: data.ok ? "Service online" : "Service issue detected",
          sub: data.now ? `Reported ${data.now}` : undefined,
          meta:
            endpointSummary.length > 0
              ? `Endpoints: ${endpointSummary}`
              : undefined,
        },
      ];

      if (endpointSummary.length === 0 && (data.endpoints ?? []).length > 0) {
        const [firstEndpoint] = data.endpoints ?? [];
        if (typeof firstEndpoint === "string" && firstEndpoint.length > 0) {
          results.push({
            title: firstEndpoint,
            sub: "Endpoint",
            meta: data.ok ? "Reachable" : "Check status",
          });
        }
      }

      if (keyEntries.length > 0) {
        const [firstKey] = keyEntries[0];
        const keyMeta = keyEntries
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(", ");
        results.push({
          title: `Key ${firstKey}`,
          sub: `${keyEntries.length} key${keyEntries.length === 1 ? "" : "s"}`,
          meta: keyMeta,
        });
      }

      updateResults(results.slice(0, 3));
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
      updateResults([]);
    });
};

export default mount;
