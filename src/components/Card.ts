import type { ItemCard } from '../lib/types';

export type CardProps = {
  title: string;
  sub?: string;
  date?: string;
  img?: string;
  tags?: string[];
  href?: string;
  source?: string;
  raw?: unknown;
  meta?: string;
};

const isNonEmpty = (value: string | undefined): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const createTagList = (tags: string[]): HTMLElement => {
  const list = document.createElement('ul');
  list.className = 'card__tags';
  tags.forEach((tag) => {
    const item = document.createElement('li');
    item.textContent = tag;
    list.appendChild(item);
  });
  return list;
};

const createRawLink = (raw: unknown): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'card__raw-link';
  link.textContent = 'Raw JSON';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    try {
      const json = JSON.stringify(raw, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener');
      if (win) {
        win.addEventListener('beforeunload', () => {
          URL.revokeObjectURL(url);
        });
      } else {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      // raw payload serialisation failed; ignore to keep UI responsive.
    }
  });
  return link;
};

export const createCard = ({ title, sub, date, img, tags, href, source, raw, meta }: CardProps): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'card';

  if (isNonEmpty(img)) {
    const media = document.createElement('div');
    media.className = 'card__media';
    const image = document.createElement('img');
    image.src = img;
    image.alt = title;
    media.appendChild(image);
    card.appendChild(media);
  }

  const body = document.createElement('div');
  body.className = 'card__body';

  const heading = document.createElement('h3');
  heading.className = 'card__title';
  if (isNonEmpty(href)) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = title;
    heading.appendChild(link);
  } else {
    heading.textContent = title;
  }
  body.appendChild(heading);

  if (isNonEmpty(sub)) {
    const subtitle = document.createElement('p');
    subtitle.className = 'card__subtitle';
    subtitle.textContent = sub;
    body.appendChild(subtitle);
  }

  if (isNonEmpty(date)) {
    const dateEl = document.createElement('p');
    dateEl.className = 'card__meta';
    dateEl.textContent = date;
    body.appendChild(dateEl);
  }

  if (isNonEmpty(meta)) {
    const metaEl = document.createElement('p');
    metaEl.className = 'card__meta';
    metaEl.textContent = meta;
    body.appendChild(metaEl);
  }

  if (tags && tags.length > 0) {
    body.appendChild(createTagList(tags));
  }

  const footer = document.createElement('div');
  footer.className = 'card__footer';
  if (isNonEmpty(source)) {
    const sourceEl = document.createElement('span');
    sourceEl.className = 'card__source';
    sourceEl.textContent = source;
    footer.appendChild(sourceEl);
  }
  if (raw !== undefined) {
    footer.appendChild(createRawLink(raw));
  }
  body.appendChild(footer);

  card.appendChild(body);
  return card;
};

const buildMeta = (item: ItemCard): string | undefined => {
  const parts: string[] = [];
  if (isNonEmpty(item.date)) {
    parts.push(item.date.trim());
  }
  if (Array.isArray(item.tags) && item.tags.length > 0) {
    parts.push(item.tags.join(', '));
  }
  return parts.length > 0 ? parts.join(' • ') : undefined;
};

export const renderItemCard = (item: ItemCard): HTMLElement => {
  return createCard({
    title: item.title,
    sub: item.sub,
    date: item.date,
    img: item.img,
    tags: item.tags,
    href: item.href,
    source: item.source,
    raw: item.raw,
    meta: buildMeta(item),
  });
};
