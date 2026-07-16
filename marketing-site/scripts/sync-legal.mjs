/**
 * Copies the canonical legal markdown from the repo's /legal directory into the
 * site so it can be deployed (Vercel only uploads files inside the site's root
 * directory, so the docs must be vendored here).
 *
 * The repo's ../legal/*.md remain the single source of truth. Run this whenever
 * they change:  npm run sync-legal
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const repoLegal = join(siteRoot, '..', 'legal');
const dest = join(siteRoot, 'content', 'legal');

const files = ['privacy-policy.md', 'terms-of-service.md'];

await mkdir(dest, { recursive: true });
for (const f of files) {
  await copyFile(join(repoLegal, f), join(dest, f));
  console.log(`synced ${f}`);
}
console.log('Legal docs synced into content/legal/.');
