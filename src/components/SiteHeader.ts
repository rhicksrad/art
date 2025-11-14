export type SiteStatusVariant = 'loading' | 'ok' | 'error';

type StatusConfig = {
  text: string;
  className: string;
};

const STATUS_CONFIG: Record<SiteStatusVariant, StatusConfig> = {
  loading: { text: 'Checking…', className: 'status-pill--loading' },
  ok: { text: 'Online', className: 'status-pill--ok' },
  error: { text: 'Issue', className: 'status-pill--error' },
};

let statusElement: HTMLSpanElement | null = null;

const resolveBasePath = (): string => {
  const raw = import.meta.env.BASE_URL ?? '/';
  if (!raw || raw === '/') {
    return '/';
  }
  return raw.endsWith('/') ? raw : `${raw}/`;
};

const navigateToUnifiedSearch = (value: string): void => {
  try {
    const url = new URL(window.location.href);
    url.pathname = resolveBasePath();
    if (value) {
      url.searchParams.set('q', value);
    } else {
      url.searchParams.delete('q');
    }
    window.location.href = url.toString();
  } catch {
    const base = resolveBasePath();
    const query = value ? `?q=${encodeURIComponent(value)}` : '';
    window.location.href = `${base}${query}`;
  }
};

export const setSiteStatus = (variant: SiteStatusVariant, text?: string): void => {
  if (!statusElement) {
    return;
  }

  const config = STATUS_CONFIG[variant];
  const className = `status-pill ${config.className}`;

  statusElement.className = className;
  statusElement.textContent = text ?? config.text;
  statusElement.dataset.status = variant;
};

export const createSiteHeader = (): HTMLElement => {
  const header = document.createElement('header');
  header.className = 'site-header';

  const copy = document.createElement('div');
  copy.className = 'site-header__copy';

  const title = document.createElement('h1');
  title.className = 'site-title';
  title.textContent = 'Art API Explorer';

  const subtitle = document.createElement('p');
  subtitle.className = 'site-subtitle';
  subtitle.textContent = 'Unified worker + visual console for open art data.';

  copy.append(title, subtitle);

  statusElement = document.createElement('span');
  statusElement.className = 'status-pill';
  statusElement.setAttribute('aria-live', 'polite');

  const statusWrapper = document.createElement('div');
  statusWrapper.className = 'site-status';
  const statusLabel = document.createElement('span');
  statusLabel.className = 'site-status__label';
  statusLabel.textContent = 'Status';
  statusWrapper.append(statusLabel, statusElement);

  const searchForm = document.createElement('form');
  searchForm.className = 'site-header__search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search all sources';
  searchInput.setAttribute('aria-label', 'Search across all APIs');
  searchInput.value = new URLSearchParams(window.location.search).get('q') ?? '';
  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.textContent = 'Search';
  searchForm.append(searchInput, searchButton);

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    navigateToUnifiedSearch(searchInput.value.trim());
  });

  const controls = document.createElement('div');
  controls.className = 'site-header__controls';
  controls.append(statusWrapper, searchForm);

  header.append(copy, controls);

  setSiteStatus('loading');

  return header;
};
