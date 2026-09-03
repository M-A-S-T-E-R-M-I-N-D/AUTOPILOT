// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { crc32, encodeIco, encodePng, encodePngRect } from '../../src/assets/png.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readChunks(png: Buffer): { type: string; data: Buffer }[] {
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length + 4; // length + type + data + crc
  }
  return chunks;
}

describe('crc32', () => {
  it('matches the standard CRC-32/ISO-HDLC test vector', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('is 0 for an empty buffer', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('encodePng', () => {
  it('rejects a pixel buffer of the wrong length', () => {
    expect(() => encodePng(4, new Uint8Array(4))).toThrow(/expected/);
  });

  it('produces a valid PNG signature, IHDR, and CRC-checked chunks', () => {
    const size = 3;
    const rgba = new Uint8Array(size * size * 4).fill(0);
    for (let i = 0; i < size * size; i += 1) {
      rgba[i * 4] = 0x25;
      rgba[i * 4 + 1] = 0xba;
      rgba[i * 4 + 2] = 0xf2;
      rgba[i * 4 + 3] = 255;
    }
    const png = encodePng(size, rgba);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);

    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBe(size);
    expect(ihdr.readUInt32BE(4)).toBe(size);
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // RGBA color type

    // Every chunk's trailing CRC-32 must match type+data, or a real PNG decoder rejects it.
    let offset = PNG_SIGNATURE.length;
    for (const { type, data } of chunks) {
      const crcOffset = offset + 8 + data.length;
      const storedCrc = png.readUInt32BE(crcOffset);
      expect(storedCrc).toBe(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])));
      offset = crcOffset + 4;
    }

    // Decompressing IDAT must yield one filter byte + `size*4` RGBA bytes per row.
    const raw = inflateSync(chunks[1]!.data);
    expect(raw.length).toBe((size * 4 + 1) * size);
    expect(raw[0]).toBe(0); // filter type: None
    expect(raw.subarray(1, 5)).toEqual(Buffer.from([0x25, 0xba, 0xf2, 255]));
  });
});

describe('encodePngRect', () => {
  it('rejects a pixel buffer of the wrong length', () => {
    expect(() => encodePngRect(4, 2, new Uint8Array(4))).toThrow(/expected/);
  });

  it('encodes a non-square canvas with the correct IHDR width/height', () => {
    const width = 5;
    const height = 3;
    const rgba = new Uint8Array(width * height * 4).fill(0);
    const png = encodePngRect(width, height, rgba);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    const chunks = readChunks(png);
    const ihdr = chunks[0]!.data;
    expect(ihdr.readUInt32BE(0)).toBe(width);
    expect(ihdr.readUInt32BE(4)).toBe(height);

    const raw = inflateSync(chunks[1]!.data);
    expect(raw.length).toBe((width * 4 + 1) * height);
  });
});

describe('encodeIco', () => {
  it('packs multiple PNGs into a directory whose offsets line up with the data', () => {
    const images = [16, 32].map((size) => ({
      size,
      png: encodePng(size, new Uint8Array(size * size * 4)),
    }));
    const ico = encodeIco(images);

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(images.length);

    let offset = 6;
    for (const { size, png } of images) {
      const entry = ico.subarray(offset, offset + 16);
      expect(entry[0]).toBe(size);
      expect(entry[1]).toBe(size);
      const dataSize = entry.readUInt32LE(8);
      const dataOffset = entry.readUInt32LE(12);
      expect(dataSize).toBe(png.length);
      expect(ico.subarray(dataOffset, dataOffset + dataSize)).toEqual(png);
      offset += 16;
    }
  });

  it('wraps a 256px directory entry to 0 (the ICO format\'s "0 means 256" convention)', () => {
    const size = 256;
    const png = encodePng(1, new Uint8Array(4));
    const ico = encodeIco([{ size, png }]);
    const entry = ico.subarray(6, 6 + 16);
    expect(entry[0]).toBe(0); // width: 256 wraps to the sentinel 0, not truncated to 256 % 256
    expect(entry[1]).toBe(0); // height: same wraparound
  });
});
