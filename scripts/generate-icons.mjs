// Regenerates all app icons/splash/favicon from assets/brand/ourdollar-logo.svg.
// White mark on sage — iOS/top-level icon opaque; Android adaptive foreground +
// monochrome are the mark on transparent with safe-zone padding; splash is the
// white mark on transparent (sits on the sage splash background).
//
// Run: node scripts/generate-icons.mjs   (needs the dev dependency `sharp`)
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const raw = readFileSync('assets/brand/ourdollar-logo.svg', 'utf8');
const SAGE = '#8db19c';
const WHITE = '#ffffff';
const OUT = 'assets/images';
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const markSvg = (hex) => Buffer.from(raw.replace(/#8db19c/gi, hex));
const markPng = (hex, px) =>
  sharp(markSvg(hex)).resize(px, px, { fit: 'contain', background: transparent }).png().toBuffer();

async function squareIcon(size, bgHex, markHex, scale, file) {
  const mark = await markPng(markHex, Math.round(size * scale));
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: bgHex } })
    .composite([{ input: mark, gravity: 'center' }])
    .flatten({ background: bgHex })
    .removeAlpha() // opaque, no alpha channel (App Store requirement)
    .png()
    .toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  console.log('wrote', file);
}

async function transparentMark(size, markHex, scale, file) {
  const mark = await markPng(markHex, Math.round(size * scale));
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  console.log('wrote', file);
}

async function solid(size, bgHex, file) {
  const buf = await sharp({ create: { width: size, height: size, channels: 4, background: bgHex } })
    .flatten({ background: bgHex })
    .png()
    .toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  console.log('wrote', file);
}

await squareIcon(1024, SAGE, WHITE, 0.6, 'icon.png'); // iOS + top-level app icon
await squareIcon(96, SAGE, WHITE, 0.62, 'favicon.png'); // web
await transparentMark(1024, WHITE, 0.72, 'splash-icon.png'); // splash (on sage bg)
await transparentMark(1024, WHITE, 0.5, 'android-icon-foreground.png'); // safe-zone padding
await transparentMark(1024, WHITE, 0.5, 'android-icon-monochrome.png');
await solid(1024, SAGE, 'android-icon-background.png');
// Android status-bar notification icon: OS renders only the alpha channel as a
// white silhouette (any color here is ignored), tightly cropped — no safe-zone
// padding needed like the adaptive icon.
await transparentMark(256, WHITE, 0.75, 'notification-icon.png');
console.log('done');
