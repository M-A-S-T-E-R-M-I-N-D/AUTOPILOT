// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the APNG half of scripts/docs/record-demo-frames.mjs:
 * the assembler that turns the recorded README demo frames into one lossless
 * loop. The frames here are real PNGs built with node:zlib, so the assertions
 * read the assembled stream the way a browser does: chunk order, one shared
 * sequence, each hold, and each frame's pixels carried over unchanged. The
 * recorder's browser half stays unrun, the stance record-demo-frames.test.ts
 * takes.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
  MAX_HOLD_MS,
  assembleApng,
  readChunks,
} from '../../../../scripts/docs/record-demo-frames.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Filter-0 scanlines of one solid RGB colour: the raw stream IDAT compresses. */
function solidRows(width: number, height: number, rgb: readonly number[]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  return Buffer.concat(Array.from({ length: height }, () => row));
}

/** A real 8-bit truecolour PNG; `extra` chunks go between IHDR and IDAT. */
function png(width: number, height: number, rgb: readonly number[], extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    SIGNATURE,
    pngChunk('IHDR', ihdr),
    ...extra,
    pngChunk('IDAT', deflateSync(solidRows(width, height, rgb))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];

describe('assembleApng', () => {
  const frames = [
    { file: 'frame-000.png', bytes: png(3, 2, RED), holdMs: 900 },
    { file: 'frame-001.png', bytes: png(3, 2, GREEN), holdMs: 180 },
    { file: 'frame-002.png', bytes: png(3, 2, BLUE), holdMs: 3000 },
  ];
  const chunks = readChunks(assembleApng(frames));
  const ofType = (type: string) => chunks.filter((c) => c.type === type);

  it('lays out IHDR, acTL, then one fcTL per frame with IDAT first and fdAT after', () => {
    expect(chunks.map((c) => c.type)).toEqual([
      'IHDR',
      'acTL',
      'fcTL',
      'IDAT',
      'fcTL',
      'fdAT',
      'fcTL',
      'fdAT',
      'IEND',
    ]);
  });

  it('declares every frame and loops forever by default', () => {
    const [acTL] = ofType('acTL');
    expect(acTL?.data.readUInt32BE(0)).toBe(3);
    expect(acTL?.data.readUInt32BE(4)).toBe(0);
    const once = readChunks(assembleApng(frames, { plays: 1 })).find((c) => c.type === 'acTL');
    expect(once?.data.readUInt32BE(4)).toBe(1);
  });

  it('numbers fcTL and fdAT in one gapless sequence from 0', () => {
    const sequenced = chunks.filter((c) => c.type === 'fcTL' || c.type === 'fdAT');
    expect(sequenced.map((c) => c.data.readUInt32BE(0))).toEqual([0, 1, 2, 3, 4]);
  });

  it('shows each frame over the whole canvas for its hold, replacing the last', () => {
    const controls = ofType('fcTL').map(({ data }) => ({
      width: data.readUInt32BE(4),
      height: data.readUInt32BE(8),
      x: data.readUInt32BE(12),
      y: data.readUInt32BE(16),
      seconds: data.readUInt16BE(20) / data.readUInt16BE(22),
      dispose: data[24],
      blend: data[25],
    }));
    expect(controls).toEqual(
      [0.9, 0.18, 3].map((seconds) => ({
        width: 3,
        height: 2,
        x: 0,
        y: 0,
        seconds,
        dispose: 0,
        blend: 0,
      })),
    );
  });

  it("carries each frame's pixels over unchanged, in order", () => {
    const [idat] = ofType('IDAT');
    const streams = [idat!.data, ...ofType('fdAT').map((c) => c.data.subarray(4))];
    expect(streams.map((stream) => inflateSync(stream))).toEqual(
      [RED, GREEN, BLUE].map((rgb) => solidRows(3, 2, rgb)),
    );
  });

  it('joins a frame split across several IDAT chunks into one stream', () => {
    const whole = deflateSync(solidRows(3, 2, GREEN));
    const multi = Buffer.concat([
      png(3, 2, GREEN).subarray(0, 8 + 12 + 13), // signature + IHDR
      pngChunk('IDAT', whole.subarray(0, 5)),
      pngChunk('IDAT', whole.subarray(5)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const out = readChunks(
      assembleApng([
        { file: 'frame-000.png', bytes: png(3, 2, RED), holdMs: 100 },
        { file: 'frame-001.png', bytes: multi, holdMs: 100 },
      ]),
    );
    const fdAT = out.find((c) => c.type === 'fdAT');
    expect(inflateSync(fdAT!.data.subarray(4))).toEqual(solidRows(3, 2, GREEN));
  });

  it('refuses no frames', () => {
    expect(() => assembleApng([])).toThrow(/no frames/);
  });

  it('names a frame whose IHDR differs from the first', () => {
    const odd = [frames[0]!, { file: 'frame-001.png', bytes: png(3, 3, GREEN), holdMs: 100 }];
    expect(() => assembleApng(odd)).toThrow(/frame-001\.png's IHDR differs from frame-000\.png's/);
  });

  it('refuses an indexed-colour frame, whose palette an APNG cannot hold per frame', () => {
    const indexed = png(3, 2, RED, [pngChunk('PLTE', Buffer.from(RED))]);
    const set = [{ file: 'frame-000.png', bytes: indexed, holdMs: 100 }];
    expect(() => assembleApng(set)).toThrow(/frame-000\.png: indexed-colour/);
  });

  it('refuses a hold fcTL cannot express', () => {
    for (const holdMs of [0, 1.5, MAX_HOLD_MS + 1, Number.NaN]) {
      const set = [{ file: 'frame-000.png', bytes: png(1, 1, RED), holdMs }];
      expect(() => assembleApng(set)).toThrow(/holdMs must be a whole number/);
    }
  });
});

describe('readChunks', () => {
  it('reads every chunk of a well-formed PNG through IEND', () => {
    expect(readChunks(png(1, 1, RED)).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('refuses bytes without the PNG signature', () => {
    expect(() => readChunks(new Uint8Array(40))).toThrow(/not a PNG/);
  });

  it('refuses a chunk whose CRC does not match', () => {
    const bytes = png(1, 1, RED);
    bytes[16] = (bytes[16] ?? 0) ^ 0xff; // a byte of IHDR's data
    expect(() => readChunks(bytes)).toThrow(/IHDR chunk at byte 8 fails its CRC/);
  });

  it('refuses a chunk that runs past the end, or a stream with no IEND', () => {
    const bytes = png(1, 1, RED);
    expect(() => readChunks(bytes.subarray(0, 30))).toThrow(/runs past the end/);
    expect(() => readChunks(bytes.subarray(0, bytes.length - 12))).toThrow(/without an IEND/);
  });
});
