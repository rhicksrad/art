import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { createPager } from "../components/Pager";
import { fetchJSON } from "../lib/http";

type ManifestResponse = {
  label?: unknown;
};

const extractLabel = (label: unknown): string | undefined => {
  if (typeof label === "string") {
    return label;
  }

  if (label && typeof label === "object") {
    const record = label as Record<string, unknown>;

    const directValue = record["@value"];
    if (typeof directValue === "string") {
      return directValue;
    }

    for (const value of Object.values(record)) {
      if (typeof value === "string") {
        return value;
      }

      if (Array.isArray(value)) {
        const firstString = value.find((entry) => typeof entry === "string");
        if (typeof firstString === "string") {
          return firstString;
        }
      }

      if (value && typeof value === "object") {
        const nested = extractLabel(value);
        if (typeof nested === "string" && nested.length > 0) {
          return nested;
        }
      }
    }
  }

  return undefined;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  let currentAlert: HTMLElement | null = null;

  const form = document.createElement("form");
  form.className = "probe-form";

  const label = document.createElement("label");
  label.textContent = "IIIF manifest URL";
  label.htmlFor = "manifest-url-input";

  const input = document.createElement("input");
  input.type = "url";
  input.id = "manifest-url-input";
  input.name = "manifestUrl";
  input.placeholder = "https://";
  input.required = true;
  input.autocomplete = "off";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Test";

  const controls = document.createElement("div");
  controls.className = "form-controls";
  controls.append(input, submit);

  form.append(label, controls);

  const resultLine = document.createElement("p");
  resultLine.textContent = "Enter a IIIF manifest URL to test the Yale endpoint.";

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

  const clearAlert = (): void => {
    if (currentAlert) {
      currentAlert.remove();
      currentAlert = null;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearAlert();

    const manifestUrl = input.value.trim();
    if (manifestUrl.length === 0) {
      currentAlert = createAlert("Please provide a manifest URL to test.", "error");
      el.insertBefore(currentAlert, form);
      return;
    }

    resultLine.textContent = "Testing manifest…";
    updateResults([]);

    fetchJSON<ManifestResponse>("/yale-iiif", { url: manifestUrl })
      .then((data) => {
        const manifestLabel = extractLabel(data.label);
        const detail = manifestLabel && manifestLabel.length > 0
          ? manifestLabel
          : "Manifest loaded";
        resultLine.textContent = `Probe OK: ${detail}.`;

        const cards: CardProps[] = [
          {
            title: manifestLabel && manifestLabel.length > 0 ? manifestLabel : "Result #1",
            sub: "IIIF manifest",
            meta: manifestUrl,
            href: manifestUrl,
            rawLink: true,
          },
        ];

        updateResults(cards);
      })
      .catch((error: Error) => {
        resultLine.textContent = "";
        currentAlert = createAlert(
          `Yale IIIF probe failed: ${error.message}`,
          "error",
        );
        el.insertBefore(currentAlert, form);
        updateResults([]);
      });
  });

  el.append(form, resultLine, resultsSection);
};

export default mount;
