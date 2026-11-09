/**
 * Regenerates every favicon/PWA icon from the department emblem.
 *
 * The source logo has a transparent background, so it disappears in a dark
 * browser tab. Every file this script writes bakes in a solid #FFFFFF
 * background — never a transparency or a `prefers-color-scheme` variant.
 *
 * Usage: node scripts/generate-brand-icons.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(process.cwd());
const SOURCE = resolve(ROOT, 'public/img/spid/spid-logo.png');
const PUBLIC = resolve(ROOT, 'public');

const WHITE = '#FFFFFF';
/** Visible logo occupies 78% of the tile => ~11% padding on each side. */
const CONTENT_RATIO = 0.78;
/** Maskable icons need a larger safe zone; 60% keeps the crest uncropped. */
const MASKABLE_RATIO = 0.6;

async function logoBuffer(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

/** Square tile: solid white canvas, emblem centred, no transparency. */
async function tile(size, ratio) {
  const logoSize = Math.round(size * ratio);
  const logo = await logoBuffer(logoSize);
  return sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO container with PNG-compressed frames (supported by all modern browsers). */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const { size, data } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char]);
}

async function main() {
  await mkdir(PUBLIC, { recursive: true });

  const png16 = await tile(16, CONTENT_RATIO);
  const png32 = await tile(32, CONTENT_RATIO);
  const png48 = await tile(48, CONTENT_RATIO);
  const favicon = ico([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
    { size: 48, data: png48 },
  ]);
  await writeFile(resolve(PUBLIC, 'favicon.ico'), favicon);

  await writeFile(resolve(PUBLIC, 'icon-192.png'), await tile(192, CONTENT_RATIO));
  await writeFile(resolve(PUBLIC, 'icon-512.png'), await tile(512, CONTENT_RATIO));
  await writeFile(resolve(PUBLIC, 'icon-maskable-192.png'), await tile(192, MASKABLE_RATIO));
  await writeFile(resolve(PUBLIC, 'icon-maskable-512.png'), await tile(512, MASKABLE_RATIO));
  await writeFile(resolve(PUBLIC, 'apple-touch-icon.png'), await tile(180, CONTENT_RATIO));

  // Optional vector variant: a white square with the same padding.
  const svgLogo = (await logoBuffer(48)).toString('base64');
  const faviconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    `<rect width="64" height="64" fill="${WHITE}"/>` +
    `<image x="7" y="7" width="50" height="50" href="data:image/png;base64,${svgLogo}"/>` +
    '</svg>\n';
  await writeFile(resolve(PUBLIC, 'favicon.svg'), faviconSvg);

  // Open Graph card: white background keeps the crest readable on any feed.
  const ogLogo = (await logoBuffer(260)).toString('base64');
  const title = escapeXml('SPID File Management System');
  const subtitle = escapeXml('Southern Provincial Irrigation Department');
  const ogSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
    `<rect width="1200" height="630" fill="${WHITE}"/>` +
    '<rect x="440" y="70" width="320" height="320" rx="40" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="3"/>' +
    `<image x="490" y="120" width="220" height="220" href="data:image/png;base64,${ogLogo}"/>` +
    `<text x="600" y="476" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700" fill="#1B2559">${title}</text>` +
    `<text x="600" y="528" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="600" fill="#4318FF">${subtitle}</text>` +
    '<text x="600" y="574" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#64748B">Official Document &amp; Archive Portal</text>' +
    '</svg>\n';
  await writeFile(
    resolve(PUBLIC, 'img/spid/og-image.png'),
    await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toBuffer(),
  );

  console.log('Brand icons written to public/: favicon.ico, icon-192/512.png,');
  console.log('icon-maskable-192/512.png, apple-touch-icon.png, favicon.svg,');
  console.log('img/spid/og-image.png');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
