// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the APNG half of scripts/docs/record-demo-frames.mjs:
 * the assembler that turns the recorded README demo frames into one lossless
 * loop, frame 0 whole and every later frame only the box that changed. The
 * frames here are real PNGs built with node:zlib, and `play` composites the
 * assembled stream the way §11.3.6 of the PNG spec tells a decoder to, so the
 * assertions read what a browser would show: chunk order, one shared
 * sequence, each hold and box, and every frame back exactly. The recorder's
 * browser half stays unrun, the stance record-demo-frames.test.ts takes.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
  MAX_HOLD_MS,
  assembleApng,
  readChunks,
} from '../../../../scripts/docs/record-demo-frames.mjs';

type Rgb = readonly [number, number, number];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A width × height RGB image of one colour, with `spots` painted over it. */
function image(
  width: number,
  height: number,
  fill: Rgb,
  spots: readonly { x: number; y: number; rgb: Rgb }[] = [],
): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) pixels.set(fill, p * 3);
  for (const { x, y, rgb } of spots) pixels.set(rgb, (y * width + x) * 3);
  return pixels;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** PNG §9.2's predictors, by filter type: None, Sub, Up, Average, Paeth. */
const PREDICT: readonly ((a: number, b: number, c: number) => number)[] = [
  () => 0,
  (a) => a,
  (_a, b) => b,
  (a, b) => (a + b) >> 1,
  paeth,
];

/** The raw stream IDAT compresses: each RGB row filtered with `filterOf(row)`. */
function scanlines(
  pixels: Buffer,
  width: number,
  height: number,
  filterOf: (row: number) => number = () => 0,
): Buffer {
  const stride = width * 3;
  const at = (i: number) => pixels[i] ?? 0;
  return Buffer.concat(
    Array.from({ length: height }, (_, y) => {
      const filter = filterOf(y);
      const line = Buffer.alloc(stride + 1);
      line[0] = filter;
      for (let i = 0; i < stride; i++) {
        const here = y * stride + i;
        const a = i >= 3 ? at(here - 3) : 0;
        const b = y > 0 ? at(here - stride) : 0;
        const c = i >= 3 && y > 0 ? at(here - stride - 3) : 0;
        line[i + 1] = (at(here) - PREDICT[filter]!(a, b, c)) & 0xff;
      }
      return line;
    }),
  );
}

interface PngOptions {
  filterOf?: (row: number) => number;
  /** Replaces the scanlines IDAT would carry. */
  raw?: Buffer;
  depth?: number;
  colourType?: number;
  interlace?: number;
}

/** A real PNG of `pixels`: 8-bit truecolour unless the options say otherwise. */
function png(width: number, height: number, pixels: Buffer, options: PngOptions = {}): Buffer {
  const { filterOf, raw, depth = 8, colourType = 2, interlace = 0 } = options;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = colourType;
  ihdr[12] = interlace;
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw ?? scanlines(pixels, width, height, filterOf))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Plays an APNG as §11.3.6 says a decoder must — each frame's region blended
 * onto the canvas, nothing disposed — and returns the RGB canvas after each
 * frame, asserting along the way that every row is filter None, that OVER
 * only ever meets fully opaque or fully transparent pixels, and that the
 * canvas is opaque once drawn.
 */
function play(apng: Buffer): Buffer[] {
  const chunks = readChunks(apng);
  const width = chunks[0]!.data.readUInt32BE(0);
  const height = chunks[0]!.data.readUInt32BE(4);
  const canvas = Buffer.alloc(width * height * 4);
  const frames: { control: Buffer; data: Buffer[] }[] = [];
  for (const { type, data } of chunks) {
    if (type === 'fcTL') frames.push({ control: data, data: [] });
    if (type === 'IDAT') frames.at(-1)!.data.push(data);
    if (type === 'fdAT') frames.at(-1)!.data.push(data.subarray(4));
  }
  return frames.map(({ control, data }) => {
    const [w, h, x0, y0] = [4, 8, 12, 16].map((offset) => control.readUInt32BE(offset));
    const raw = inflateSync(Buffer.concat(data));
    const stride = w! * 4 + 1;
    expect(raw.length).toBe(stride * h!);
    for (let y = 0; y < h!; y++) {
      expect(raw[y * stride]).toBe(0);
      for (let x = 0; x < w!; x++) {
        const from = y * stride + 1 + x * 4;
        const alpha = raw[from + 3];
        if (control[25] === 0 || alpha === 0xff) {
          raw.copy(canvas, ((y0! + y) * width + x0! + x) * 4, from, from + 4);
        } else {
          expect(alpha).toBe(0);
        }
      }
    }
    const rgb = Buffer.alloc(width * height * 3);
    for (let p = 0; p < width * height; p++) {
      expect(canvas[p * 4 + 3]).toBe(0xff);
      canvas.copy(rgb, p * 3, p * 4, p * 4 + 3);
    }
    return rgb;
  });
}

