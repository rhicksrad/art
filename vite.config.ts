import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isCI = !!process.env.CI;

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const htmlPages = [
  'index',
  'harvard',
  'princeton',
  'yale',
  'dataverse',
  'ubc',
  'ubc-oai',
  'arxiv',
];

const rollupInput = Object.fromEntries(
  htmlPages.map((page) => [page, resolve(rootDir, `${page}.html`)]),
);

export default defineConfig({
  base: isCI && repo ? `/${repo}/` : '/',
  build: {
    rollupOptions: {
      input: rollupInput,
    },
  },
});
