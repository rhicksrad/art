import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeHtmlEntries } from '../src/lib/routeRegistry.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = resolve(repoRoot, 'dist');

const missingFiles = activeHtmlEntries.filter((entry) => !existsSync(resolve(distDir, entry)));

if (missingFiles.length > 0) {
  console.error('Post-build smoke check failed. Missing HTML files in dist/:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`Post-build smoke check passed (${activeHtmlEntries.length} HTML files found in dist/).`);
