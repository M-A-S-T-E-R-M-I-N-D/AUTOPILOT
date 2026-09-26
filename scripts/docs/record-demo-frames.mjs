// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Records the README's demo — Lock on · Lucky · Fire — as a numbered PNG frame
 * sequence plus a `frames.json` manifest, from the same staged scene
 * `capture-screens.mjs` shoots its stills from (board web-mtnd3yeq-oyprf0,
 * slice 1/2: the recording half). The encoding half — the animated GIF at the
 * README top — waits on the operator's supply-chain approval of a pure-JS gif
 * encoder devDependency; until then this output IS that encoder's input
 * contract: every frame the same pixel size (asserted before the manifest is
 * written), each with its own hold time, in order.
 *
 * It also assembles the frames into `demo.png`: one looping animated PNG, with
 * no new dependency. APNG (W3C PNG Third Edition, Recommendation 2025-06-24,
 * §11.3.6: acTL · fcTL · fdAT) needs no encoder. Each frame's compressed IDAT
 * stream is carried over byte for byte: frame 0's as the default image, every
 * later one's as an fdAT. The loop is lossless and every current browser plays
 * it wherever a PNG may appear. The operator can watch the real loop before
 * approving the gif encoder, or take the APNG instead of it.
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
import { crc32 } from 'node:zlib';
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

/** One chunk: length, type, data, and the CRC over type + data. */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * What a frame contributes to the loop: its IHDR (which must match frame 0's)
 * and its IDAT chunks' data joined into one compressed stream. Ancillary chunks
 * are dropped; Chromium's screenshots carry none. An indexed-colour frame is
 * refused: it brings its own PLTE, and an APNG has one.
 */
function frameImage(bytes, file) {
  const chunks = readChunks(bytes);
  if (chunks[0]?.type !== 'IHDR') throw new Error(`${file}: IHDR is not the first chunk`);
  if (chunks.some((c) => c.type === 'PLTE')) {
    throw new Error(`${file}: indexed-colour frames (PLTE) cannot share one animation`);
  }
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  if (idat.length === 0) throw new Error(`${file}: no IDAT chunk`);
  return { ihdr: chunks[0].data, data: Buffer.concat(idat) };
}

/** fcTL: the whole canvas, shown `holdMs`, then replaced (not blended) by the next. */
function frameControl(sequence, ihdr, holdMs) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  ihdr.copy(data, 4, 0, 8); // width, height
  // x_offset, y_offset stay 0; dispose_op NONE (0), blend_op SOURCE (0).
  data.writeUInt16BE(holdMs, 20);
  data.writeUInt16BE(1000, 22);
  return pngChunk('fcTL', data);
}

/**
 * The frames, in order, as one APNG. Throws rather than write a loop a browser
 * would misplay: no frames, a hold that is not a whole number of milliseconds
 * in 1..MAX_HOLD_MS, or a frame whose IHDR (size, depth, colour type) differs
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
    return { file, holdMs, ...frameImage(bytes, file) };
  });
  const [first] = images;
  const odd = images.find((image) => !image.ihdr.equals(first.ihdr));
  if (odd) {
    throw new Error(`${odd.file}'s IHDR differs from ${first.file}'s — every frame must match`);
  }
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(images.length, 0);
  animationControl.writeUInt32BE(plays, 4);
  const parts = [PNG_SIGNATURE, pngChunk('IHDR', first.ihdr), pngChunk('acTL', animationControl)];
  let sequence = 0;
  for (const [index, image] of images.entries()) {
    parts.push(frameControl(sequence++, first.ihdr, image.holdMs));
    if (index === 0) {
      parts.push(pngChunk('IDAT', image.data));
    } else {
      const sequenced = Buffer.alloc(4);
      sequenced.writeUInt32BE(sequence++, 0);
      parts.push(pngChunk('fdAT', Buffer.concat([sequenced, image.data])));
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
