// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Records the README's demo — Lock on · Lucky · Fire — as a numbered PNG frame
 * sequence plus a `frames.json` manifest, from the same staged scene
 * `capture-screens.mjs` shoots its stills from (board web-mtnd3yeq-oyprf0,
 * slice 1/2: the recording half). The encoding half — the animated GIF at the
 * README top — waits on the operator's supply-chain approval of a pure-JS gif
 * encoder devDependency (docs/adr/0013-readme-demo-gif-encoder.md names the
 * candidate and its review); until then this output IS that encoder's input
 * contract: every frame the same pixel size (asserted before the manifest is
 * written), each with its own hold time, in order.
 *
 * It also assembles the frames into `demo.png`: one looping animated PNG, with
 * no new dependency. APNG (W3C PNG Third Edition, Recommendation 2025-06-24,
 * §11.3.6: acTL · fcTL · fdAT) needs no encoder, only node:zlib. Frame 0 is
 * the default image, whole; every later frame is an fdAT holding just the box
 * that changed, its unchanged pixels transparent, drawn over the frame before.
 * The loop is lossless, about a third the size of the frames it is made of,
 * and every current browser plays it wherever a PNG may appear. The operator
 * can watch the real loop before approving the gif encoder, or take the APNG
 * instead of it — but on GitHub only a `.gif` gets a play/pause control, so an
 * APNG at the README top must sit in a <picture> whose
 * `(prefers-reduced-motion: reduce)` source is a still
 * (apps/dashboard/test/assets/readme-motion.test.ts holds README.md to that).
 *
 *   pnpm run build
 *   node scripts/docs/record-demo-frames.mjs [outDir]
 *
 * `outDir` defaults to the git-ignored `docs/screens/demo-frames/`. Boots
 * `apps/dashboard/dist/e2e-server-populated.js` itself when nothing answers on
 * the fixture port and stops it on exit; an already-listening fixture is
 * reused (and, as with capture-screens, may serve a stale build — restart it
 * after `pnpm run build`). AP_CAPTURE_CHANNEL=msedge (or chrome) uses an
 * installed browser when Playwright's own build is not downloaded.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { BASE, FOLDER, open, runningFlight, settle } from './demo-scene.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FIXTURE_SERVER = join(ROOT, 'apps', 'dashboard', 'dist', 'e2e-server-populated.js');
const DEFAULT_OUT = join(ROOT, 'docs', 'screens', 'demo-frames');
const FIXTURE_BOOT_MS = 30_000;

/** README-top framing: 16:10 at 1× — one GIF pixel per CSS pixel keeps the
 *  encoder's palette and the file size honest. */
export const VIEWPORT = { width: 1280, height: 800 };
/** The manifest the encoder reads, written beside the frames. */
export const MANIFEST = 'frames.json';
/** The assembled loop (an APNG), written beside the frames it is made of. */
export const ANIMATION = 'demo.png';
/** fcTL's delay_num is 2 bytes; each hold is written as holdMs / 1000 s. */
export const MAX_HOLD_MS = 0xffff;
/** README animation budget: past this a hero loop stops being glanceable. */
export const MAX_TOTAL_MS = 12_000;

/**
 * The demo's beats, in order: one frame each, held `holdMs` before the next.
 * The loop opens on the empty bar and closes on the flight underway, both held
 * long enough to read; the typing beats are short so the folder appears typed,
 * not pasted.
 * @type {readonly { id: string, holdMs: number }[]}
 */
export const STORYBOARD = Object.freeze([
  { id: 'empty', holdMs: 900 },
  { id: 'type-1', holdMs: 180 },
  { id: 'type-2', holdMs: 180 },
  { id: 'lock-on', holdMs: 900 },
  { id: 'options', holdMs: 600 },
  { id: 'lucky', holdMs: 2600 },
  { id: 'fire', holdMs: 3000 },
]);

