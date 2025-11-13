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

  header.append(copy, statusWrapper);

  setSiteStatus('loading');

  return header;
};
