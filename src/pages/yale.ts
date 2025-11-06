import { createAlert } from '../components/Alert';
import { createIIIFViewer } from '../components/IIIFViewer';
import { type ParsedIIIFManifest, parseManifest } from '../lib/iiif';
import { fetchJSON } from '../lib/http';

const formatNumber = (value: number): string => {
  return value.toLocaleString();
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  let currentAlert: HTMLElement | null = null;
  let currentManifest: ParsedIIIFManifest | null = null;

  const page = document.createElement('div');
  page.className = 'yale-page';

  const heading = document.createElement('h2');
  heading.className = 'yale-page__heading';
  heading.textContent = 'Yale IIIF viewer testbed';

  const intro = document.createElement('p');
  intro.className = 'yale-page__intro';
  intro.textContent = 'Enter a Yale manifest URL to load its canvases and browse them inline.';

  const form = document.createElement('form');
  form.className = 'probe-form';

  const label = document.createElement('label');
  label.textContent = 'IIIF manifest URL';
  label.htmlFor = 'manifest-url-input';

  const input = document.createElement('input');
  input.type = 'url';
  input.id = 'manifest-url-input';
  input.name = 'manifestUrl';
  input.placeholder = 'https://';
  input.required = true;
  input.autocomplete = 'off';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Load manifest';

  const controls = document.createElement('div');
  controls.className = 'form-controls';
  controls.append(input, submit);

  form.append(label, controls);

  const statusLine = document.createElement('p');
  statusLine.className = 'yale-page__status';
  statusLine.textContent = 'Enter a IIIF manifest URL to test the Yale endpoint.';

  const summarySection = document.createElement('section');
  summarySection.className = 'yale-page__summary';

  const summaryHeading = document.createElement('h3');
  summaryHeading.textContent = 'Manifest details';

  const summaryList = document.createElement('dl');
  summaryList.className = 'yale-page__summary-list';

  summarySection.append(summaryHeading, summaryList);

  const viewerContainer = document.createElement('section');
  viewerContainer.className = 'yale-page__viewer';

  const clearAlert = (): void => {
    if (currentAlert) {
      currentAlert.remove();
      currentAlert = null;
    }
  };

  const resetViewer = (): void => {
    viewerContainer.innerHTML = '';
  };

  const resetSummary = (): void => {
    summaryList.innerHTML = '';
  };

  const addSummaryEntry = (term: string, value: string): void => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    summaryList.append(dt, dd);
  };

  const updateSummary = (manifest: ParsedIIIFManifest | null): void => {
    resetSummary();

    if (!manifest) {
      addSummaryEntry('Status', 'No manifest loaded yet.');
      return;
    }

    addSummaryEntry('Label', manifest.label ?? 'Untitled manifest');
    addSummaryEntry('Canvases', formatNumber(manifest.canvases.length));

    const canvasesWithSize = manifest.canvases.filter(
      (canvas) => typeof canvas.width === 'number' && typeof canvas.height === 'number',
    );

    if (canvasesWithSize.length > 0) {
      const totalWidth = canvasesWithSize.reduce((sum, canvas) => sum + (canvas.width ?? 0), 0);
      const totalHeight = canvasesWithSize.reduce((sum, canvas) => sum + (canvas.height ?? 0), 0);
      const avgWidth = Math.round(totalWidth / canvasesWithSize.length);
      const avgHeight = Math.round(totalHeight / canvasesWithSize.length);
      addSummaryEntry('Average size', `${formatNumber(avgWidth)} × ${formatNumber(avgHeight)} pixels`);
    } else {
      addSummaryEntry('Average size', 'Not available');
    }
  };

  const renderViewer = (manifest: ParsedIIIFManifest): void => {
    resetViewer();
    const viewer = createIIIFViewer({ manifest });
    viewerContainer.appendChild(viewer);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearAlert();

    const manifestUrl = input.value.trim();
    if (!manifestUrl) {
      currentAlert = createAlert('Please provide a manifest URL to test.', 'error');
      el.insertBefore(currentAlert, page);
      return;
    }

    submit.disabled = true;
    input.disabled = true;
    statusLine.textContent = 'Loading manifest…';
    resetViewer();
    updateSummary(null);

    fetchJSON<unknown>('/yale-iiif', { url: manifestUrl })
      .then((data) => {
        currentManifest = parseManifest(data);
        if (!currentManifest.canvases.length) {
          statusLine.textContent = 'Manifest loaded but no canvases with images were found.';
        } else {
          statusLine.textContent = `Loaded ${formatNumber(currentManifest.canvases.length)} canvases.`;
        }
        updateSummary(currentManifest);
        renderViewer(currentManifest);
      })
      .catch((error: Error) => {
        currentManifest = null;
        statusLine.textContent = '';
        currentAlert = createAlert(`Yale IIIF viewer failed: ${error.message}`, 'error');
        el.insertBefore(currentAlert, page);
        resetViewer();
        updateSummary(null);
      })
      .finally(() => {
        submit.disabled = false;
        input.disabled = false;
      });
  });

  updateSummary(null);

  page.append(heading, intro, form, statusLine, summarySection, viewerContainer);
  el.appendChild(page);
};

export default mount;

