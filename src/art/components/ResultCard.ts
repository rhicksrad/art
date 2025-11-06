import { candidateUrls } from '../lib/imagePipeline';
import type { NormalArt } from '../lib/providers/harvard';

export function ResultCard(item: NormalArt): HTMLElement {
  const el = document.createElement('article');
  el.className = 'result-card';

  const media = document.createElement('div');
  media.className = 'result-card__media';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = `${item.title}${item.maker ? ` by ${item.maker}` : ''}`;
  const candidates = candidateUrls(item.iiifService, item.primaryImage, item.renditions ?? [], 600);
  let idx = 0;
  if (candidates.length > 0) {
    img.src = candidates[idx] ?? '';
  } else {
    media.appendChild(placeholder());
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
    media.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'result-card__body';

  const title = anchor(item.title, item.providerUrl, 'Open at Harvard Art Museums');
  title.className = 'result-card__title';

  const meta = smallMeta(item);
  const actions = actionRow(item, candidates);

  body.append(title, meta, actions);
  el.append(media, body);

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

function anchor(text: string, href: string, title?: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (title) a.title = title;
  return a;
}

function smallMeta(item: NormalArt): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'result-card__meta';
  if (item.maker) {
    const maker = document.createElement('p');
    maker.className = 'result-card__maker';
    maker.textContent = item.maker;
    meta.appendChild(maker);
  }
  if (item.dated) {
    const dated = document.createElement('p');
    dated.className = 'result-card__dated';
    dated.textContent = item.dated;
    meta.appendChild(dated);
  }
  const chips: string[] = [];
  if (item.classification) chips.push(...item.classification);
  if (item.culture) chips.push(...item.culture);
  const uniqueChips = Array.from(new Set(chips));
  if (uniqueChips.length > 0) {
    const list = document.createElement('ul');
    list.className = 'result-card__chips';
    for (const value of uniqueChips) {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = value;
      list.appendChild(li);
    }
    meta.appendChild(list);
  }
  return meta;
}

function rightsBadge(rights?: NormalArt['rights']): HTMLElement | null {
  if (!rights) return null;
  const badge = document.createElement('span');
  badge.className = `rights-badge rights-badge--${rights.toLowerCase()}`;
  badge.textContent = rights === 'PD' ? 'Public Domain' : rights === 'CC' ? 'Creative Commons' : rights === 'Restricted' ? 'Restricted' : 'Rights unknown';
  return badge;
}

function actionRow(item: NormalArt, candidates: string[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'result-card__actions';

  const badge = rightsBadge(item.rights);
  if (badge) {
    badge.setAttribute('aria-label', `Rights: ${badge.textContent}`);
    row.appendChild(badge);
  }

  const openLink = anchor('Open at Harvard', item.providerUrl, 'Open the Harvard Art Museums record');
  openLink.className = 'action-link';
  row.appendChild(openLink);

  const jsonLink = anchor('Raw JSON', item.jsonUrl, 'View raw JSON for this object');
  jsonLink.className = 'action-link';
  row.appendChild(jsonLink);

  if (item.manifestUrl) {
    const manifestLink = anchor('IIIF Manifest', item.manifestUrl, 'Open IIIF manifest');
    manifestLink.className = 'action-link';
    row.appendChild(manifestLink);
  }

  const canDownload = (item.rights === 'PD' || item.rights === 'CC') && candidates.length > 0;
  if (canDownload) {
    const downloadLink = anchor('Download image', candidates[0], 'Download image rendition');
    downloadLink.className = 'action-link';
    downloadLink.target = '_self';
    downloadLink.download = '';
    row.appendChild(downloadLink);
  }

  return row;
}
