import { errorPanel } from '../components/errors';
import { clear, h, icon } from '../lib/dom';
import { fetchText, isAbort, workerUrl } from '../lib/http';

const VERBS = [
  'Identify',
  'ListSets',
  'ListMetadataFormats',
  'ListIdentifiers',
  'ListRecords',
  'GetRecord',
] as const;
type Verb = (typeof VERBS)[number];

/** Which arguments each OAI-PMH verb takes. */
const ARGUMENTS: Record<Verb, string[]> = {
  Identify: [],
  ListSets: [],
  ListMetadataFormats: ['identifier'],
  ListIdentifiers: ['metadataPrefix', 'set', 'from', 'until'],
  ListRecords: ['metadataPrefix', 'set', 'from', 'until'],
  GetRecord: ['identifier', 'metadataPrefix'],
};

const FIELD_LABELS: Record<string, string> = {
  metadataPrefix: 'Metadata prefix',
  set: 'Set',
  from: 'From (YYYY-MM-DD)',
  until: 'Until (YYYY-MM-DD)',
  identifier: 'Identifier',
};

const local = (parent: Element | Document, name: string): Element[] =>
  Array.from(parent.getElementsByTagName('*')).filter((el) => el.localName === name);

const text = (parent: Element, name: string): string | undefined =>
  local(parent, name)[0]?.textContent?.trim() || undefined;

const facts = (pairs: Array<[string, string | undefined]>): HTMLElement => {
  const list = h('dl', { class: 'facts' });
  for (const [label, value] of pairs) {
    if (value) list.append(h('dt', null, label), h('dd', null, value));
  }
  return list;
};

const renderRecord = (record: Element): HTMLElement => {
  const header = local(record, 'header')[0] ?? record;
  const deleted = header.getAttribute('status') === 'deleted';
  const dc = (name: string): string | undefined => {
    const values = local(record, name)
      .map((el) => el.textContent?.trim())
      .filter(Boolean);
    return values.length > 0 ? values.slice(0, 4).join('; ') : undefined;
  };
  return h(
    'article',
    { class: 'row row--static' },
    h(
      'div',
      { class: 'row__main' },
      h(
        'div',
        { class: 'label' },
        h('h3', { class: 'label__title' }, dc('title') ?? text(header, 'identifier') ?? 'Record'),
        h(
          'p',
          { class: 'label__maker' },
          [dc('creator'), dc('date')].filter(Boolean).join(', ') ||
            (deleted ? 'Deleted record' : ''),
        ),
      ),
      facts([
        ['Identifier', text(header, 'identifier')],
        ['Datestamp', text(header, 'datestamp')],
        [
          'Sets',
          local(header, 'setSpec')
            .map((el) => el.textContent?.trim())
            .filter(Boolean)
            .join(', ') || undefined,
        ],
        ['Type', dc('type')],
        ['Subject', dc('subject')],
      ]),
    ),
  );
};

