const DEFAULT_WORKER_BASE = 'https://art.hicksrch.workers.dev';

type RuntimeConfig = {
  WORKER_BASE?: string;
  UBC_OC_API_KEY?: string;
};

declare global {
  interface Window {
    __CONFIG__?: RuntimeConfig;
  }
}

const resolveFromWindow = (key: keyof RuntimeConfig): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const value = window.__CONFIG__?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const resolveFromEnv = (envKey: string): string | undefined => {
  if (typeof import.meta !== 'object' || !('env' in import.meta)) {
    return undefined;
  }
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const raw = env?.[envKey];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value || undefined;
};

const resolveConfigValue = (
  key: keyof RuntimeConfig,
  envKey: string,
  fallback?: string,
): string | undefined => {
  return resolveFromWindow(key) ?? resolveFromEnv(envKey) ?? fallback;
};

export const WORKER_BASE: string =
  resolveConfigValue('WORKER_BASE', 'VITE_WORKER_BASE', DEFAULT_WORKER_BASE) ?? DEFAULT_WORKER_BASE;

export const UBC_OC_API_KEY: string | undefined = resolveConfigValue('UBC_OC_API_KEY', 'VITE_UBC_OC_API_KEY');
