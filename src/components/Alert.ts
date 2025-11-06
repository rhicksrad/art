export type AlertVariant = 'info' | 'error';

const VARIANT_LABEL: Record<AlertVariant, string> = {
  info: 'Information',
  error: 'Error',
};

export const createAlert = (message: string, variant: AlertVariant = 'info'): HTMLElement => {
  const alert = document.createElement('div');
  alert.className = `alert alert--${variant}`;
  alert.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  alert.setAttribute('aria-label', VARIANT_LABEL[variant]);

  const text = document.createElement('span');
  text.className = 'alert__message';
  text.textContent = message;
  alert.appendChild(text);
  return alert;
};
