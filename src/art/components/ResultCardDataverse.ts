import { NormalRecord } from '../lib/types';

const KIND_LABEL: Record<NormalRecord['kind'], string> = {
  dataset: 'Dataset',
  file: 'File',
  dataverse: 'Collection',
};

const doiToHref = (doi: string): string => {
  const trimmed = doi.replace(/^doi:/i, '').trim();
  if (trimmed.startsWith('10.')) {
    return `https://doi.org/${encodeURIComponent(trimmed)}`;
  }
  if (trimmed.startsWith('hdl:')) {
    return `https://hdl.handle.net/${encodeURIComponent(trimmed.slice(4))}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://doi.org/${encodeURIComponent(trimmed)}`;
};

const createActionLink = (label: string, href: string): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.className = 'dv-card__action';
  link.textContent = label;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  return link;
};

const createChip = (text: string): HTMLSpanElement => {
  const span = document.createElement('span');
  span.className = 'dv-chip';
  span.textContent = text;
  return span;
};

export const ResultCardDataverse = (record: NormalRecord): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'dv-card';
  card.dataset.kind = record.kind;

  const media = document.createElement('div');
  media.className = 'dv-card__media';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = record.thumbnail ?? `/assets/dataverse/${record.kind === 'file' ? 'file' : 'dataset'}.svg`;
  img.alt = `${KIND_LABEL[record.kind]} thumbnail for ${record.title}`;
  media.appendChild(img);

  const body = document.createElement('div');
  body.className = 'dv-card__body';

  const badge = document.createElement('span');
  badge.className = 'dv-card__badge';
  badge.textContent = KIND_LABEL[record.kind];
  body.appendChild(badge);

  const title = document.createElement('h3');
  title.className = 'dv-card__title';
  const titleLink = document.createElement('a');
  titleLink.href = record.providerUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = record.title;
  title.appendChild(titleLink);
  body.appendChild(title);

  if (record.description) {
    const description = document.createElement('p');
    description.className = 'dv-card__description';
    description.textContent = record.description;
    body.appendChild(description);
  }

  const chips = document.createElement('div');
  chips.className = 'dv-card__chips';

  if (record.authors?.length) {
    chips.appendChild(createChip(record.authors.join('; ')));
  }
  if (record.published) {
    chips.appendChild(createChip(record.published));
  }
  if (record.dataverseName) {
    chips.appendChild(createChip(record.dataverseName));
  }
  if (record.fileTypeGroup && record.kind === 'file') {
    chips.appendChild(createChip(record.fileTypeGroup));
  }
  if (record.subjects?.length) {
    record.subjects.slice(0, 4).forEach((subject) => {
      chips.appendChild(createChip(subject));
    });
  }

  if (chips.childElementCount > 0) {
    body.appendChild(chips);
  }

  const actions = document.createElement('div');
  actions.className = 'dv-card__actions';
  actions.appendChild(createActionLink('Open in Dataverse', record.providerUrl));

  if (record.doi) {
    actions.appendChild(createActionLink('DOI/Handle', doiToHref(record.doi)));
  }

  if (record.jsonUrl) {
    actions.appendChild(createActionLink('Raw JSON', record.jsonUrl));
  }

  body.appendChild(actions);

  card.append(media, body);
  return card;
};
