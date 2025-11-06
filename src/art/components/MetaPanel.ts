import type { IIIFCanvas, IIIFManifest } from '../lib/iiif';
import { imageTileUrl } from '../lib/iiif';

const flattenText = (value: unknown, depth = 0): string[] => {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    const results: string[] = [];
    for (const entry of value) {
      results.push(...flattenText(entry, depth + 1));
    }
    return results;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const prioritizedKeys = ['@value', 'value', 'en', 'none', 'label', 'name', 'id'];
    for (const key of prioritizedKeys) {
      if (key in record) {
        const text = flattenText(record[key], depth + 1);
        if (text.length) return text;
      }
    }
    const aggregate: string[] = [];
    for (const entry of Object.values(record)) {
      aggregate.push(...flattenText(entry, depth + 1));
    }
    return aggregate;
  }
  return [];
};

const metadataEntries = (manifest: IIIFManifest): Array<{ label: string; values: string[] }> => {
  const rawMetadata = (manifest.raw && (manifest.raw.metadata as unknown)) ?? [];
  if (!Array.isArray(rawMetadata)) {
    return [];
  }
  const entries: Array<{ label: string; values: string[] }> = [];
  for (const item of rawMetadata as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const label = flattenText(record.label ?? record.name ?? record['@label'])[0];
    const values = flattenText(record.value ?? record['@value'] ?? record.text ?? record);
    if (label && values.length) {
      entries.push({ label, values });
    }
  }
  return entries;
};

const rightsAllowDownload = (rights?: string): boolean => {
  if (!rights) return true;
  const normalized = rights.toLowerCase();
  if (normalized.includes('public domain') || normalized.includes('cc0') || normalized.includes('creative commons')) {
    return true;
  }
  if (normalized.includes('noc-') || normalized.includes('no copyright')) {
    return true;
  }
  if (normalized.includes('inc') || normalized.includes('in copyright') || normalized.includes('restricted')) {
    return false;
  }
  return true;
};

const actionLink = (href: string, label: string, opts: { download?: boolean } = {}): HTMLAnchorElement => {
  const link = document.createElement('a');
  link.className = 'iiif-meta__action';
  link.href = href;
  link.textContent = label;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  if (opts.download) {
    link.download = '';
  }
  return link;
};

const canvasDimensionsText = (canvas: IIIFCanvas): string => {
  const width = canvas.image?.width ?? canvas.width;
  const height = canvas.image?.height ?? canvas.height;
  if (!width || !height) return '';
  return `${width.toLocaleString()} × ${height.toLocaleString()} px`;
};

export function MetaPanel(el: HTMLElement, manifest: IIIFManifest, canvas: IIIFCanvas): void {
  el.innerHTML = '';
  el.classList.add('iiif-meta__root');

  const title = document.createElement('h2');
  title.className = 'iiif-meta__title';
  title.textContent = manifest.label;

  const provider = document.createElement('p');
  provider.className = 'iiif-meta__provider';
  if (manifest.provider) {
    provider.textContent = manifest.provider;
  } else {
    provider.textContent = 'Unknown provider';
    provider.classList.add('is-muted');
  }

  const rights = document.createElement('p');
  rights.className = 'iiif-meta__rights';
  const rightsText = canvas.image?.rights ?? manifest.rights;
  rights.textContent = rightsText ?? 'Rights information unavailable';
  if (!rightsText) {
    rights.classList.add('is-muted');
  }

  const canvasHeading = document.createElement('h3');
  canvasHeading.className = 'iiif-meta__section';
  canvasHeading.textContent = canvas.label;

  const canvasDetails = document.createElement('p');
  canvasDetails.className = 'iiif-meta__details';
  canvasDetails.textContent = canvasDimensionsText(canvas) || 'Dimensions unavailable';

  const actions = document.createElement('div');
  actions.className = 'iiif-meta__actions';
  if (manifest.id) {
    actions.appendChild(actionLink(manifest.id, 'Open manifest'));
    actions.appendChild(actionLink(manifest.id, 'Raw JSON', { download: true }));
  }
  const allowDirect = rightsAllowDownload(rightsText ?? undefined);
  if (allowDirect && canvas.image) {
    const directUrl = canvas.image.service ? imageTileUrl(canvas.image.service, 3000) : canvas.image.best;
    actions.appendChild(actionLink(directUrl, 'Direct image'));
  }

  const metadataList = document.createElement('dl');
  metadataList.className = 'iiif-meta__list';
  const entries = metadataEntries(manifest);
  for (const entry of entries) {
    const dt = document.createElement('dt');
    dt.textContent = entry.label;
    const dd = document.createElement('dd');
    entry.values.forEach((value, index) => {
      const span = document.createElement('span');
      span.textContent = value;
      dd.appendChild(span);
      if (index < entry.values.length - 1) {
        dd.append(' ');
      }
    });
    metadataList.append(dt, dd);
  }
  if (entries.length === 0) {
    const emptyLabel = document.createElement('dt');
    emptyLabel.className = 'iiif-meta__empty-label';
    emptyLabel.textContent = 'Metadata';
    const emptyValue = document.createElement('dd');
    emptyValue.className = 'iiif-meta__empty';
    emptyValue.textContent = 'No additional metadata available.';
    metadataList.append(emptyLabel, emptyValue);
  }

  el.append(title, provider, rights, canvasHeading, canvasDetails, actions, metadataList);
}
