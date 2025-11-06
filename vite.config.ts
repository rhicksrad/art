import { defineConfig } from 'vite';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isCI = !!process.env.CI;
export default defineConfig({
  base: isCI && repo ? `/${repo}/` : '/',
});
