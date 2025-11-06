export type QueryInput = Record<string, string | number | boolean | null | undefined>;

export const toQuery = (input: QueryInput): Record<string, string> => {
  const query: Record<string, string> = {};

  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    const normalized = typeof value === "string" ? value.trim() : String(value);
    if (normalized.length === 0) {
      return;
    }

    query[key] = normalized;
  });

  return query;
};

export const int = (
  value: string | number | null | undefined,
  fallback: number
): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

export const pageFromUrl = (search: string = window.location.search): number => {
  const params = new URLSearchParams(search);
  const page = int(params.get("page"), 1);
  return page > 0 ? page : 1;
};
