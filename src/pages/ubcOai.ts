import { createAlert } from "../components/Alert";
import { createCard, CardProps } from "../components/Card";
import { fetchJSON } from "../lib/http";
import { exportCsv } from "../lib/csv";

const LIST_RECORDS_VERB = "ListRecords";
const IDENTIFY_VERB = "Identify";

const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
};

type ParsedRecord = {
  identifier?: string;
  datestamp?: string;
  setSpec?: string[];
};

const extractErrorMessage = (source: unknown): string | undefined => {
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      const message = extractErrorMessage(entry);
      if (message) {
        return message;
      }
    }
    return undefined;
  }

  if (!source || typeof source !== "object") {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  const candidateKeys = ["message", "value", "_", "#text", "text", "content"];
  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const nested = extractErrorMessage(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  if (typeof record.code === "string") {
    const trimmed = record.code.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
};

const extractResumptionToken = (source: unknown): string | undefined => {
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      const token = extractResumptionToken(entry);
      if (token) {
        return token;
      }
    }
    return undefined;
  }
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const record = source as Record<string, unknown>;

  const directKeys = ["value", "_", "#text", "text", "content", "token"];
  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  const nestedKeys = ["resumptionToken", "resumptiontoken"];
  for (const key of nestedKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const nested = extractResumptionToken(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
};

const parseRecord = (record: unknown): ParsedRecord | null => {
  if (!record || typeof record !== "object") {
    return null;
  }

  const object = record as Record<string, unknown>;
  const header = object.header;
  if (!header || typeof header !== "object") {
    return null;
  }

  const headerRecord = header as Record<string, unknown>;

  const identifier =
    typeof headerRecord.identifier === "string"
      ? headerRecord.identifier.trim()
      : undefined;

  const datestamp =
    typeof headerRecord.datestamp === "string"
      ? headerRecord.datestamp.trim()
      : undefined;

  const setSpecRaw = headerRecord.setSpec ?? headerRecord.setspec;
  const setSpecValues = toArray(setSpecRaw)
    .map((value) => (typeof value === "string" ? value.trim() : undefined))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const parsed: ParsedRecord = {
    identifier: identifier && identifier.length > 0 ? identifier : undefined,
    datestamp: datestamp && datestamp.length > 0 ? datestamp : undefined,
    setSpec: setSpecValues.length > 0 ? Array.from(new Set(setSpecValues)) : undefined,
  };

  if (!parsed.identifier && !parsed.datestamp) {
    return null;
  }

  return parsed;
};

const parseRecords = (data: unknown): { records: ParsedRecord[]; resumption?: string } => {
  if (!data || typeof data !== "object") {
    return { records: [], resumption: undefined };
  }

  const record = data as Record<string, unknown>;
  const listNode =
    record[LIST_RECORDS_VERB] ??
    record["Listrecords"] ??
    record["listRecords"] ??
    record["listrecords"];

  const container =
    typeof listNode === "object" && listNode !== null
      ? (listNode as Record<string, unknown>)
      : undefined;

  const rawRecords = container
    ? toArray(container.record ?? container.records)
    : toArray(record.record);

  const parsedRecords = rawRecords
    .map((entry) => parseRecord(entry))
    .filter((entry): entry is ParsedRecord => entry !== null);

  const resumption = container
    ? extractResumptionToken(container.resumptionToken ?? container.resumptiontoken)
    : extractResumptionToken(record.resumptionToken ?? record.resumptiontoken);

  return { records: parsedRecords, resumption };
};

const buildListRecordCard = (record: ParsedRecord, index: number): CardProps => {
  const sets = record.setSpec ?? [];
  const subtitleParts = [record.datestamp, sets.join(", ")].filter(
    (value) => typeof value === "string" && value.length > 0
  );

  return {
    title: record.identifier ?? `Record #${index + 1}`,
    sub: subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined,
    meta: sets.length > 0 ? `Sets: ${sets.join(", ")}` : undefined,
  };
};

const createField = (
  label: string,
  control: HTMLInputElement | HTMLSelectElement
): HTMLLabelElement => {
  const field = document.createElement("label");
  field.className = "search-form__field";

  const labelText = document.createElement("span");
  labelText.className = "search-form__label";
  labelText.textContent = label;

  control.classList.add("search-form__control");
  field.append(labelText, control);
  return field;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (!key) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    sanitized[key] = trimmed;
  });
  return sanitized;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = "";

  const status = document.createElement("p");
  status.className = "oai-status";
  status.textContent = "Configure an OAI-PMH request and run Identify or ListRecords.";

  const form = document.createElement("form");
  form.className = "search-form oai-form";

  const verbSelect = document.createElement("select");
  verbSelect.name = "verb";
  [IDENTIFY_VERB, LIST_RECORDS_VERB].forEach((verb) => {
    const option = document.createElement("option");
    option.value = verb;
    option.textContent = verb;
    verbSelect.appendChild(option);
  });

  const metadataPrefixInput = document.createElement("input");
  metadataPrefixInput.type = "text";
  metadataPrefixInput.name = "metadataPrefix";
  metadataPrefixInput.placeholder = "oai_dc";
  metadataPrefixInput.value = "oai_dc";

  const setInput = document.createElement("input");
  setInput.type = "text";
  setInput.name = "set";
  setInput.placeholder = "Optional set";

  const fromInput = document.createElement("input");
  fromInput.type = "date";
  fromInput.name = "from";

  const untilInput = document.createElement("input");
  untilInput.type = "date";
  untilInput.name = "until";

  const resumptionInput = document.createElement("input");
  resumptionInput.type = "text";
  resumptionInput.name = "resumptionToken";
  resumptionInput.placeholder = "Existing resumption token";

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Run";
  submitButton.className = "search-form__submit";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export CSV";
  exportButton.disabled = true;

  const loadMoreButton = document.createElement("button");
  loadMoreButton.type = "button";
  loadMoreButton.textContent = "Load more";
  loadMoreButton.hidden = true;

  form.append(
    createField("Verb", verbSelect),
    createField("metadataPrefix", metadataPrefixInput),
    createField("Set", setInput),
    createField("From", fromInput),
    createField("Until", untilInput),
    createField("Resumption token", resumptionInput),
    submitButton,
    exportButton,
    loadMoreButton
  );

  const alertContainer = document.createElement("div");

  const resultsSection = document.createElement("section");
  resultsSection.className = "results";

  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "ListRecords results";
  resultsSection.appendChild(resultsHeading);

  const resultsList = document.createElement("div");
  resultsList.className = "results-list";
  resultsSection.appendChild(resultsList);

  const placeholder = document.createElement("p");
  placeholder.className = "results-placeholder";
  placeholder.textContent = "No records loaded.";
  resultsList.appendChild(placeholder);

  let currentRecords: ParsedRecord[] = [];
  let nextResumptionToken: string | undefined;
  let isLoading = false;

  const updateControlsForVerb = (verb: string): void => {
    const isIdentify = verb !== LIST_RECORDS_VERB;
    metadataPrefixInput.disabled = isIdentify;
    setInput.disabled = isIdentify;
    fromInput.disabled = isIdentify;
    untilInput.disabled = isIdentify;
    loadMoreButton.disabled = isIdentify;
    if (isIdentify) {
      exportButton.disabled = true;
      loadMoreButton.hidden = true;
    }
  };

  const renderCards = (records: ParsedRecord[]): void => {
    resultsList.innerHTML = "";
    if (records.length === 0) {
      resultsList.appendChild(placeholder);
      return;
    }

    records.forEach((record, index) => {
      resultsList.appendChild(createCard(buildListRecordCard(record, index)));
    });
  };

  const updateExportState = (): void => {
    exportButton.disabled = currentRecords.length === 0;
  };

  const updateLoadMoreState = (): void => {
    loadMoreButton.hidden = !nextResumptionToken;
    loadMoreButton.disabled = !nextResumptionToken || isLoading;
    if (nextResumptionToken) {
      resumptionInput.value = nextResumptionToken;
    }
  };

  const runIdentify = async (query: Record<string, string>): Promise<void> => {
    status.textContent = "Running Identify request…";
    alertContainer.innerHTML = "";
    try {
      const response = await fetchJSON<Record<string, unknown>>("/ubc-oai", query);
      const repositoryName =
        typeof response.repositoryName === "string"
          ? response.repositoryName
          : typeof response.Identify === "object" && response.Identify !== null
            ? (response.Identify as Record<string, unknown>).repositoryName
            : undefined;

      const detail =
        typeof repositoryName === "string" && repositoryName.length > 0
          ? repositoryName
          : "Endpoint responded";

      status.textContent = `Identify succeeded: ${detail}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = "Identify request failed.";
      alertContainer.replaceChildren(
        createAlert(`UBC OAI Identify failed: ${message}`, "error"),
      );
    }
  };

  const runListRecords = async (
    query: Record<string, string>,
    append = false
  ): Promise<void> => {
    status.textContent = append
      ? "Loading additional records…"
      : "Fetching ListRecords…";
    alertContainer.innerHTML = "";
    isLoading = true;
    updateLoadMoreState();

    try {
      const response = await fetchJSON<unknown>("/ubc-oai", query);
      if (response && typeof response === "object") {
        const errorSource =
          (response as Record<string, unknown>).error ??
          (response as Record<string, unknown>).Error ??
          (response as Record<string, unknown>).errors;
        const message = extractErrorMessage(errorSource);
        if (message) {
          throw new Error(message);
        }
      }
      const { records, resumption } = parseRecords(response);

      if (!append) {
        currentRecords = records;
      } else {
        currentRecords = currentRecords.concat(records);
      }

      nextResumptionToken = resumption;
      if (!resumption) {
        resumptionInput.value = "";
      }
      renderCards(currentRecords);
      updateExportState();
      updateLoadMoreState();

      const countText = `${currentRecords.length} record${
        currentRecords.length === 1 ? "" : "s"
      }`;
      status.textContent = resumption
        ? `${countText} loaded. Resumption token available.`
        : `${countText} loaded.`;

      if (records.length === 0 && !resumption) {
        alertContainer.replaceChildren(
          createAlert("ListRecords returned no records.", "info"),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = "ListRecords request failed.";
      alertContainer.replaceChildren(
        createAlert(`UBC OAI ListRecords failed: ${message}`, "error"),
      );
    } finally {
      isLoading = false;
      updateLoadMoreState();
    }
  };

  const exportRecords = (): void => {
    if (currentRecords.length === 0) {
      return;
    }

    const rows = currentRecords.map((record) => ({
      identifier: record.identifier ?? "",
      datestamp: record.datestamp ?? "",
      sets: (record.setSpec ?? []).join("; "),
    }));

    exportCsv("ubc-oai-records.csv", rows);
  };

  const gatherQuery = (): Record<string, string> => {
    const query: Record<string, string> = {
      verb: verbSelect.value,
    };

    if (verbSelect.value === LIST_RECORDS_VERB) {
      const hasResumption = resumptionInput.value.trim().length > 0;
      if (hasResumption) {
        query.resumptionToken = resumptionInput.value.trim();
      } else {
        if (metadataPrefixInput.value.trim().length > 0) {
          query.metadataPrefix = metadataPrefixInput.value.trim();
        }
        if (setInput.value.trim().length > 0) {
          query.set = setInput.value.trim();
        }
        if (fromInput.value.trim().length > 0) {
          query.from = fromInput.value.trim();
        }
        if (untilInput.value.trim().length > 0) {
          query.until = untilInput.value.trim();
        }
      }
    }

    return sanitizeQuery(query);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = gatherQuery();
    if (query.verb === LIST_RECORDS_VERB) {
      currentRecords = [];
      nextResumptionToken = undefined;
      renderCards(currentRecords);
      updateExportState();
      void runListRecords(query, false);
    } else {
      void runIdentify(query);
    }
  });

  verbSelect.addEventListener("change", () => {
    updateControlsForVerb(verbSelect.value);
  });

  exportButton.addEventListener("click", () => {
    exportRecords();
  });

  loadMoreButton.addEventListener("click", () => {
    if (!nextResumptionToken) {
      return;
    }
    const query = sanitizeQuery({
      verb: LIST_RECORDS_VERB,
      resumptionToken: nextResumptionToken,
    });
    void runListRecords(query, true);
  });

  const initialIdentify = (): void => {
    const query = { verb: IDENTIFY_VERB };
    void runIdentify(query);
  };

  updateControlsForVerb(verbSelect.value);
  el.append(status, form, alertContainer, resultsSection);
  initialIdentify();
};

export default mount;
