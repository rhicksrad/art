import { fetchJSON } from '../lib/http';
import type { ItemCard } from '../lib/types';
import { iiifResourceToCards } from './iiifCollections';

const normalizePath = (identifier: string): string => {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('iiif.ub.uni-leipzig.de')) {
      return url.pathname + url.search;
    }
  } catch {
    // treat as relative path
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const leipzigCollection = async (
  identifier: string,
  options?: { signal?: AbortSignal },
): Promise<ItemCard[]> => {
  const path = normalizePath(identifier);
  if (!path) {
    return [];
  }
  const resource = await fetchJSON<unknown>(`/leipzig-iiif${path}`, undefined, { signal: options?.signal });
  return iiifResourceToCards(resource, 'LeipzigIIIF');
};

export default leipzigCollection;
