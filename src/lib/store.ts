type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryStore = new Map<string, string>();

const createMemoryStorage = (): StorageLike => ({
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
});

const getStorage = (): StorageLike => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return createMemoryStorage();
};

export type SavedSearch = {
  id: string;
  label: string;
  query: Record<string, string>;
  createdAt: number;
};

export type SaveSearchInput = {
  id?: string;
  label: string;
  query: Record<string, string | number | boolean | null | undefined>;
};

const STORAGE_PREFIX = 'art:saved-searches:';

const storageKeyForSource = (source: string): string => {
  const normalized = source.trim().toLowerCase();
  return `${STORAGE_PREFIX}${normalized}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const normalizeQuery = (
  query: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> => {
  const entries: [string, string][] = [];
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    const trimmedKey = key.trim();
    if (trimmedKey.length === 0) {
      return;
    }
    const normalizedValue = typeof value === 'string' ? value.trim() : String(value);
    entries.push([trimmedKey, normalizedValue]);
  });
  return Object.fromEntries(entries);
};

const parseSavedSearches = (value: string | null): SavedSearch[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries: SavedSearch[] = [];

    parsed.forEach((entry) => {
      if (!isRecord(entry)) {
        return;
      }
      const { id, label, query, createdAt } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || id.trim().length === 0) {
        return;
      }
      if (typeof label !== 'string' || label.trim().length === 0) {
        return;
      }
      if (!isRecord(query)) {
        return;
      }
      if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
        return;
      }
      const normalizedQuery = normalizeQuery(query as Record<string, string>);
      entries.push({
        id: id.trim(),
        label: label.trim(),
        query: normalizedQuery,
        createdAt,
      });
    });

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

const serializeSavedSearches = (entries: SavedSearch[]): string => {
  return JSON.stringify(entries);
};

const readSavedSearches = (source: string): SavedSearch[] => {
  const storage = getStorage();
  const key = storageKeyForSource(source);
  const raw = storage.getItem(key);
  return parseSavedSearches(raw);
};

const writeSavedSearches = (source: string, entries: SavedSearch[]): void => {
  const storage = getStorage();
  const key = storageKeyForSource(source);
  if (!entries || entries.length === 0) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, serializeSavedSearches(entries));
};

const generateId = (): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
};

export const listSavedSearches = (source: string): SavedSearch[] => {
  return readSavedSearches(source);
};

export const saveSearch = (source: string, input: SaveSearchInput): SavedSearch => {
  const entries = readSavedSearches(source).filter((entry) => entry.id !== input.id);
  const query = normalizeQuery(input.query);
  const label = input.label.trim() || 'Saved search';
  const existing = input.id
    ? readSavedSearches(source).find((entry) => entry.id === input.id)
    : undefined;

  const createdAt = existing?.createdAt ?? Date.now();
  const id = input.id && input.id.trim().length > 0 ? input.id.trim() : generateId();

  const entry: SavedSearch = {
    id,
    label,
    query,
    createdAt,
  };

  entries.push(entry);
  entries.sort((a, b) => b.createdAt - a.createdAt);
  writeSavedSearches(source, entries);
  return entry;
};

export const deleteSavedSearch = (source: string, id: string): void => {
  const entries = readSavedSearches(source).filter((entry) => entry.id !== id);
  writeSavedSearches(source, entries);
};
