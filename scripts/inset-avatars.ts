/**
 * Insets each avatar's character inside its own square, so a circular crop
 * doesn't slice bits off it.
 *
 * The avatars are authored full bleed: a 304.39 square background rect with the
 * character drawn out to the edges. Everywhere the app shows one it clips to a
 * circle, and a circle inscribed in a square loses the corners plus a bite out
 * of every edge — which took the alien's feet, the robot's boots, the octopus's
 * tentacles and every one of Spike's spikes.
 *
 * The fix keeps the background rect full bleed, so the circle stays solid to
 * its edge, and scales only the character about the centre. 0.82 was chosen by
 * rendering 1.0 / 0.88 / 0.82 / 0.76 side by side and picking the largest that
 * cleared every character, Spike being the tightest.
 *
 * Idempotent: a file that already carries the transform is skipped, so running
 * it twice can't shrink an avatar to nothing.
 *
 * Run: npx tsx scripts/inset-avatars.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'assets/avatars';
const SIZE = 304.39;
const CENTRE = SIZE / 2;
const SCALE = 0.82;
const MARKER = 'data-inset="character"';

const files = globSync('*.svg', { cwd: DIR }).sort();
let changed = 0;
let skipped = 0;

for (const name of files) {
  const path = join(DIR, name);
  const src = readFileSync(path, 'utf8');

  if (src.includes(MARKER)) {
    console.log(`  = ${name} (already inset)`);
    skipped++;
    continue;
  }

  // The background rect stays exactly where it is; everything after it is the
  // character. Anchored on the full-bleed rect so a file shaped differently
  // fails loudly rather than being silently mangled.
  const rect = src.match(/<rect class="[^"]*" width="304\.39" height="304\.39"\/>/);
  if (!rect || rect.index === undefined) {
    throw new Error(`${name}: no full-bleed background rect — check this file by hand`);
  }
  if (!src.trimEnd().endsWith('</g></svg>')) {
    throw new Error(`${name}: unexpected tail — check this file by hand`);
  }

  const cut = rect.index + rect[0].length;
  const open = `<g ${MARKER} transform="translate(${CENTRE},${CENTRE}) scale(${SCALE}) translate(-${CENTRE},-${CENTRE})">`;
  const out = src.slice(0, cut) + open + src.slice(cut).replace(/<\/g><\/svg>\s*$/, '</g></g></svg>');

  writeFileSync(path, out, 'utf8');
  console.log(`  + ${name}`);
  changed++;
}

console.log(`\n${changed} inset, ${skipped} already done, ${files.length} total.`);
