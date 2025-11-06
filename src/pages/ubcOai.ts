import { createAlert } from '../components/Alert';
import { createCard, CardProps } from '../components/Card';
import { setSiteStatus } from '../components/SiteHeader';
import { fetchJSON } from '../lib/http';
import { exportCsv } from '../lib/csv';

const DEFAULT_METADATA_PREFIX = 'oai_dc';

type IdentifyResponse = {
  Identify?: {
    repositoryName?: string;
    baseURL?: string;
  };
  repositoryName?: string;
};

type OaiRecord = {
  identifier: string;
  datestamp?: string;
  setSpecs: string[];
};

type ListRecordsResult = {
  records: OaiRecord[];
  resumptionToken?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (isRecord(value)) {
    const candidates = ['value', '_value', 'text', '_text', '#text'];
    for (const key of candidates) {
      const candidate = value[key];
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }

  return undefined;
};

const collectStrings = (input: unknown): string[] => {
  const values = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const text = toStringValue(value);
    if (typeof text === 'string') {
      values.add(text);
    }
  };

  visit(input);
  return Array.from(values);
};

const extractResumptionToken = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const candidates = [
    record.resumptionToken,
    record.resumptiontoken,
    record['resumption-token'],
  ];

  for (const candidate of candidates) {
    const token = toStringValue(candidate);
    if (token) {
      return token;
    }
  }

  return undefined;
};

const parseListRecords = (payload: unknown): ListRecordsResult => {
  if (!isRecord(payload)) {
    return { records: [] };
  }

  const listRecords = payload.ListRecords ?? payload.listRecords ?? payload.records;
  const container = isRecord(listRecords) ? listRecords : payload;

  const rawRecords: unknown[] = Array.isArray(container.records)
    ? (container.records as unknown[])
    : Array.isArray(container.ListRecords)
    ? (container.ListRecords as unknown[])
    : [];

  const records: OaiRecord[] = rawRecords.map((raw, index) => {
    const header = isRecord(raw) && isRecord(raw.header) ? raw.header : (raw as Record<string, unknown>);
    const identifier =
      toStringValue(header.identifier) ?? toStringValue(header.id) ?? `Record ${index + 1}`;
    const datestamp = toStringValue(header.datestamp ?? (raw as Record<string, unknown>).datestamp);
    const setSpecs = collectStrings(header.setSpec ?? (raw as Record<string, unknown>).setSpec);
    return { identifier, datestamp, setSpecs };
  });

  const resumptionSource =
    (isRecord(listRecords) ? extractResumptionToken(listRecords) : undefined) ?? extractResumptionToken(payload);

  return { records, resumptionToken: resumptionSource };
};

const extractErrorMessage = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = extractErrorMessage(entry);
      if (message) {
        return message;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }

  const direct = toStringValue(value.message ?? value.error ?? value.description);
  if (direct) {
    const code = toStringValue(value.code);
    return code ? `${code}: ${direct}` : direct;
  }

  const nested = extractErrorMessage(value.details ?? value.detail ?? value.text ?? value._text);
  if (nested) {
    const code = toStringValue(value.code);
    return code ? `${code}: ${nested}` : nested;
  }

  return null;
};

const findOaiError = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const oai = record['OAI_PMH'];
  const oaiError = isRecord(oai) ? oai.error : undefined;

  const candidates = [record['error'], record['Error'], oaiError];
  for (const candidate of candidates) {
    const message = extractErrorMessage(candidate);
    if (message) {
      return message;
    }
  }

  return null;
};

const createFormField = (
  label: string,
  control: HTMLInputElement | HTMLSelectElement,
): HTMLLabelElement => {
  const wrapper = document.createElement('label');
  wrapper.className = 'search-form__field';

  const labelEl = document.createElement('span');
  labelEl.className = 'search-form__label';
  labelEl.textContent = label;

  control.classList.add('search-form__control');

  wrapper.append(labelEl, control);
  return wrapper;
};

const toCard = (record: OaiRecord): CardProps => {
  return {
    title: record.identifier,
    sub: record.datestamp ?? 'No datestamp provided',
    meta: record.setSpecs.length > 0 ? `Sets: ${record.setSpecs.join(', ')}` : undefined,
  };
};

