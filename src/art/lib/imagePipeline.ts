import { NormalArt } from './types';

const toIiifImage = (service: string, width = 600): string => {
  const base = service.replace(/\/info\.json$/i, '').replace(/\/$/, '');
  return `${base}/full/!${width},${width}/0/default.jpg`;
};

const normalizeUrl = (input: string): string | undefined => {
  if (!input) return undefined;
  try {
    const url = new URL(input, window.location.origin);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return undefined;
  }
};

export const candidateUrls = (item: NormalArt): string[] => {
  const urls: string[] = [];
  if (item.iiifService) {
    urls.push(toIiifImage(item.iiifService));
  }
  if (item.primaryImage) {
    urls.push(item.primaryImage);
  }
  for (const rendition of item.renditions ?? []) {
    urls.push(rendition);
  }
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
};