/** `frame-003.png` — zero-padded so a directory listing is already in order. */
export function frameFile(index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`frame index must be a non-negative integer, got ${index}`);
  }
  return `frame-${String(index).padStart(3, '0')}.png`;
}

/**
 * The encoder's input contract: which file to show for how long, in order,
 * plus the one size every frame has. Throws rather than write a manifest an
 * encoder would misread: no beats, a duplicate beat id, a non-positive hold,
 * or a loop longer than the README budget.
 * @param {readonly { id: string, holdMs: number }[]} beats
 * @param {{ width: number, height: number }} size
 */
export function buildManifest(beats, size) {
  if (beats.length === 0) throw new Error('storyboard has no beats');
  const seen = new Set();
  const frames = beats.map((beat, index) => {
    if (seen.has(beat.id)) throw new Error(`duplicate beat id: ${beat.id}`);
    seen.add(beat.id);
    if (!Number.isFinite(beat.holdMs) || beat.holdMs <= 0) {
      throw new Error(`beat ${beat.id}: holdMs must be a positive number, got ${beat.holdMs}`);
    }
    return { file: frameFile(index), beat: beat.id, holdMs: beat.holdMs };
  });
  const totalMs = frames.reduce((sum, frame) => sum + frame.holdMs, 0);
  if (totalMs > MAX_TOTAL_MS) {
    throw new Error(`loop runs ${totalMs}ms, over the ${MAX_TOTAL_MS}ms README budget`);
  }
  return { width: size.width, height: size.height, totalMs, frames };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Width × height from a PNG's IHDR (by spec the first chunk) — enough to hold
 * the frames to one size without a decoder dependency.
 * @param {Uint8Array} bytes
 */
export function pngSize(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const isPng =
    buf.length >= 24 &&
    buf.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buf.toString('latin1', 12, 16) === 'IHDR';
  if (!isPng) throw new Error('not a PNG (no signature + IHDR)');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Every frame must be the size of the first, or an animation encoder either
 * refuses the set or silently crops — name the odd frame instead.
 * @param {readonly { file: string, width: number, height: number }[]} sizes
 */
export function assertUniformFrames(sizes) {
  if (sizes.length === 0) throw new Error('no frames recorded');
  const [first] = sizes;
  const odd = sizes.find((s) => s.width !== first.width || s.height !== first.height);
  if (odd) {
    throw new Error(
      `${odd.file} is ${odd.width}×${odd.height}; ${first.file} is ${first.width}×${first.height}` +
        ' — every frame must match',
    );
  }
  return { width: first.width, height: first.height };
}

/**
 * A PNG's chunks, in order. Throws on anything the APNG assembler would carry
 * over corrupt: no signature, a chunk running past the end, a CRC mismatch, or
 * no IEND.
 * @param {Uint8Array} bytes
 * @returns {{ type: string, data: Buffer }[]}
 */
export function readChunks(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG (no signature)');
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buf.length) throw new Error(`chunk at byte ${offset} runs past the end`);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    if (crc32(buf.subarray(offset + 4, end - 4)) !== buf.readUInt32BE(end - 4)) {
      throw new Error(`${type} chunk at byte ${offset} fails its CRC`);
    }
    chunks.push({ type, data: buf.subarray(offset + 8, end - 4) });
    if (type === 'IEND') return chunks;
    offset = end;
  }
  throw new Error('PNG ends without an IEND chunk');
}

/**
 * True when the PNG animates: an acTL chunk before its first IDAT, the only
 * place §5.6 (Table 7) allows it; a stream with acTL later is no animation.
 * Throws on bytes that are not a PNG rather than call them still.
 * @param {Uint8Array} bytes
 */
export function isAnimatedPng(bytes) {
  for (const { type } of readChunks(bytes)) {
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
  }
  return false;
}

/** One chunk: length, type, data, and the CRC over type + data. */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Bytes per pixel: the frames are 8-bit RGB, the loop 8-bit RGBA. */
const RGB = 3;
const RGBA = 4;
/** fcTL blend_op: frame 0 replaces the canvas, every later frame is drawn over it. */
const BLEND_SOURCE = 0;
const BLEND_OVER = 1;
/** A frame identical to the one before still holds its time, as one transparent pixel. */
const UNCHANGED = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

