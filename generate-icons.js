/**
 * Genereert eenvoudige PNG-iconen voor de PWA (geen npm-dependencies nodig).
 * Gebruik: node generate-icons.js
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const SIZES = [192, 512];
const R = 124, G = 58, B = 237; // #7c3aed

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function createSolidPng(size, r, g, b) {
  // Raw scanlines: filter byte (0 = None) + RGB pixels
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    const base = y * rowSize;
    raw[base] = 0;
    for (let x = 0; x < size; x++) {
      raw[base + 1 + x * 3] = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  // bytes 10-12 remain 0 (compression, filter, interlace)

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const dest = `public/icons/icon-${size}.png`;
  writeFileSync(dest, createSolidPng(size, R, G, B));
  console.log(`✓ ${dest}`);
}
console.log('\nIconen aangemaakt (paarse vlakken). Vervang door echte afbeeldingen voor hogere kwaliteit.');
