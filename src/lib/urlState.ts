export type UrlStateOptions<T> = {
  parse: (params: URLSearchParams) => T;
  serialize: (state: T) => URLSearchParams;
};

export type WriteOptions = {
  replace?: boolean;
  silent?: boolean;
};

export type UrlStateHandle<T> = {
  readState: () => T;
  writeState: (state: T, options?: WriteOptions) => void;
  onStateChange: (listener: (state: T) => void) => () => void;
};

export const createUrlState = <T>(options: UrlStateOptions<T>): UrlStateHandle<T> => {
  let currentState: T = options.parse(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''));
  const listeners = new Set<(state: T) => void>();

  const notify = (state: T) => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const handlePopState = () => {
    if (typeof window === 'undefined') return;
    currentState = options.parse(new URLSearchParams(window.location.search));
    notify(currentState);
  };

  const ensureListener = () => {
    if (typeof window === 'undefined') return;
    if (listeners.size === 1) {
      window.addEventListener('popstate', handlePopState);
    }
  };

  const removeListener = () => {
    if (typeof window === 'undefined') return;
    if (listeners.size === 0) {
      window.removeEventListener('popstate', handlePopState);
    }
  };

  const readState = (): T => currentState;

  const writeState = (state: T, optionsOverride: WriteOptions = {}): void => {
    const params = options.serialize(state);
    if (typeof window !== 'undefined') {
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
      if (optionsOverride.replace) {
        window.history.replaceState(null, '', nextUrl);
      } else {
        window.history.pushState(null, '', nextUrl);
      }
    }
    currentState = options.parse(params);
    if (!optionsOverride.silent) {
      notify(currentState);
    }
  };

  const onStateChange = (listener: (state: T) => void): (() => void) => {
    listeners.add(listener);
    ensureListener();
    return () => {
      listeners.delete(listener);
      removeListener();
    };
  };

  return { readState, writeState, onStateChange };
};
