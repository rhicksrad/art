const cache = new Map<string, unknown>();

const makeKey = (method: string, url: string): string => {
  return `${method.toUpperCase()} ${url}`;
};

export const get = <T>(url: string, method = "GET"): T | undefined => {
  return cache.get(makeKey(method, url)) as T | undefined;
};

export const set = (url: string, data: unknown, method = "GET"): void => {
  cache.set(makeKey(method, url), data);
};

export const clear = (): void => {
  cache.clear();
};
