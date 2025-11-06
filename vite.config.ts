import { defineConfig } from "vite";

const repository = process.env.GITHUB_REPOSITORY;
const basePath = process.env.CI && repository
  ? `/${repository.split("/")[1]}/`
  : "/";

export default defineConfig({
  base: basePath
});