describe('assembleApng', () => {
  const still = image(4, 3, RED);
  const spotted = image(4, 3, RED, [
    { x: 1, y: 1, rgb: GREEN },
    { x: 2, y: 2, rgb: BLUE },
  ]);
  const flooded = image(4, 3, BLUE);
  const frames = [
    { file: 'frame-000.png', bytes: png(4, 3, still), holdMs: 900 },
    { file: 'frame-001.png', bytes: png(4, 3, spotted), holdMs: 180 },
    { file: 'frame-002.png', bytes: png(4, 3, spotted), holdMs: 600 },
    { file: 'frame-003.png', bytes: png(4, 3, flooded), holdMs: 3000 },
  ];
  const apng = assembleApng(frames);
  const chunks = readChunks(apng);
  const ofType = (type: string) => chunks.filter((c) => c.type === type);

  it('lays out IHDR, acTL, then one fcTL per frame with IDAT first and fdAT after', () => {
    expect(chunks.map((c) => c.type)).toEqual([
      'IHDR',
      'acTL',
      'fcTL',
      'IDAT',
      ...['fcTL', 'fdAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT'],
      'IEND',
    ]);
  });

  it('declares every frame and loops forever by default', () => {
    const [acTL] = ofType('acTL');
    expect(acTL?.data.readUInt32BE(0)).toBe(4);
    expect(acTL?.data.readUInt32BE(4)).toBe(0);
    const once = readChunks(assembleApng(frames, { plays: 1 })).find((c) => c.type === 'acTL');
    expect(once?.data.readUInt32BE(4)).toBe(1);
  });

  it('numbers fcTL and fdAT in one gapless sequence from 0', () => {
    const sequenced = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT');
    expect(sequenced.map((c) => c.data.readUInt32BE(0))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('writes 8-bit RGBA, not interlaced, so a later frame can leave pixels as they were', () => {
    const [ihdr] = ofType('IHDR');
    expect([...ihdr!.data]).toEqual([0, 0, 0, 4, 0, 0, 0, 3, 8, 6, 0, 0, 0]);
  });

  it('draws frame 0 whole, then each later frame over just the box that changed', () => {
    const controls = ofType('fcTL').map(({ data }) => ({
      box: [4, 8, 12, 16].map((offset) => data.readUInt32BE(offset)),
      seconds: data.readUInt16BE(20) / data.readUInt16BE(22),
      dispose: data[24],
      blend: data[25],
    }));
    expect(controls).toEqual([
      { box: [4, 3, 0, 0], seconds: 0.9, dispose: 0, blend: 0 },
      { box: [2, 2, 1, 1], seconds: 0.18, dispose: 0, blend: 1 },
      { box: [1, 1, 0, 0], seconds: 0.6, dispose: 0, blend: 1 }, // unchanged: one clear pixel
      { box: [4, 3, 0, 0], seconds: 3, dispose: 0, blend: 1 },
    ]);
  });

  it('leaves the unchanged pixels inside a changed box transparent', () => {
    const [firstDelta] = ofType('fdAT');
    const rows = inflateSync(firstDelta!.data.subarray(4));
    expect([...rows]).toEqual([
      ...[0, ...GREEN, 0xff, 0, 0, 0, 0],
      ...[0, 0, 0, 0, 0, ...BLUE, 0xff],
    ]);
  });

  it('composites back to every frame exactly, in order', () => {
    expect(play(apng)).toEqual([still, spotted, spotted, flooded]);
  });

  it('decodes every filter type a screenshot encoder may choose, row by row', () => {
    const noisy = (seed: number) =>
      Buffer.from(
        Array.from({ length: 5 * 5 * 3 }, (_, i) => (i * 37 + seed * 91 + (i >> 2) * 53) % 256),
      );
    const [one, two] = [noisy(1), noisy(2)];
    const out = assembleApng([
      { file: 'frame-000.png', bytes: png(5, 5, one, { filterOf: (y) => y }), holdMs: 100 },
      { file: 'frame-001.png', bytes: png(5, 5, two, { filterOf: (y) => 4 - y }), holdMs: 100 },
    ]);
    expect(play(out)).toEqual([one, two]);
  });

  it('joins a frame split across several IDAT chunks into one stream', () => {
    const whole = deflateSync(scanlines(spotted, 4, 3));
    const multi = Buffer.concat([
      png(4, 3, spotted).subarray(0, 8 + 12 + 13), // signature + IHDR
      pngChunk('IDAT', whole.subarray(0, 5)),
      pngChunk('IDAT', whole.subarray(5)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const out = assembleApng([frames[0]!, { file: 'frame-001.png', bytes: multi, holdMs: 100 }]);
    expect(play(out)).toEqual([still, spotted]);
  });

  it('refuses no frames', () => {
    expect(() => assembleApng([])).toThrow(/no frames/);
  });

  it('names a frame whose IHDR differs from the first', () => {
    const odd = [
      frames[0]!,
      { file: 'frame-001.png', bytes: png(4, 4, image(4, 4, RED)), holdMs: 100 },
    ];
    expect(() => assembleApng(odd)).toThrow(/frame-001\.png's IHDR differs from frame-000\.png's/);
  });

  it('refuses an indexed, 16-bit, alpha or interlaced frame, which it cannot decode', () => {
    const headers = [{ colourType: 3 }, { depth: 16 }, { colourType: 6 }, { interlace: 1 }];
    for (const header of headers) {
      const set = [{ file: 'frame-000.png', bytes: png(4, 3, still, header), holdMs: 100 }];
      expect(() => assembleApng(set)).toThrow(
        /frame-000\.png: only 8-bit truecolour, non-interlaced/,
      );
    }
  });

  it('refuses image data of the wrong length or with an unknown filter type', () => {
    const raw = scanlines(still, 4, 3);
    const short = png(4, 3, still, { raw: raw.subarray(0, -1) });
    const unknown = png(4, 3, still, { raw: Buffer.concat([Buffer.from([5]), raw.subarray(1)]) });
    expect(() => assembleApng([{ file: 'a.png', bytes: short, holdMs: 100 }])).toThrow(
      /a\.png: image data is 38 bytes, expected 39/,
    );
    expect(() => assembleApng([{ file: 'b.png', bytes: unknown, holdMs: 100 }])).toThrow(
      /b\.png: row 0 has unknown filter type 5/,
    );
  });

  it('refuses a hold fcTL cannot express', () => {
    for (const holdMs of [0, 1.5, MAX_HOLD_MS + 1, Number.NaN]) {
      const set = [{ file: 'frame-000.png', bytes: png(1, 1, image(1, 1, RED)), holdMs }];
      expect(() => assembleApng(set)).toThrow(/holdMs must be a whole number/);
    }
  });
});

describe('readChunks', () => {
  const tiny = () => png(1, 1, image(1, 1, RED));

  it('reads every chunk of a well-formed PNG through IEND', () => {
    expect(readChunks(tiny()).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('refuses bytes without the PNG signature', () => {
    expect(() => readChunks(new Uint8Array(40))).toThrow(/not a PNG/);
  });

  it('refuses a chunk whose CRC does not match', () => {
    const bytes = tiny();
    bytes[16] = (bytes[16] ?? 0) ^ 0xff; // a byte of IHDR's data
    expect(() => readChunks(bytes)).toThrow(/IHDR chunk at byte 8 fails its CRC/);
  });

  it('refuses a chunk that runs past the end, or a stream with no IEND', () => {
    const bytes = tiny();
    expect(() => readChunks(bytes.subarray(0, 30))).toThrow(/runs past the end/);
    expect(() => readChunks(bytes.subarray(0, bytes.length - 12))).toThrow(/without an IEND/);
  });
});
