import { fetchJSON, HttpError } from '../lib/http';
import type { ItemCard } from '../lib/types';

type StanfordEmbedResponse = {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
  url?: string;
  type?: string;
  description?: string;
};

type RecordMap = Record<string, unknown>;

type StanfordDescription = {
  title?: unknown;
  contributor?: unknown;
  event?: unknown;
  subject?: unknown;
};

type StanfordCocina = {
  description?: StanfordDescription | RecordMap;
};

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
    const record = value as RecordMap;
    if (typeof record.value === 'string') {
      return firstString(record.value);
    }
    if (typeof record['@value'] === 'string') {
      return firstString(record['@value']);
    }
    for (const entry of Object.values(record)) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const toRecord = (value: unknown): RecordMap | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as RecordMap;
};

const readStructuredArray = (value: unknown): RecordMap[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toRecord(entry)).filter((entry): entry is RecordMap => entry !== null);
};

const readContributors = (value: unknown): string[] => {
  const contributors: string[] = [];
  const entries = readStructuredArray(value);
  for (const entry of entries) {
    const names = readStructuredArray(entry.name);
    for (const name of names) {
      const label = firstString(name.value);
      if (label) {
        contributors.push(label);
        break;
      }
    }
  }
  return contributors;
};

const readTitle = (description: StanfordDescription | RecordMap | undefined): string | undefined => {
  if (!description) {
    return undefined;
  }
  const titles = readStructuredArray(description.title);
  for (const entry of titles) {
    const title = firstString(entry.value);
    if (title) {
      return title;
    }
  }
  return undefined;
};

const readEventDate = (description: StanfordDescription | RecordMap | undefined): string | undefined => {
  if (!description) {
    return undefined;
  }
  const events = readStructuredArray(description.event);
  for (const event of events) {
    const dates = readStructuredArray(event.date);
    for (const dateEntry of dates) {
      const structured = readStructuredArray(dateEntry.structuredValue);
      if (structured.length > 0) {
        const parts = structured
          .map((piece) => firstString(piece.value))
          .filter((value): value is string => typeof value === 'string');
        if (parts.length > 0) {
          return parts.join(' – ');
        }
      }
      const value = firstString(dateEntry.value);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
};

const ensureIiifImage = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (/\/full\//.test(value)) {
    return value;
  }
  const trimmed = value.replace(/\/$/, '').replace(/\/info\.json$/i, '');
  return `${trimmed}/full/!400,400/0/default.jpg`;
};

const readThumbnail = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = readThumbnail(entry);
      if (result) {
        return result;
      }
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }
  const direct = firstString(record['@id'] ?? record.id ?? record.url);
  if (direct) {
    return direct;
  }
  if (record.service) {
    const serviceRecord = toRecord(record.service);
    const serviceId = serviceRecord ? firstString(serviceRecord['@id'] ?? serviceRecord.id) : undefined;
    return ensureIiifImage(serviceId);
  }
  return undefined;
};

const normalizeSignal = (signal?: AbortSignal): RequestInit | undefined => {
  return signal ? { signal } : undefined;
};

const fetchStanfordEmbed = async (purlId: string, signal?: AbortSignal): Promise<StanfordEmbedResponse | null> => {
  try {
    return await fetchJSON<StanfordEmbedResponse>(
      '/stanford-embed/oembed',
      { url: `https://purl.stanford.edu/${purlId}`, format: 'json' },
      normalizeSignal(signal),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const fetchStanfordCocina = async (purlId: string, signal?: AbortSignal): Promise<StanfordCocina | null> => {
  try {
    return await fetchJSON<StanfordCocina>(
      `/stanford-purl/${purlId}`,
      { format: 'json' },
      normalizeSignal(signal),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const fetchStanfordManifestThumbnail = async (purlId: string, signal?: AbortSignal): Promise<string | undefined> => {
  try {
    const manifest = await fetchJSON<RecordMap>(
      `/stanford-purl/${purlId}/iiif/manifest`,
      undefined,
      normalizeSignal(signal),
    );
    return readThumbnail(manifest.thumbnail);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) {
      return undefined;
    }
    throw error;
  }
};

const buildStanfordHref = (purlId: string): string => {
  return `https://purl.stanford.edu/${purlId}`;
};

const embedToItemCard = (purlId: string, embed: StanfordEmbedResponse): ItemCard => {
  const tags: string[] = [];
  if (embed.type) {
    tags.push(embed.type);
  }
  return {
    id: purlId,
    title: embed.title ?? `Stanford object ${purlId}`,
    sub: embed.author_name ?? embed.provider_name ?? undefined,
    date: undefined,
    tags: tags.length > 0 ? tags : undefined,
    img: embed.thumbnail_url ?? undefined,
    href: embed.url ?? buildStanfordHref(purlId),
    source: 'Stanford',
    raw: embed,
  };
};

const cocinaToItemCard = (purlId: string, cocina: StanfordCocina, thumbnail?: string): ItemCard => {
  const description = cocina.description;
  const title = readTitle(description) ?? `Stanford object ${purlId}`;
  const contributors = readContributors(description?.contributor);
  const tags = readStructuredArray(description?.subject)
    .map((subject) => firstString(subject.value))
    .filter((value): value is string => typeof value === 'string')
    .slice(0, 4);

  return {
    id: purlId,
    title,
    sub: contributors.length > 0 ? contributors.join(', ') : undefined,
    date: readEventDate(description),
    tags: tags.length > 0 ? tags : undefined,
    img: thumbnail,
    href: buildStanfordHref(purlId),
    source: 'Stanford',
    raw: cocina,
  };
};

const PURL_ID_PATTERN = /([a-z]{2}\d{3}[a-z]{2}\d{4})/i;

export const normalizePurlId = (value: string): string | null => {
  const match = value.trim().match(PURL_ID_PATTERN);
  return match ? match[1].toLowerCase() : null;
};

export const stanfordLookupPurl = async (
  purlId: string,
  options?: { signal?: AbortSignal },
): Promise<ItemCard | null> => {
  const normalized = normalizePurlId(purlId);
  if (!normalized) {
    return null;
  }

  const embed = await fetchStanfordEmbed(normalized, options?.signal);
  if (embed) {
    return embedToItemCard(normalized, embed);
  }

  const cocina = await fetchStanfordCocina(normalized, options?.signal);
  if (!cocina) {
    return null;
  }
  const thumbnail = await fetchStanfordManifestThumbnail(normalized, options?.signal);
  return cocinaToItemCard(normalized, cocina, thumbnail ?? undefined);
};

export default stanfordLookupPurl;
