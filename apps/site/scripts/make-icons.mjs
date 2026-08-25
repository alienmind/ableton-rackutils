/**
 * Draws the app icons into `public/`, from code.
 *
 * A manifest without icons is not installable - Chrome and Safari both refuse
 * to offer "Add to Home Screen" - so the PWA needed real PNGs, at 192 and 512,
 * plus a maskable one whose art stays inside the safe circle Android crops to.
 *
 * Written by hand rather than exported from the logo: the logo is a 2.4MB
 * photo, it does not survive being scaled to 192px, and a build step that
 * needs a rasteriser is a dependency this repo does not otherwise have. Node's
 * own zlib is enough to write a PNG.
 *
 *   node scripts/make-icons.mjs
 *
 * The output is committed. Re-run it only when the mark changes.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BACKGROUND = [20, 21, 26, 255]; // the app's own background
const KNOB = [58, 61, 69, 255];
const ARC = [110, 168, 255, 255]; // --edit-accent
const POINTER = [244, 245, 248, 255];

/**
 * One icon, drawn as a macro knob: the thing this tool is about.
 *
 * `inset` is how much of the canvas the art leaves free. Android crops a
 * maskable icon to a circle covering the middle 80%, so its art has to sit
 * inside that or lose its edges.
 */
function drawIcon(size, { inset = 0.08, round = true } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = size / 2;
  const radius = centre * (1 - inset);
  const knobRadius = radius * 0.62;
  const arcRadius = radius * 0.84;
  const arcWidth = radius * 0.16;
  // Live's knobs sweep from about 7 o'clock round to 5 o'clock; this one sits
  // at about three quarters, which reads as "a control, turned up".
  const sweepStart = (-225 * Math.PI) / 180;
  const sweepEnd = (45 * Math.PI) / 180;
  const value = sweepStart + (sweepEnd - sweepStart) * 0.72;

  // 3x3 supersampling: no anti-aliasing otherwise, and a jagged circle at
  // 192px looks like a mistake rather than a mark.
  const samples = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const [cr, cg, cb, ca] = sample(px, py);
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = samples * samples;
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(r / n);
      pixels[i + 1] = Math.round(g / n);
      pixels[i + 2] = Math.round(b / n);
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return pixels;

  function sample(px, py) {
    const dx = px - centre;
    const dy = py - centre;
    const distance = Math.hypot(dx, dy);

    // The plate. Rounded square for the app icon, full square for maskable -
    // the launcher does its own masking and a rounded one inside it reads as
    // a small icon in a big frame.
    const edge = round ? roundedSquare(px, py, size, size * 0.22) : true;
    if (!edge) return [0, 0, 0, 0];

    // The pointer line, from the centre out to the value.
    const angle = Math.atan2(dy, dx);
    const along = dx * Math.cos(value) + dy * Math.sin(value);
    const across = Math.abs(-dx * Math.sin(value) + dy * Math.cos(value));
    if (along > 0 && along < knobRadius * 0.95 && across < size * 0.035) return POINTER;

    if (distance < knobRadius) return KNOB;

    // The arc: filled up to the value, track grey beyond it, nothing outside
    // the sweep. A knob reads as a knob because it shows where it is.
    if (distance > arcRadius - arcWidth && distance < arcRadius) {
      const turned = (((angle - sweepStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sweep = (((sweepEnd - sweepStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const filled = (((value - sweepStart) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (turned <= filled) return ARC;
      if (turned <= sweep) return KNOB;
    }
    return BACKGROUND;
  }
}

/** True inside a square with rounded corners, so the icon has the shape a phone expects. */
function roundedSquare(px, py, size, radius) {
  const x = Math.min(px, size - px);
  const y = Math.min(py, size - py);
  if (x > radius || y > radius) return x > 0 && y > 0;
  return Math.hypot(radius - x, radius - y) <= radius;
}

/** A PNG, written by hand: IHDR, one deflated IDAT, IEND. */
function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0);
  return Buffer.concat([head, data, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

mkdirSync(out, { recursive: true });

for (const [name, size, options] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // Maskable: no rounding and more inset, because the launcher crops to a
  // circle over the middle 80%.
  ['icon-maskable-512.png', 512, { inset: 0.22, round: false }],
  ['apple-touch-icon.png', 180, {}],
]) {
  writeFileSync(path.join(out, name), encodePng(size, drawIcon(size, options)));
  console.log(`icons: public/${name} (${size}px)`);
}

// The tab icon, as SVG: it is two shapes, and a vector one stays sharp at any
// size a browser asks for.
writeFileSync(
  path.join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#14151a"/>
  <path d="M 13.4 45.4 A 26 26 0 1 1 50.6 45.4" fill="none" stroke="#3a3d45" stroke-width="6" stroke-linecap="round"/>
  <path d="M 13.4 45.4 A 26 26 0 0 1 20.9 13.9" fill="none" stroke="#6ea8ff" stroke-width="6" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="15" fill="#3a3d45"/>
  <line x1="32" y1="32" x2="21" y2="21" stroke="#f4f5f8" stroke-width="4" stroke-linecap="round"/>
</svg>
`,
);
console.log('icons: public/favicon.svg');
