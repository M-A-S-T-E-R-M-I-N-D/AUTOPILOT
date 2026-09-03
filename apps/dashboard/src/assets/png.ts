// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { deflateSync } from 'node:zlib';

/**
 * Minimal PNG/ICO encoding — zero new dependencies. `zlib` (Node built-in)
 * already produces the exact zlib-format datastream a PNG IDAT chunk requires,
 * so the only hand-rolled pieces are the chunk framing and CRC-32 (PNG has no
 * built-in Node encoder, and pulling in an image library for a handful of
 * favicon/app-icon rasters is not worth the dependency).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (ISO-HDLC / zlib polynomial) — used by every PNG chunk. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}

/**
 * Encode an RGBA8 pixel buffer (`width * height * 4` bytes, row-major, no
 * filter bytes) as a standalone PNG file. Non-interlaced, filter type 0
 * (None) on every scanline — the icons/cards this serves are small enough
 * that skipping per-row filter selection costs nothing worth the complexity.
 */
function encodeRgbaAsPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  if (rgba.length !== stride * height) {
    throw new Error(
      `encodePng: expected ${stride * height} bytes for ${width}x${height}, got ${rgba.length}`,
    );
  }
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Encode a square RGBA8 pixel buffer (`size * size * 4` bytes) — the favicon/app-icon case. */
export function encodePng(size: number, rgba: Uint8Array): Buffer {
  return encodeRgbaAsPng(size, size, rgba);
}

/** Encode a rectangular RGBA8 pixel buffer — the GitHub social-preview card case (epic 0008 slice 3). */
export function encodePngRect(width: number, height: number, rgba: Uint8Array): Buffer {
  return encodeRgbaAsPng(width, height, rgba);
}

/**
 * Pack PNG images into a multi-resolution .ico (the "PNG-in-ICO" format
 * every Vista+ / modern browser accepts — far simpler than the legacy
 * uncompressed-BMP DIB entries, since it just embeds the PNGs we already made).
 */
export function encodeIco(
  images: readonly { readonly size: number; readonly png: Buffer }[],
): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const dirSize = 16;
  let offset = 6 + dirSize * images.length;
  const dirEntries: Buffer[] = [];
  const dataParts: Buffer[] = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(dirSize);
    entry[0] = size >= 256 ? 0 : size; // width, 0 means 256
    entry[1] = size >= 256 ? 0 : size; // height, 0 means 256
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    dataParts.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirEntries, ...dataParts]);
}
