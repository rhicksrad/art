export type SavedSearch = {
  id: string;
  createdAt: number;
  query: Record<string, string>;
  label?: string;
};

type StoredSearch = SavedSearch;

const STORAGE_PREFIX = "art:saved-searches:";
const MAX_ENTRIES_PER_SOURCE = 50;

const getStorage = (): Storage | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const buildKey = (source: string): string => {
  return `${STORAGE_PREFIX}${source}`;
};

const sanitizeQuery = (query: Record<string, string>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  Object.entries(query).forEach(([key, value]) => {
    if (!key || key.trim().length === 0) {
      return;
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length === 0) {
      return;
    }
    normalized[key] = trimmed;
  });
  return normalized;
};

const readEntries = (source: string): StoredSearch[] => {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const key = buildKey(source);
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry): StoredSearch | null => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Partial<StoredSearch>;
        if (typeof record.id !== "string") {
          return null;
        }
        if (typeof record.createdAt !== "number") {
          return null;
        }
        if (!record.query || typeof record.query !== "object") {
          return null;
        }
        const query: Record<string, string> = {};
        Object.entries(record.query).forEach(([key, value]) => {
          if (typeof key === "string" && typeof value === "string") {
            query[key] = value;
          }
        });
        return {
          id: record.id,
          createdAt: record.createdAt,
          query,
          label:
            typeof record.label === "string" && record.label.trim().length > 0
              ? record.label.trim()
              : undefined,
        };
      })
      .filter((entry): entry is StoredSearch => entry !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

const writeEntries = (source: string, entries: StoredSearch[]): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const key = buildKey(source);
  try {
    storage.setItem(key, JSON.stringify(entries.slice(0, MAX_ENTRIES_PER_SOURCE)));
  } catch {
    // ignore write errors
  }
};

const generateId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const listSearches = (source: string): SavedSearch[] => {
  return readEntries(source);
};

export const saveSearch = (
  source: string,
  query: Record<string, string>,
  label?: string
): SavedSearch => {
  const entries = readEntries(source);
  const now = Date.now();
  const normalizedQuery = sanitizeQuery(query);
  const saved: SavedSearch = {
    id: generateId(),
    createdAt: now,
    query: normalizedQuery,
    label: label && label.trim().length > 0 ? label.trim() : undefined,
  };

  const existingIndex = entries.findIndex((entry) => {
    const entryKeys = Object.keys(entry.query);
    const queryKeys = Object.keys(normalizedQuery);
    if (entryKeys.length !== queryKeys.length) {
      return false;
    }
    return entryKeys.every((key) => entry.query[key] === normalizedQuery[key]);
  });

  if (existingIndex >= 0) {
    entries.splice(existingIndex, 1);
  }

  entries.unshift(saved);
  writeEntries(source, entries);

  return saved;
};

export const deleteSearch = (source: string, id: string): void => {
  const entries = readEntries(source);
  const next = entries.filter((entry) => entry.id !== id);
  if (next.length === entries.length) {
    return;
  }
  writeEntries(source, next);
};