const mount = (el: HTMLElement): void => {
  document.title = 'OAI-PMH harvester | Art API Explorer';
  const params = new URLSearchParams(window.location.search);
  let controller: AbortController | null = null;

  const verb = h(
    'select',
    { name: 'verb', 'aria-label': 'Verb' },
    ...VERBS.map((v) =>
      h('option', { value: v, selected: params.get('verb') === v || undefined }, v),
    ),
  );
  const inputs = new Map<string, HTMLInputElement>();
  const fields = h('div', { class: 'searchbar__controls' });
  for (const name of Object.keys(FIELD_LABELS)) {
    const input = h('input', {
      type: 'text',
      name,
      value: params.get(name) ?? (name === 'metadataPrefix' ? 'oai_dc' : ''),
      autocomplete: 'off',
    });
    inputs.set(name, input);
    fields.append(
      h(
        'label',
        { class: 'field', dataset: { arg: name } },
        h('span', null, FIELD_LABELS[name]),
        input,
      ),
    );
  }
  const syncFields = (): void => {
    const wanted = ARGUMENTS[verb.value as Verb];
    fields.querySelectorAll<HTMLElement>('[data-arg]').forEach((field) => {
      field.hidden = !wanted.includes(field.dataset.arg ?? '');
    });
    fields.hidden = wanted.length === 0;
  };

  const form = h(
    'form',
    { class: 'searchbar' },
    h(
      'div',
      { class: 'searchbar__main searchbar__main--verb' },
      h('label', { class: 'field field--inline' }, h('span', null, 'Verb'), verb),
      h('button', { type: 'submit', class: 'button button--primary' }, 'Send request'),
    ),
    fields,
  );

  const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const output = h('div', { class: 'oai-output' });
  const more = h(
    'button',
    { type: 'button', class: 'button button--wide', hidden: true },
    'Next page (resumption token)',
  );
  let token: string | undefined;

  const request = async (resume: boolean): Promise<void> => {
    controller?.abort();
    controller = new AbortController();
    const current = verb.value as Verb;
    const query: Record<string, string> = { verb: current };
    if (resume && token) {
      // Per the protocol, a resumption token is an exclusive argument.
      query.resumptionToken = token;
    } else {
      for (const name of ARGUMENTS[current]) {
        const value = inputs.get(name)?.value.trim();
        if (value) query[name] = value;
      }
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${new URLSearchParams(query).toString()}`,
      );
      clear(output);
    }
    const url = workerUrl('/ubc-oai', query).toString();
    status.textContent = 'Waiting for the repository…';
    more.hidden = true;

    try {
      const xml = await fetchText('/ubc-oai', query, undefined, { signal: controller.signal });
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length > 0)
        throw new Error('The repository did not return well-formed XML.');

      const oaiError = local(doc, 'error')[0];
      const block = h('section', { class: 'oai-block' });
      if (oaiError) {
        block.append(
          h(
            'div',
            { class: 'error-panel', role: 'alert' },
            h(
              'div',
              { class: 'error-panel__head' },
              icon('alert', 18),
              h('strong', null, `OAI error: ${oaiError.getAttribute('code') ?? 'unknown'}`),
            ),
            h('p', null, oaiError.textContent?.trim() ?? ''),
          ),
        );
        status.textContent = 'The repository answered with a protocol error.';
      } else if (current === 'Identify') {
        const identify = local(doc, 'Identify')[0];
        block.append(
          facts(
            identify
              ? Array.from(identify.children)
                  .filter((c) => c.children.length === 0)
                  .map((c): [string, string | undefined] => [c.localName, c.textContent?.trim()])
              : [],
          ),
        );
        status.textContent = 'Repository identified.';
      } else if (current === 'ListSets' || current === 'ListMetadataFormats') {
        const rows = local(doc, current === 'ListSets' ? 'set' : 'metadataFormat');
        const columns =
          current === 'ListSets'
            ? ['setSpec', 'setName']
            : ['metadataPrefix', 'metadataNamespace', 'schema'];
        block.append(
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'status-table' },
              h('thead', null, h('tr', null, ...columns.map((c) => h('th', null, c)))),
              h(
                'tbody',
                null,
                ...rows.map((row) =>
                  h('tr', null, ...columns.map((c) => h('td', null, text(row, c) ?? ''))),
                ),
              ),
            ),
          ),
        );
        status.textContent = `${rows.length} ${current === 'ListSets' ? 'sets' : 'formats'} on this page.`;
      } else {
        const records = current === 'ListIdentifiers' ? local(doc, 'header') : local(doc, 'record');
        block.append(h('div', { class: 'rows' }, ...records.map(renderRecord)));
        status.textContent = `${output.querySelectorAll('.row').length + records.length} records loaded.`;
      }

      block.append(
        h(
          'details',
          { class: 'disclosure' },
          h('summary', null, icon('code', 15), ' Raw XML'),
          h('pre', { class: 'code' }, xml.slice(0, 60000)),
        ),
        h(
          'p',
          { class: 'muted request-log__single' },
          h('a', { href: url, target: '_blank', rel: 'noreferrer' }, url),
        ),
      );
      output.append(block);

      token = local(doc, 'resumptionToken')[0]?.textContent?.trim() || undefined;
      more.hidden = !token;
    } catch (error) {
      if (isAbort(error)) return;
      status.textContent = '';
      output.append(errorPanel(error, 'The OAI-PMH request failed'));
    }
  };

  verb.addEventListener('change', syncFields);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void request(false);
  });
  more.addEventListener('click', () => void request(true));
  syncFields();

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'page-head' },
        h('h1', null, 'UBC OAI-PMH harvester'),
        h(
          'p',
          { class: 'lede' },
          'Send any OAI-PMH verb to UBC Open Collections and page through the records it returns.',
        ),
        h(
          'p',
          { class: 'endpoint' },
          h('code', null, 'GET /ubc-oai?verb=…'),
          h('span', { class: 'muted' }, 'proxied to oce-index.library.ubc.ca/oai'),
        ),
      ),
      form,
      status,
      output,
      h('div', { class: 'more' }, more),
    ),
  );
  void request(false);
};

export default { mount };
