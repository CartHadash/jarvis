#!/usr/bin/env node
/**
 * Generates a 1024x1024 placeholder source PNG for `tauri icon`.
 *
 * Draws a solid indigo background with a rounded-square "J" glyph in white.
 * Pure Node — no external image library needed. We assemble the PNG
 * byte-by-byte so the first clone works without extra installs.
 *
 * Replace `src-tauri/icons/source.png` later with a real brand asset and
 * re-run `npx tauri icon src-tauri/icons/source.png`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'src-tauri', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZE = 1024;
const BG = [99, 102, 241];      // indigo-500 #6366f1
const FG = [255, 255, 255];     // white
const STROKE = 60;

// ─── Rasterise a bitmap ────────────────────────────────────────────────
// We draw: rounded-square background fills whole canvas, then a stylised
// "J" shape using a vertical stem + hook.

const w = SIZE, h = SIZE;
const pixels = Buffer.alloc(w * h * 3);

function setPx(x, y, rgb) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 3;
  pixels[o] = rgb[0]; pixels[o + 1] = rgb[1]; pixels[o + 2] = rgb[2];
}

// Fill background
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(x, y, BG);

// Draw stylised "J":
// stem: vertical bar at x=560..640, y=220..720
// hook: bottom curve bending left, y=620..820, x=360..640
const stemX0 = 560, stemX1 = 640, stemY0 = 220, stemY1 = 720;
for (let y = stemY0; y <= stemY1; y++)
  for (let x = stemX0; x <= stemX1; x++) setPx(x, y, FG);

// Hook: quarter-circle arc centred at (600, 700), radius 200, thickness 80
const cx = 600, cy = 700, rOut = 240, rIn = 160;
for (let y = cy; y < cy + rOut + STROKE; y++) {
  for (let x = cx - rOut - STROKE; x <= cx; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= rIn && d <= rOut) setPx(x, y, FG);
  }
}

// Cap on top of stem (serif)
for (let y = 180; y < 260; y++)
  for (let x = 460; x <= 740; x++) setPx(x, y, FG);

// ─── Encode as PNG ─────────────────────────────────────────────────────
// Build scanlines with filter=0 prepended.
const scanlineLen = 1 + w * 3;
const raw = Buffer.alloc(scanlineLen * h);
for (let y = 0; y < h; y++) {
  raw[y * scanlineLen] = 0; // filter: none
  pixels.copy(raw, y * scanlineLen + 1, y * w * 3, (y + 1) * w * 3);
}
const idat = deflateSync(raw, { level: 9 });

// CRC32 per PNG spec
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = Buffer.alloc(13);
IHDR.writeUInt32BE(w, 0); IHDR.writeUInt32BE(h, 4);
IHDR.writeUInt8(8, 8);   // bit depth
IHDR.writeUInt8(2, 9);   // color type: RGB
IHDR.writeUInt8(0, 10); IHDR.writeUInt8(0, 11); IHDR.writeUInt8(0, 12);

const png = Buffer.concat([
  SIG,
  chunk('IHDR', IHDR),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = resolve(outDir, 'source.png');
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
