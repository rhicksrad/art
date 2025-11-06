import type { NormalArt } from './types';

const toIiifImage = (service: string, width = 600): string => {
  const normalized = service.replace(/\/info\.json$/i, '').replace(/\/$/, '');
  return `${normalized}/full/!${width},${width}/0/default.jpg`;
};

const normalizeUrl = (input: string | undefined): string | undefined => {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return input.startsWith('http://') ? input.replace('http://', 'https://') : input;
  }
};

const gatherFromItem = (item: NormalArt): { iiif?: string; primary?: string; renditions: string[] } => {
  return {
    iiif: item.iiifService,
    primary: item.primaryImage,
    renditions: item.renditions ?? [],
  };
};

export function candidateUrls(item: NormalArt): string[];
export function candidateUrls(iiifService?: string, primary?: string, renditions?: string[], size?: number): string[];
export function candidateUrls(
  sourceOrIiif?: NormalArt | string,
  primaryOrSize?: string | number,
  renditions: string[] = [],
  size = 600,
): string[] {
  let iiifService: string | undefined;
  let primary: string | undefined;
  let extras: string[] = renditions;
  let desiredSize = size;

  if (typeof sourceOrIiif === 'object' && sourceOrIiif !== null) {
    const data = gatherFromItem(sourceOrIiif);
    iiifService = data.iiif;
    primary = data.primary;
    extras = data.renditions;
    desiredSize = typeof primaryOrSize === 'number' ? primaryOrSize : size;
  } else {
    iiifService = sourceOrIiif ?? undefined;
    if (typeof primaryOrSize === 'number') {
      desiredSize = primaryOrSize;
    } else if (typeof primaryOrSize === 'string') {
      primary = primaryOrSize;
    }
  }

  const urls: string[] = [];
  if (iiifService) {
    urls.push(toIiifImage(iiifService, desiredSize));
  }
  if (primary) {
    urls.push(primary);
  }
  urls.push(...extras);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}
