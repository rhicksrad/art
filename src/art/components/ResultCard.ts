import { candidateUrls } from '../lib/imagePipeline';
import type { NormalArt } from '../lib/types';

const rightsLabel = (rights: NormalArt['rights'] | undefined): string | undefined => {
  switch (rights) {
    case 'PD':
      return 'Public domain';
    case 'CC':
      return 'Creative Commons';
    case 'Restricted':
      return 'Restricted';
    case 'Unknown':
    default:
      return undefined;
  }
};

const createPlaceholder = (text: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'img-ph';
  el.textContent = text;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', text);
  return el;
};

const createActionLink = (href: string, label: string): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = label;
  link.className = 'result-card__action';
  return link;
};

const formatList = (values: string[] | undefined): string | undefined => {
  if (!values || values.length === 0) return undefined;
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  return unique.length ? unique.join(' • ') : undefined;
};

const providerLabel = (url: string): string => {
  if (url.includes('harvardartmuseums.org')) return 'Open at Harvard';
  if (url.includes('artmuseum.princeton.edu')) return 'Open at Princeton';
  return 'Open item';
};

const createMetaBlock = (item: NormalArt): HTMLElement | null => {
  const nodes: HTMLElement[] = [];
  if (item.maker) {
    const maker = document.createElement('p');
    maker.className = 'card__subtitle';
    maker.textContent = item.maker;
    nodes.push(maker);
  }
  if (item.dated) {
    const dated = document.createElement('p');
    dated.className = 'card__meta';
    dated.textContent = item.dated;
    nodes.push(dated);
  }
  const tags = formatList([...(item.classification ?? []), ...(item.culture ?? [])]);
  if (tags) {
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    meta.textContent = tags;
    nodes.push(meta);
  }
  const rights = rightsLabel(item.rights);
  if (rights) {
    const badge = document.createElement('span');
    badge.className = 'rights-badge';
    badge.textContent = rights;
    nodes.push(badge);
  }
  if (nodes.length === 0) return null;
  const container = document.createElement('div');
  container.className = 'card__meta-block';
  nodes.forEach((node) => container.appendChild(node));
  return container;
};

const createActions = (item: NormalArt): HTMLElement => {
  const footer = document.createElement('div');
  footer.className = 'result-card__footer';

  if (item.providerUrl) {
    footer.appendChild(createActionLink(item.providerUrl, providerLabel(item.providerUrl)));
  }

  if (item.hasImage && (item.rights === 'PD' || item.rights === 'CC')) {
    const urls = candidateUrls(item);
    if (urls.length > 0) {
      footer.appendChild(createActionLink(urls[0], 'Download image'));
    }
  }

  if (item.jsonUrl) {
    footer.appendChild(createActionLink(item.jsonUrl, 'Raw JSON'));
  }

  if (item.manifestUrl) {
    footer.appendChild(createActionLink(item.manifestUrl, 'IIIF Manifest'));
  }

  return footer;
};

export const ResultCard = (item: NormalArt): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'card result-card';

  const media = document.createElement('div');
  media.className = 'card__media';

  const placeholder = createPlaceholder('Image unavailable');
  media.appendChild(placeholder);

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${item.title}${item.maker ? ` by ${item.maker}` : ''}`.trim();
  img.className = 'result-card__image';

  const sources = candidateUrls(item);
  let index = 0;

  const tryNext = () => {
    if (index >= sources.length) {
      img.remove();
      return;
    }
    img.src = sources[index++];
  };

  img.addEventListener('error', () => {
    tryNext();
  });

  img.addEventListener('load', () => {
    placeholder.remove();
    img.classList.add('result-card__image--loaded');
  });

  if (sources.length > 0) {
    media.appendChild(img);
    tryNext();
  }

  card.appendChild(media);

  const body = document.createElement('div');
  body.className = 'card__body';

  const heading = document.createElement('h2');
  heading.className = 'card__title';
  const titleLink = document.createElement('a');
  titleLink.href = item.providerUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener';
  titleLink.textContent = item.title || 'Untitled';
  heading.appendChild(titleLink);
  body.appendChild(heading);

  const metaBlock = createMetaBlock(item);
  if (metaBlock) {
    body.appendChild(metaBlock);
  }
  body.appendChild(createActions(item));

  card.appendChild(body);
  return card;
};