/** PNG's Paeth predictor (§9.4): whichever of a, b, c is nearest a + b − c. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** §9.2's five filter types, each a predictor over left (a), up (b) and up-left (c). */
const PREDICTORS = [
  () => 0,
  (a) => a,
  (a, b) => b,
  (a, b) => (a + b) >> 1,
  paeth,
];

/**
 * An inflated IDAT stream of 8-bit RGB scanlines, unfiltered into row-major
 * pixels. Throws on a stream of the wrong length or an unknown filter type.
 */
function unfilter(raw, width, height, file) {
  const stride = width * RGB;
  if (raw.length !== (stride + 1) * height) {
    throw new Error(`${file}: image data is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  }
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const predict = PREDICTORS[raw[y * (stride + 1)]];
    if (!predict) throw new Error(`${file}: row ${y} has unknown filter type ${raw[y * (stride + 1)]}`);
    const line = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= RGB ? pixels[row + i - RGB] : 0;
      const b = y > 0 ? pixels[row - stride + i] : 0;
      const c = i >= RGB && y > 0 ? pixels[row - stride + i - RGB] : 0;
      pixels[row + i] = raw[line + i] + predict(a, b, c); // a Uint8Array stores it mod 256
    }
  }
  return pixels;
}

/**
 * A frame's IHDR (which must match frame 0's) and its pixels. Only what
 * Chromium's screenshots are decodes: 8-bit truecolour, not interlaced. An
 * indexed frame brings its own palette; an alpha channel would blend wrongly
 * over the frame before. Ancillary chunks are dropped; the screenshots carry none.
 */
function decodeFrame(bytes, file) {
  const chunks = readChunks(bytes);
  if (chunks[0]?.type !== 'IHDR') throw new Error(`${file}: IHDR is not the first chunk`);
  const ihdr = chunks[0].data;
  const [depth, colourType, , , interlace] = ihdr.subarray(8, 13);
  if (depth !== 8 || colourType !== 2 || interlace !== 0) {
    throw new Error(
      `${file}: only 8-bit truecolour, non-interlaced frames animate` +
        ` (bit depth ${depth}, colour type ${colourType}, interlace ${interlace})`,
    );
  }
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  if (idat.length === 0) throw new Error(`${file}: no IDAT chunk`);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  return { ihdr, width, height, pixels: unfilter(inflateSync(Buffer.concat(idat)), width, height, file) };
}

function samePixel(prev, next, i) {
  return prev[i] === next[i] && prev[i + 1] === next[i + 1] && prev[i + 2] === next[i + 2];
}

/** The smallest box holding every pixel that differs between two frames, or null. */
function changedRegion(prev, next, width, height) {
  let left = width;
  let top = -1;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (samePixel(prev, next, (y * width + x) * RGB)) continue;
      if (top < 0) top = y;
      bottom = y;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return top < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * The region of `next` as RGBA scanlines, filter None (on the recorded frames
 * it deflates smaller than the min-sum-of-differences choice). A pixel is
 * opaque where it differs from `prev` (every pixel when there is none) and
 * transparent black where it matches, so drawn OVER the frame before it
 * leaves that pixel as it was: each frame composites back exactly.
 */
function deltaRows(prev, next, width, region) {
  const stride = region.width * RGBA + 1;
  const rows = Buffer.alloc(stride * region.height); // zeroed: filter None, transparent black
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const i = ((region.y + y) * width + region.x + x) * RGB;
      if (prev && samePixel(prev, next, i)) continue;
      const o = y * stride + 1 + x * RGBA;
      next.copy(rows, o, i, i + RGB);
      rows[o + 3] = 0xff;
    }
  }
  return rows;
}

/** fcTL: `region` of the canvas, shown `holdMs`, left in place (dispose_op NONE) for the next. */
function frameControl(sequence, region, holdMs, blend) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(region.width, 4);
  data.writeUInt32BE(region.height, 8);
  data.writeUInt32BE(region.x, 12);
  data.writeUInt32BE(region.y, 16);
  data.writeUInt16BE(holdMs, 20);
  data.writeUInt16BE(1000, 22);
  data[25] = blend; // data[24], dispose_op, stays NONE (0)
  return pngChunk('fcTL', data);
}

/**
 * The frames, in order, as one lossless APNG: frame 0 whole, every later
 * frame only the box that changed. Throws rather than write a loop a browser
 * would misplay: no frames, a hold that is not a whole number of milliseconds
 * in 1..MAX_HOLD_MS, a frame it cannot decode, or a frame whose IHDR differs
 * from the first.
 * @param {readonly { file: string, bytes: Uint8Array, holdMs: number }[]} frames
 * @param {{ plays?: number }} [options] `plays` 0 (the default) loops forever.
 */
export function assembleApng(frames, { plays = 0 } = {}) {
  if (frames.length === 0) throw new Error('no frames to animate');
  const images = frames.map(({ file, bytes, holdMs }) => {
    if (!Number.isInteger(holdMs) || holdMs < 1 || holdMs > MAX_HOLD_MS) {
      throw new Error(`${file}: holdMs must be a whole number in 1..${MAX_HOLD_MS}, got ${holdMs}`);
    }
    return { file, holdMs, ...decodeFrame(bytes, file) };
  });
  const [first] = images;
  const odd = images.find((image) => !image.ihdr.equals(first.ihdr));
  if (odd) {
    throw new Error(`${odd.file}'s IHDR differs from ${first.file}'s — every frame must match`);
  }
  const { width, height } = first;
  const ihdr = Buffer.from(first.ihdr);
  ihdr[9] = 6; // truecolour with alpha: a later frame's unchanged pixels are transparent
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(images.length, 0);
  animationControl.writeUInt32BE(plays, 4);
  const parts = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('acTL', animationControl)];
  let sequence = 0;
  for (const [index, image] of images.entries()) {
    const prev = index === 0 ? null : images[index - 1].pixels;
    const region = prev
      ? (changedRegion(prev, image.pixels, width, height) ?? UNCHANGED)
      : { x: 0, y: 0, width, height };
    const data = deflateSync(deltaRows(prev, image.pixels, width, region), { level: 9 });
    parts.push(frameControl(sequence++, region, image.holdMs, prev ? BLEND_OVER : BLEND_SOURCE));
    if (index === 0) {
      parts.push(pngChunk('IDAT', data));
    } else {
      const sequenced = Buffer.alloc(4);
      sequenced.writeUInt32BE(sequence++, 0);
      parts.push(pngChunk('fdAT', Buffer.concat([sequenced, data])));
    }
  }
  parts.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** @typedef {{ browser: import('@playwright/test').Browser, context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page }} Scene */

async function typeFolder(scene, value) {
  await scene.page.fill('#fly-folder', value);
  return scene;
}

/**
 * What each beat does to the scene before its frame is shot. A beat may hand
 * back a new scene: `fire` reopens the page with the flight staged as running,
 * the way capture-screens shoots its third still. Keyed by STORYBOARD id; the
 * test pins the two in step.
 * @type {Record<string, (scene: Scene) => Promise<Scene>>}
 */
export const ACTIONS = {
  empty: async (scene) => {
    await scene.page.locator('#flightbar').waitFor({ state: 'visible' });
    return scene;
  },
  'type-1': (scene) => typeFolder(scene, '~/src'),
  'type-2': (scene) => typeFolder(scene, '~/src/checkout'),
  'lock-on': async (scene) => {
    await typeFolder(scene, FOLDER);
    await scene.page.locator('#fly-folder').blur();
    return scene;
  },
  options: async (scene) => {
    await scene.page.click('#fly-options-toggle');
    return scene;
  },
  lucky: async (scene) => {
    await scene.page.click('#fly-lucky');
    await scene.page.locator('#fly-fit:not([hidden])').waitFor();
    await scene.page.locator('#fly-go').blur(); // the roll hands focus to Fire; its tip would cover the folder
    await settle(scene.page, 500);
    return scene;
  },
  fire: async (scene) => {
    await scene.context.close();
    const { context, page } = await open(scene.browser, {
      flight: runningFlight,
      stageProgress: true,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    await page.locator('#flightbar').waitFor({ state: 'visible' });
    await page.fill('#fly-folder', FOLDER);
    await page.click('#fly-options-toggle');
    await settle(page);
    await page.fill('#fly-firings', '4');
    await page.fill('#fly-lanes', '2');
    await page.locator('#fly-lanes').blur();
    await page.click('#fly-options-toggle');
    await settle(page, 4000);
    return { browser: scene.browser, context, page };
  },
};

async function healthy() {
  try {
    return (await fetch(`${BASE}/api/health`)).ok;
  } catch {
    return false;
  }
}

/** Reuses a listening fixture, else boots the built one and waits for its health route. */
async function ensureFixture() {
  if (await healthy()) {
    console.log('fixture already listening on', BASE, '(serving whatever build it started with)');
    return { stop() {} };
  }
  if (!existsSync(FIXTURE_SERVER)) {
    throw new Error(`${FIXTURE_SERVER} is missing — run \`pnpm run build\` first`);
  }
  const child = spawn(process.execPath, [FIXTURE_SERVER], { stdio: 'ignore', windowsHide: true });
  const deadline = Date.now() + FIXTURE_BOOT_MS;
  while (!(await healthy())) {
    if (child.exitCode !== null) {
      throw new Error(`fixture server exited with ${child.exitCode} before answering`);
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`fixture server did not answer /api/health within ${FIXTURE_BOOT_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('booted fixture on', BASE, `(pid ${child.pid})`);
  return {
    stop() {
      child.kill();
    },
  };
}

async function record(browser, out) {
  mkdirSync(out, { recursive: true });
  const { context, page } = await open(browser, { viewport: VIEWPORT, deviceScaleFactor: 1 });
  let scene = { browser, context, page };
  const sizes = [];
  try {
    for (const [index, beat] of STORYBOARD.entries()) {
      const action = ACTIONS[beat.id];
      if (!action) throw new Error(`storyboard beat ${beat.id} has no action`);
      scene = await action(scene);
      await settle(scene.page);
      const file = frameFile(index);
      const path = join(out, file);
      await scene.page.screenshot({ path });
      sizes.push({ file, ...pngSize(readFileSync(path)) });
      console.log('wrote', file, `(${beat.id}, hold ${beat.holdMs}ms)`);
    }
  } finally {
    await scene.context.close();
  }
  const size = assertUniformFrames(sizes);
  const manifest = buildManifest(STORYBOARD, size);
  writeFileSync(join(out, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    'wrote',
    MANIFEST,
    `— ${manifest.frames.length} frames, ${manifest.totalMs}ms, ${size.width}×${size.height}`,
  );
  const apng = assembleApng(
    manifest.frames.map((frame) => ({ ...frame, bytes: readFileSync(join(out, frame.file)) })),
  );
  writeFileSync(join(out, ANIMATION), apng);
  console.log('wrote', ANIMATION, `— looping APNG, ${Math.round(apng.length / 1024)} KiB`);
}

async function main() {
  const out = resolve(process.argv[2] || DEFAULT_OUT);
  const require = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
  const { chromium } = require('@playwright/test');
  const fixture = await ensureFixture();
  try {
    const browser = await chromium.launch(
      process.env.AP_CAPTURE_CHANNEL ? { channel: process.env.AP_CAPTURE_CHANNEL } : {},
    );
    try {
      await record(browser, out);
    } finally {
      await browser.close();
    }
  } finally {
    fixture.stop();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
