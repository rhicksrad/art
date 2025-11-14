import { fetchJSON, HttpError } from '../lib/http';
import type { ItemCard } from '../lib/types';

type UnknownRecord = Record<string, unknown>;

const firstString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as UnknownRecord)) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const isDiagnostic = (value: unknown): value is { upstream?: string; status?: number } => {
  return Boolean(value && typeof value === 'object' && 'upstream' in (value as UnknownRecord));
};

const fetchMetadata = async (volumeId: string, signal?: AbortSignal): Promise<UnknownRecord | null> => {
  const path = `/htrc/api/metadata/volume/${encodeURIComponent(volumeId)}`;
  try {
    const payload = await fetchJSON<unknown>(path, undefined, { signal });
    if (isDiagnostic(payload)) {
      return null;
    }
    return payload && typeof payload === 'object' ? (payload as UnknownRecord) : null;
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404 || error.status === 403) {
        return null;
      }
      if (error.contentType && error.contentType.includes('text/html')) {
        return null;
      }
      if (error.status === 200) {
        return null;
      }
    }
    throw error;
  }
};

const buildHref = (volumeId: string): string => {
  return `https://analytics.hathitrust.org/catalog?volume_id=${encodeURIComponent(volumeId)}`;
};

const metadataToCard = (volumeId: string, metadata: UnknownRecord | null): ItemCard => {
  const title = firstString(metadata?.title ?? metadata?.volume_title) ?? `HTRC volume ${volumeId}`;
  const author = firstString(metadata?.author ?? metadata?.creator);
  const tags = [metadata?.genre, metadata?.language]
    .map((value) => firstString(value))
    .filter((value): value is string => typeof value === 'string')
    .slice(0, 4);

  return {
    id: volumeId,
    title,
    sub: author ?? undefined,
    date: firstString(metadata?.date ?? metadata?.publication_date),
    tags: tags.length > 0 ? tags : undefined,
    href: buildHref(volumeId),
    source: 'HTRC',
    raw: metadata ?? { volumeId, note: 'HTRC metadata unavailable via public API' },
  };
};

export const htrcLookup = async (
  volumeId: string,
  options?: { signal?: AbortSignal },
): Promise<ItemCard | null> => {
  const normalized = volumeId.trim();
  if (!normalized) {
    return null;
  }
  const metadata = await fetchMetadata(normalized, options?.signal).catch(() => null);
  return metadataToCard(normalized, metadata);
};

export default htrcLookup;