const createPlaceholder = (text: string): HTMLParagraphElement => {
  const placeholder = document.createElement('p');
  placeholder.className = 'results-placeholder';
  placeholder.textContent = text;
  return placeholder;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h2');
  heading.textContent = 'UBC OAI-PMH Explorer';

  const alertContainer = document.createElement('div');

  const identifyStatus = document.createElement('p');
  identifyStatus.textContent = 'Running Identify probe…';

  const form = document.createElement('form');
  form.className = 'search-form';

  const verbSelect = document.createElement('select');
  verbSelect.name = 'verb';
  const identifyOption = document.createElement('option');
  identifyOption.value = 'Identify';
  identifyOption.textContent = 'Identify';
  const listRecordsOption = document.createElement('option');
  listRecordsOption.value = 'ListRecords';
  listRecordsOption.textContent = 'ListRecords';
  listRecordsOption.selected = true;
  verbSelect.append(identifyOption, listRecordsOption);

  const metadataInput = document.createElement('input');
  metadataInput.type = 'text';
  metadataInput.name = 'metadataPrefix';
  metadataInput.placeholder = 'oai_dc';
  metadataInput.value = DEFAULT_METADATA_PREFIX;

  const setInput = document.createElement('input');
  setInput.type = 'text';
  setInput.name = 'set';
  setInput.placeholder = 'Collection set';

  const fromInput = document.createElement('input');
  fromInput.type = 'date';
  fromInput.name = 'from';

  const untilInput = document.createElement('input');
  untilInput.type = 'date';
  untilInput.name = 'until';

  const resumptionInput = document.createElement('input');
  resumptionInput.type = 'text';
  resumptionInput.name = 'resumptionToken';
  resumptionInput.placeholder = 'Provide a resumption token to continue';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'search-form__submit';
  submitButton.textContent = 'Run query';

  form.append(
    createFormField('Verb', verbSelect),
    createFormField('metadataPrefix', metadataInput),
    createFormField('Set', setInput),
    createFormField('From', fromInput),
    createFormField('Until', untilInput),
    createFormField('Resumption token', resumptionInput),
    submitButton,
  );

  const resultsSection = document.createElement('section');
  resultsSection.className = 'results';

  const resultsHeading = document.createElement('h3');
  resultsHeading.textContent = 'Records';
  resultsSection.appendChild(resultsHeading);

  const statusLine = document.createElement('p');
  statusLine.className = 'results-count';
  statusLine.textContent = 'No records loaded.';

  const recordsSummary = document.createElement('p');
  recordsSummary.className = 'results-count';
  recordsSummary.textContent = '';

  const resultsList = document.createElement('div');
  resultsList.className = 'results-list';
  const emptyPlaceholder = createPlaceholder('Run a ListRecords query to view results.');
  resultsList.appendChild(emptyPlaceholder);

  const controlsRow = document.createElement('div');
  controlsRow.className = 'results-controls';

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'Export CSV';
  exportButton.disabled = true;

  const loadMoreButton = document.createElement('button');
  loadMoreButton.type = 'button';
  loadMoreButton.textContent = 'Load more';
  loadMoreButton.disabled = true;

  controlsRow.append(exportButton, loadMoreButton);

  resultsSection.append(statusLine, recordsSummary, controlsRow, resultsList);

  el.append(heading, identifyStatus, form, alertContainer, resultsSection);

  let isLoading = false;
  let records: OaiRecord[] = [];
  let nextToken: string | null = null;

  const updateButtons = (): void => {
    exportButton.disabled = records.length === 0;
    loadMoreButton.disabled = !nextToken || isLoading;
  };

  const renderRecords = (items: OaiRecord[]): void => {
    resultsList.innerHTML = '';
    if (items.length === 0) {
      resultsList.appendChild(createPlaceholder('No records returned.'));
      return;
    }

    items.forEach((record) => {
      resultsList.appendChild(createCard(toCard(record)));
    });
  };

  const updateSummary = (): void => {
    if (records.length === 0) {
      statusLine.textContent = 'No records loaded.';
    } else {
      statusLine.textContent = `${records.length} record${records.length === 1 ? '' : 's'} loaded.`;
    }
    recordsSummary.textContent = nextToken ? `Next resumption token available.` : 'End of record set.';
  };

  const performIdentify = async (): Promise<void> => {
    identifyStatus.textContent = 'Running Identify probe…';
    alertContainer.innerHTML = '';
    try {
      const response = await fetchJSON<IdentifyResponse>('/ubc-oai', { verb: 'Identify' });
      const repositoryName =
        response.repositoryName ?? response.Identify?.repositoryName ?? 'Unknown repository';
      identifyStatus.textContent = `Identify OK: ${repositoryName}`;
      setSiteStatus('ok', 'OAI online');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      identifyStatus.textContent = 'Identify probe failed.';
      alertContainer.replaceChildren(createAlert(`Identify request failed: ${message}`, 'error'));
      setSiteStatus('error', 'OAI error');
    }
  };

  const runListRecords = async (params: Record<string, string>, append: boolean): Promise<void> => {
    if (isLoading) {
      return;
    }
    isLoading = true;
    alertContainer.innerHTML = '';
    statusLine.textContent = append ? 'Loading more records…' : 'Fetching records…';
    recordsSummary.textContent = '';
    updateButtons();

    try {
      const response = await fetchJSON<unknown>('/ubc-oai', params, { cache: 'no-store' });
      const errorMessage = findOaiError(response);
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      const parsed = parseListRecords(response);
      nextToken = parsed.resumptionToken ?? null;
      records = append ? records.concat(parsed.records) : parsed.records;

      renderRecords(records);
      updateSummary();
      updateButtons();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alertContainer.replaceChildren(createAlert(`ListRecords failed: ${message}`, 'error'));
      statusLine.textContent = 'No records loaded.';
      recordsSummary.textContent = '';
      nextToken = null;
      records = append ? records : [];
      renderRecords(records);
      updateButtons();
    } finally {
      isLoading = false;
      updateButtons();
    }
  };

  const refreshFieldState = (): void => {
    const verb = verbSelect.value;
    const hasToken = resumptionInput.value.trim().length > 0;
    const listSelected = verb === 'ListRecords';

    metadataInput.disabled = !listSelected || hasToken;
    setInput.disabled = !listSelected || hasToken;
    fromInput.disabled = !listSelected || hasToken;
    untilInput.disabled = !listSelected || hasToken;
    resumptionInput.disabled = !listSelected;
  };

  verbSelect.addEventListener('change', refreshFieldState);
  resumptionInput.addEventListener('input', refreshFieldState);
  refreshFieldState();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const verb = verbSelect.value || 'ListRecords';

    if (verb === 'Identify') {
      void performIdentify();
      return;
    }

    const resumptionToken = resumptionInput.value.trim();
    const params: Record<string, string> = { verb };

    if (resumptionToken) {
      params.resumptionToken = resumptionToken;
    } else {
      const metadataPrefix = metadataInput.value.trim() || DEFAULT_METADATA_PREFIX;
      params.metadataPrefix = metadataPrefix;
      if (setInput.value.trim().length > 0) {
        params.set = setInput.value.trim();
      }
      if (fromInput.value) {
        params.from = fromInput.value;
      }
      if (untilInput.value) {
        params.until = untilInput.value;
      }
    }

    void runListRecords(params, false);
  });

  exportButton.addEventListener('click', () => {
    if (records.length === 0) {
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rows = records.map((record) => ({
      identifier: record.identifier,
      datestamp: record.datestamp ?? '',
      setSpec: record.setSpecs.join('; '),
    }));
    exportCsv(`ubc-oai-${timestamp}.csv`, rows);
  });

  loadMoreButton.addEventListener('click', () => {
    if (!nextToken) {
      return;
    }
    void runListRecords({ verb: 'ListRecords', resumptionToken: nextToken }, true);
  });

  performIdentify().catch(() => {
    // Identify errors handled above.
  });
};

export default mount;
