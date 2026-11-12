import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Mirrors vite.config.ts: CI builds and previews under the GitHub Pages base path, so the tests
// exercise the artifact that ships.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const BASE = process.env.CI && repo ? `/${repo}/` : '/';

/**
 * Browser tests run against the production build served by `vite preview`.
 * - e2e/site.spec.ts intercepts Worker routes, so layout and behaviour are checked
 *   deterministically.
 * - e2e/live.spec.ts (LIVE=1) lets requests through the preview proxy to the real Worker.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
