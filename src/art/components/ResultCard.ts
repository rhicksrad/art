import { candidateUrls } from '../lib/imagePipeline';
import { NormalArt } from '../lib/types';

const createPlaceholder = (text: string): HTMLElement => {
  const placeholder = document.createElement('div');
  placeholder.className = 'card__placeholder';
  placeholder.textContent = text;
  return placeholder;
};

const applyImagePipeline = (img: HTMLImageElement, urls: string[], placeholder: HTMLElement): void => {
  let index = 0;
  if (urls.length === 0) {
    img.remove();
    return;
  }

  const tryNext = (): void => {
    if (index >= urls.length) {
      img.remove();
      return;
    }
    const url = urls[index++];
    img.src = url;
  };

  img.addEventListener('error', () => {
    tryNext();
  });

  img.addEventListener('load', () => {
    placeholder.remove();
    img.classList.add('card__image--loaded');
  });

  tryNext();
};

const createActionLink = (href: string, label: string): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = label;
  link.className = 'result-card__action';
  return link;
};

const joinUnique = (values: string[] | undefined): string | undefined => {
  if (!values) return undefined;
  const seen = new Set<string>();
  for (const value of values) {
    if (value) seen.add(value);
  }
  if (seen.size === 0) return undefined;
  return Array.from(seen).join(', ');
};

const rightsLabel = (rights: NormalArt['rights']): string | undefined => {
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
  img.alt = item.title;
  img.className = 'result-card__image';
  media.appendChild(img);

  const urls = candidateUrls(item);
  if (urls.length > 0) {
    applyImagePipeline(img, urls, placeholder);
  } else {
    img.remove();
  }

  card.appendChild(media);

  const body = document.createElement('div');
  body.className = 'card__body';

  const heading = document.createElement('h2');
  heading.className = 'card__title';
  const titleLink = document.createElement('a');
  titleLink.href = item.providerUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noreferrer';
  titleLink.textContent = item.title || 'Untitled';
  heading.appendChild(titleLink);
  body.appendChild(heading);

  if (item.maker) {
    const maker = document.createElement('p');
    maker.className = 'card__subtitle';
    maker.textContent = item.maker;
    body.appendChild(maker);
  }

  if (item.dated) {
    const dated = document.createElement('p');
    dated.className = 'card__meta';
    dated.textContent = item.dated;
    body.appendChild(dated);
  }

  const classifications = joinUnique(item.classification);
  const cultures = joinUnique(item.culture);
  const metaParts = [classifications, cultures].filter((value): value is string => Boolean(value));
  if (metaParts.length > 0) {
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    meta.textContent = metaParts.join(' • ');
    body.appendChild(meta);
  }

  const rights = rightsLabel(item.rights ?? 'Unknown');
  if (rights) {
    const rightsEl = document.createElement('p');
    rightsEl.className = 'card__meta';
    rightsEl.textContent = `Rights: ${rights}`;
    body.appendChild(rightsEl);
  }

  const footer = document.createElement('div');
  footer.className = 'result-card__footer';

  if (item.providerUrl) {
    const providerLabel = item.providerUrl.includes('artmuseum.princeton.edu')
      ? 'Open at Princeton'
      : 'Open item';
    footer.appendChild(createActionLink(item.providerUrl, providerLabel));
  }

  if (item.jsonUrl) {
    footer.appendChild(createActionLink(item.jsonUrl, 'Raw JSON'));
  }

  if (item.manifestUrl) {
    footer.appendChild(createActionLink(item.manifestUrl, 'IIIF Manifest'));
  }

  body.appendChild(footer);
  card.appendChild(body);
  return card;
};
