// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure half of scripts/docs/record-demo-frames.mjs
 * — the storyboard, the manifest it writes for the (pending) GIF encoder, and
 * the PNG-size guard that holds every frame to one size. `main()` stays
 * unimported: it launches a browser and a fixture server — the same stance
 * check-links.test.ts takes for its script.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  MAX_TOTAL_MS,
  STORYBOARD,
  VIEWPORT,
  assertUniformFrames,
  buildManifest,
  frameFile,
  pngSize,
} from '../../../../scripts/docs/record-demo-frames.mjs';

/** Signature + IHDR only: exactly what pngSize reads. */
function pngHeader(width: number, height: number): Uint8Array {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('STORYBOARD', () => {
  it('opens on the empty bar and closes on the flight underway', () => {
    expect(STORYBOARD[0]?.id).toBe('empty');
    expect(STORYBOARD.at(-1)?.id).toBe('fire');
  });

  it('has an action for every beat and no action without a beat', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(STORYBOARD.map((beat) => beat.id).sort());
  });

  it('builds into a manifest inside the README budget, one frame per beat in order', () => {
    const manifest = buildManifest(STORYBOARD, VIEWPORT);
    expect(manifest.totalMs).toBeLessThanOrEqual(MAX_TOTAL_MS);
    expect(manifest.frames.map((frame) => frame.file)).toEqual(
      STORYBOARD.map((_, index) => frameFile(index)),
    );
  });
});

describe('frameFile', () => {
  it('zero-pads to three digits so a directory listing sorts in order', () => {
    expect(frameFile(0)).toBe('frame-000.png');
    expect(frameFile(42)).toBe('frame-042.png');
  });

  it('rejects a negative or fractional index', () => {
    expect(() => frameFile(-1)).toThrow(/non-negative integer/);
    expect(() => frameFile(1.5)).toThrow(/non-negative integer/);
  });
});

describe('buildManifest', () => {
  const size = { width: 10, height: 20 };

  it('lists each beat once, in order, with its hold and the one frame size', () => {
    const manifest = buildManifest(
      [
        { id: 'a', holdMs: 100 },
        { id: 'b', holdMs: 250 },
      ],
      size,
    );
    expect(manifest).toEqual({
      width: 10,
      height: 20,
      totalMs: 350,
      frames: [
        { file: 'frame-000.png', beat: 'a', holdMs: 100 },
        { file: 'frame-001.png', beat: 'b', holdMs: 250 },
      ],
    });
  });

  it('refuses an empty storyboard', () => {
    expect(() => buildManifest([], size)).toThrow(/no beats/);
  });

  it('refuses a duplicate beat id', () => {
    const beats = [
      { id: 'a', holdMs: 100 },
      { id: 'a', holdMs: 100 },
    ];
    expect(() => buildManifest(beats, size)).toThrow(/duplicate beat id: a/);
  });

  it('refuses a zero, negative or NaN hold', () => {
    expect(() => buildManifest([{ id: 'a', holdMs: 0 }], size)).toThrow(/positive/);
    expect(() => buildManifest([{ id: 'a', holdMs: -5 }], size)).toThrow(/positive/);
    expect(() => buildManifest([{ id: 'a', holdMs: Number.NaN }], size)).toThrow(/positive/);
  });

  it('refuses a hold a GIF cannot store: not a whole number of centiseconds', () => {
    expect(() => buildManifest([{ id: 'a', holdMs: 185 }], size)).toThrow(
      /beat a: .*whole number of centiseconds.*got 185/,
    );
    expect(() => buildManifest([{ id: 'a', holdMs: 180.5 }], size)).toThrow(
      /whole number of centiseconds/,
    );
  });

  it('refuses a 10ms hold, which Chromium and Firefox play as 100ms, and keeps 20ms', () => {
    expect(() => buildManifest([{ id: 'a', holdMs: 10 }], size)).toThrow(
      /beat a: .*plays as 100ms/,
    );
    expect(buildManifest([{ id: 'a', holdMs: 20 }], size).totalMs).toBe(20);
  });

  it('refuses a loop over the README budget', () => {
    const beats = [{ id: 'a', holdMs: MAX_TOTAL_MS + 10 }]; // one centisecond over
    expect(() => buildManifest(beats, size)).toThrow(/README budget/);
  });
});

describe('pngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(pngSize(pngHeader(1280, 800))).toEqual({ width: 1280, height: 800 });
  });

  it('rejects bytes that are not a PNG', () => {
    expect(() => pngSize(new Uint8Array(40))).toThrow(/not a PNG/);
    expect(() => pngSize(pngHeader(1, 1).subarray(0, 10))).toThrow(/not a PNG/);
  });
});

describe('assertUniformFrames', () => {
  it('returns the shared size when every frame matches', () => {
    const sizes = [
      { file: 'frame-000.png', width: 1280, height: 800 },
      { file: 'frame-001.png', width: 1280, height: 800 },
    ];
    expect(assertUniformFrames(sizes)).toEqual({ width: 1280, height: 800 });
  });

  it('names the odd frame and both sizes', () => {
    const sizes = [
      { file: 'frame-000.png', width: 1280, height: 800 },
      { file: 'frame-003.png', width: 1280, height: 812 },
    ];
    expect(() => assertUniformFrames(sizes)).toThrow(
      /frame-003\.png is 1280×812; frame-000\.png is 1280×800/,
    );
  });

  it('refuses an empty set', () => {
    expect(() => assertUniformFrames([])).toThrow(/no frames/);
  });
});
