import type { NormalRecord } from '../lib/providers/types';

const ICON_PATHS: Record<string, string> = {
  dataset: '/assets/dataverse/dataset.svg',
  file: '/assets/dataverse/file.svg',
  image: '/assets/dataverse/image.svg',
  pdf: '/assets/dataverse/pdf.svg',
  table: '/assets/dataverse/table.svg',
};

const formatTitle = (title: string): string => {
  return title || '(untitled)';
};

const formatPublished = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return value;
};

const formatKind = (kind: NormalRecord['kind']): string => {
  switch (kind) {
    case 'dataset':
      return 'Dataset';
    case 'file':
      return 'File';
    case 'dataverse':
      return 'Collection';
    default:
      return kind;
  }
};

const truncate = (value: string | undefined, length = 220): string | undefined => {
  if (!value) return undefined;
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
};

const chip = (text: string, kind?: string): HTMLSpanElement => {
  const span = document.createElement('span');
  span.className = kind ? `chip chip--${kind}` : 'chip';
  span.textContent = text;
  return span;
};

const actionLink = (href: string, label: string): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  link.className = 'dataverse-card__action';
  return link;
};

const normalizeDoiUrl = (doi: string | undefined): string | undefined => {
  if (!doi) return undefined;
  const trimmed = doi.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('doi:')) {
    return `https://doi.org/${trimmed.slice(4)}`;
  }
  return `https://doi.org/${trimmed}`;
};

const pickIcon = (record: NormalRecord): string => {
  if (record.thumbnail) return record.thumbnail;
  if (record.kind === 'file') {
    const label = record.fileTypeLabel?.toLowerCase() ?? '';
    if (label.includes('image')) return ICON_PATHS.image;
    if (label.includes('pdf')) return ICON_PATHS.pdf;
    if (label.includes('tab') || label.includes('spreadsheet') || label.includes('excel')) return ICON_PATHS.table;
    return ICON_PATHS.file;
  }
  return ICON_PATHS.dataset;
};

export function ResultCardDataverse(record: NormalRecord): HTMLElement {
  const card = document.createElement('article');
  card.className = 'card result-card dataverse-card';
  card.dataset.kind = record.kind;

  const media = document.createElement('div');
  media.className = 'card__media dataverse-card__media';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${formatKind(record.kind)} thumbnail`;
  img.src = pickIcon(record);
  img.className = 'dataverse-card__thumb';
  media.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card__body dataverse-card__body';

  const heading = document.createElement('h2');
  heading.className = 'card__title';
  const titleLink = document.createElement('a');
  titleLink.href = record.providerUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = formatTitle(record.title);
  heading.appendChild(titleLink);
  body.appendChild(heading);

  const metaRow = document.createElement('div');
  metaRow.className = 'dataverse-card__meta';
  metaRow.appendChild(chip(formatKind(record.kind), 'kind'));
  if (record.fileTypeLabel && record.kind === 'file') {
    metaRow.appendChild(chip(record.fileTypeLabel, 'filetype'));
  }
  if (record.authors && record.authors.length) {
    metaRow.appendChild(chip(record.authors.slice(0, 2).join('; '), 'author'));
  }
  const published = formatPublished(record.published);
  if (published) {
    metaRow.appendChild(chip(published, 'date'));
  }
  body.appendChild(metaRow);

  if (record.dataverseName) {
    const dv = document.createElement('p');
    dv.className = 'dataverse-card__dataverse';
    dv.textContent = record.dataverseName;
    body.appendChild(dv);
  }

  if (record.subjects && record.subjects.length) {
    const subjects = document.createElement('div');
    subjects.className = 'dataverse-card__subjects';
    record.subjects.slice(0, 4).forEach((subject) => {
      subjects.appendChild(chip(subject, 'subject'));
    });
    body.appendChild(subjects);
  }

  const summary = truncate(record.description);
  if (summary) {
    const description = document.createElement('p');
    description.className = 'dataverse-card__description';
    description.textContent = summary;
    body.appendChild(description);
  }

  const actions = document.createElement('div');
  actions.className = 'dataverse-card__actions';
  if (record.providerUrl) {
    actions.appendChild(actionLink(record.providerUrl, 'Open in Dataverse'));
  }
  const doiUrl = normalizeDoiUrl(record.doi);
  if (doiUrl) {
    actions.appendChild(actionLink(doiUrl, 'DOI/Handle'));
  }
  if (record.jsonUrl) {
    actions.appendChild(actionLink(record.jsonUrl, 'Raw JSON'));
  }
  body.appendChild(actions);

  card.append(media, body);
  return card;
}
