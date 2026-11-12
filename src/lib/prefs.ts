const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; preferences are a convenience only.
  }
};

/* ------------------------------- Theme ---------------------------------- */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'art.theme';

export const resolveTheme = (): Theme => {
  const stored = read<Theme | null>(THEME_KEY, null);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (theme: Theme, persist = false): void => {
  document.documentElement.dataset.theme = theme;
  if (persist) write(THEME_KEY, theme);
};

/* --------------------------- Recent searches ---------------------------- */

const RECENT_KEY = 'art.recent';
const RECENT_LIMIT = 8;

export const recentSearches = (): string[] =>
  read<unknown[]>(RECENT_KEY, []).filter((entry): entry is string => typeof entry === 'string');

export const rememberSearch = (q: string): void => {
  const query = q.trim();
  if (!query) return;
  const next = [
    query,
    ...recentSearches().filter((entry) => entry.toLowerCase() !== query.toLowerCase()),
  ];
  write(RECENT_KEY, next.slice(0, RECENT_LIMIT));
};

export const clearRecentSearches = (): void => write(RECENT_KEY, []);

/* ----------------------- Accent drawn from today's work ------------------- */

const ACCENT_KEY = 'art.accent';

type StoredAccent = { day: string; light: string; dark: string };

const today = (): string => new Date().toISOString().slice(0, 10);

export const applyAccent = (
  accent: { light: string; dark: string } | null,
  persist = false,
): void => {
  const style = document.documentElement.style;
  if (!accent) {
    style.removeProperty('--accent-light');
    style.removeProperty('--accent-dark');
    return;
  }
  style.setProperty('--accent-light', accent.light);
  style.setProperty('--accent-dark', accent.dark);
  if (persist) write(ACCENT_KEY, { day: today(), ...accent });
};

/** Re-apply today's accent on other pages so the whole visit shares one palette. */
export const restoreAccent = (): void => {
  const stored = read<StoredAccent | null>(ACCENT_KEY, null);
  if (stored && stored.day === today() && /^hsl\(/.test(stored.light) && /^hsl\(/.test(stored.dark))
    applyAccent(stored);
};
