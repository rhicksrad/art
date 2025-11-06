type RuntimeConfig = {
  WORKER_BASE: string;
};

declare global {
  interface Window {
    __CONFIG__?: Partial<RuntimeConfig>;
  }
}

const DEFAULT_WORKER_BASE = 'https://art.hicksrch.workers.dev';

const runtimeConfig: Partial<RuntimeConfig> | undefined =
  typeof window !== 'undefined' ? window.__CONFIG__ : undefined;

export const WORKER_BASE: string = runtimeConfig?.WORKER_BASE ?? DEFAULT_WORKER_BASE;
