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
