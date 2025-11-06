import { ArxivEntry } from '../lib/providers/arxiv';

const formatDate = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const createChip = (text: string, variant: 'accent' | 'muted' = 'muted'): HTMLElement => {
  const span = document.createElement('span');
  span.className = `chip chip--${variant}`;
  span.textContent = text;
  return span;
};

const createActionLink = (label: string, href: string): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.className = 'result-card__action';
  link.textContent = label;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
};

const absUrl = (id: string) => `https://arxiv.org/abs/${encodeURIComponent(id)}`;
const pdfUrl = (id: string) => `https://arxiv.org/pdf/${encodeURIComponent(id)}.pdf`;
const entryAtomUrl = (id: string) => `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;

export const ResultCardArxiv = (entry: ArxivEntry): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'card result-card result-card--arxiv';

  const header = document.createElement('header');
  header.className = 'result-card__header';

  const icon = document.createElement('img');
  icon.className = 'result-card__icon';
  icon.loading = 'lazy';
  icon.decoding = 'async';
  icon.alt = 'arXiv';
  icon.src = '/assets/arxiv/paper.svg';

  const heading = document.createElement('div');
  heading.className = 'result-card__heading';

  const title = document.createElement('h2');
  title.className = 'card__title result-card__title';
  const titleLink = document.createElement('a');
  titleLink.href = absUrl(entry.id);
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = entry.title.trim() || 'Untitled';
  title.appendChild(titleLink);

  heading.appendChild(title);

  if (entry.authors.length > 0) {
    const authors = document.createElement('p');
    authors.className = 'card__subtitle result-card__authors';
    authors.textContent = entry.authors.join(', ');
    heading.appendChild(authors);
  }

  header.append(icon, heading);
  card.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'result-card__meta';
  const published = formatDate(entry.published);
  if (published) {
    meta.appendChild(createChip(`Published ${published}`));
  }
  const updated = formatDate(entry.updated);
  if (updated && updated !== published) {
    meta.appendChild(createChip(`Updated ${updated}`));
  }
  if (entry.primaryCategory) {
    meta.appendChild(createChip(entry.primaryCategory, 'accent'));
  }
  entry.categories
    .filter((category) => category !== entry.primaryCategory)
    .slice(0, 3)
    .forEach((category) => {
      meta.appendChild(createChip(category));
    });
  if (meta.childElementCount > 0) {
    card.appendChild(meta);
  }

  if (entry.summary) {
    const abstract = document.createElement('details');
    abstract.className = 'result-card__abstract';

    const summary = document.createElement('summary');
    summary.textContent = 'Abstract';
    abstract.appendChild(summary);

    const paragraph = document.createElement('p');
    paragraph.className = 'result-card__summary';
    paragraph.textContent = entry.summary;
    abstract.appendChild(paragraph);

    card.appendChild(abstract);
  }

  const actions = document.createElement('div');
  actions.className = 'result-card__actions';
  actions.appendChild(createActionLink('Source', absUrl(entry.id)));
  actions.appendChild(createActionLink('PDF', pdfUrl(entry.id)));
  actions.appendChild(createActionLink('Raw Atom', entryAtomUrl(entry.id)));

  card.appendChild(actions);

  return card;
};
