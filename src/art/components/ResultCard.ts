import { candidateUrls } from '../lib/imagePipeline';
import type { NormalArt } from '../lib/providers/harvard';

const RIGHTS_LABEL: Record<NonNullable<NormalArt['rights']>, string> = {
  PD: 'Public Domain',
  CC: 'Creative Commons',
  Restricted: 'Rights Restricted',
  Unknown: 'Rights Status Unknown',
};

const DOWNLOADABLE_RIGHTS = new Set<NormalArt['rights']>(['PD', 'CC']);

export function ResultCard(item: NormalArt): HTMLElement {
  const el = document.createElement('article');
  el.className = 'result-card';
  el.tabIndex = -1;

  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'result-card__media';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${item.title}${item.maker ? ` by ${item.maker}` : ''}`.trim();
  const candidates = candidateUrls(item.iiifService, item.primaryImage, item.renditions, 600);
  let idx = 0;
  if (candidates.length > 0) {
    img.src = candidates[idx] ?? '';
  } else {
    imgWrapper.appendChild(placeholder());
  }
  img.onerror = () => {
    if (idx < candidates.length - 1) {
      idx += 1;
      img.src = candidates[idx];
    } else {
      img.replaceWith(placeholder());
    }
  };
  if (candidates.length > 0) {
    imgWrapper.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'result-card__body';

  const title = anchor(item.title, item.providerUrl);
  title.className = 'result-card__title';

  const meta = smallMeta(item);
  const actions = actionRow(item, candidates[0]);

  body.append(title, meta, actions);
  el.append(imgWrapper, body);
  return el;
}

function placeholder(): HTMLElement {
  const p = document.createElement('div');
  p.className = 'img-ph';
  p.textContent = 'Image unavailable';
  p.setAttribute('role', 'img');
  p.setAttribute('aria-label', 'Image unavailable');
  return p;
}

function anchor(text: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function smallMeta(item: NormalArt): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'result-card__meta';

  const maker = item.maker;
  const dated = item.dated;
  if (maker || dated) {
    const info = document.createElement('p');
    info.className = 'result-card__text';
    info.textContent = [maker, dated].filter(Boolean).join(' • ');
    meta.appendChild(info);
  }

  const chips = [...(item.classification ?? []), ...(item.culture ?? [])];
  if (chips.length > 0) {
    const list = document.createElement('ul');
    list.className = 'result-card__chips';
    for (const chip of chips) {
      const li = document.createElement('li');
      li.textContent = chip;
      list.appendChild(li);
    }
    meta.appendChild(list);
  }

  return meta;
}

function actionRow(item: NormalArt, downloadCandidate?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'result-card__actions';

  const rights = document.createElement('span');
  const status = item.rights ?? 'Unknown';
  rights.className = `result-card__badge result-card__badge--${status.toLowerCase()}`;
  rights.textContent = RIGHTS_LABEL[status] ?? 'Rights status unavailable';
  rights.title = rights.textContent;
  row.appendChild(rights);

  const links = document.createElement('div');
  links.className = 'result-card__links';
  row.appendChild(links);

  const addLink = (label: string, href: string, attrs: Record<string, string> = {}) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    for (const [key, value] of Object.entries(attrs)) {
      link.setAttribute(key, value);
    }
    links.appendChild(link);
  };

  addLink('Open at Harvard', item.providerUrl);
  addLink('Raw JSON', item.jsonUrl);
  if (item.manifestUrl) {
    addLink('IIIF Manifest', item.manifestUrl);
  }

  if (DOWNLOADABLE_RIGHTS.has(status) && downloadCandidate) {
    addLink('Download image', downloadCandidate, { download: '' });
  }

  return row;
}
