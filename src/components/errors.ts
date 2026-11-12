import { h, icon } from '../lib/dom';
import { HttpError } from '../lib/http';

export const describeError = (error: unknown): string => {
  if (error instanceof HttpError) {
    if (error.status === 0) return 'Worker unreachable';
    const upstreamError = error.diagnostic?.error;
    return upstreamError ? `HTTP ${error.status} · ${upstreamError}` : `HTTP ${error.status}`;
  }
  return error instanceof Error ? error.message : String(error);
};

/**
 * "Fail openly": show exactly what went wrong — status, the upstream URL the
 * Worker called, and the start of the body it got back.
 */
export const errorPanel = (error: unknown, title = 'This request failed'): HTMLElement => {
  const panel = h('div', { class: 'error-panel', role: 'alert' });
  const head = h(
    'div',
    { class: 'error-panel__head' },
    icon('alert', 18),
    h('strong', null, title),
  );
  panel.append(head);

  if (!(error instanceof HttpError)) {
    panel.append(h('p', null, error instanceof Error ? error.message : String(error)));
    return panel;
  }

  const diagnostic = error.diagnostic;
  panel.append(h('p', null, error.message));

  const facts = h('dl', { class: 'facts facts--compact' });
  const add = (label: string, value: string | undefined, link = false): void => {
    if (!value) return;
    facts.append(
      h('dt', null, label),
      h(
        'dd',
        null,
        link ? h('a', { href: value, target: '_blank', rel: 'noreferrer' }, value) : value,
      ),
    );
  };
  add(
    'Status',
    error.status === 0
      ? 'No response'
      : `${error.status}${diagnostic?.statusText ? ` ${diagnostic.statusText}` : ''}`,
  );
  add('Worker request', error.url, true);
  add('Upstream', diagnostic?.upstream);
  add('Content type', diagnostic?.contentType ?? error.contentType);
  add('Detail', diagnostic?.detail);
  panel.append(facts);

  const sample = diagnostic?.sample ?? (diagnostic ? undefined : error.sample);
  if (sample) {
    panel.append(
      h(
        'details',
        { class: 'disclosure' },
        h('summary', null, 'Response body'),
        h('pre', { class: 'code' }, sample),
      ),
    );
  }
  return panel;
};
