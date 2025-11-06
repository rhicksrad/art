const DEFAULT_WORKER_BASE = 'https://art.hicksrch.workers.dev';

type RuntimeConfig = {
  WORKER_BASE?: string;
};

declare global {
  interface Window {
    __CONFIG__?: RuntimeConfig;
  }
}

const resolveFromWindow = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.__CONFIG__?.WORKER_BASE;
};

const resolveFromEnv = (): string | undefined => {
  if (typeof import.meta !== 'object' || !('env' in import.meta)) {
    return undefined;
  }
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const value = typeof env?.VITE_WORKER_BASE === 'string' ? env.VITE_WORKER_BASE.trim() : '';
  return value || undefined;
};

export const WORKER_BASE: string =
  resolveFromWindow() ?? resolveFromEnv() ?? DEFAULT_WORKER_BASE;
