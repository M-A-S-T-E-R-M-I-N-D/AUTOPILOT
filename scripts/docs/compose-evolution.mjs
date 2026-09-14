// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Composes `docs/screens/evolution.png` — the same screen, release by
 * release, from the repository's OWN history. Each frame is the
 * `docs/screens/fleet-dark.png` that shipped at that version, read straight
 * out of git (`git show <sha>:<path>`), so the strip cannot drift from what
 * the README actually showed at the time.
 *
 *   node scripts/docs/compose-evolution.mjs
 *
 * Add a row to FRAMES when a release changes the fleet home enough to be
 * worth a column; the caption is written by hand, the image never is.
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const { chromium } = require('@playwright/test');

/** sha → the commit that shipped that frame; caption → what it was then. */
const FRAMES = [
  {
    sha: 'f6a2829f',
    version: 'v0.21.0',
    date: '2026-09-03',
    caption: 'Genesis, public alpha. Totals, tiles and project cards; theme and language as text buttons.',
  },
  {
    sha: 'e1fb2c07',
    version: 'v0.42.0',
    date: '2026-09-12',
    caption: 'The app shell: subjects on a rail, a context rail beside the page, the board as columns, ⌘K.',
  },
  {
    sha: 'HEAD',
    version: 'today',
    date: '',
    caption: 'The fleet home ranked by its one verb: the Fly bar first, an icon cluster, settings and hue.',
  },
];

const PATH = 'docs/screens/fleet-dark.png';
const tmp = mkdtempSync(join(tmpdir(), 'ap-evolution-'));
const frames = FRAMES.map((f) => {
  const png = execFileSync('git', ['show', `${f.sha}:${PATH}`], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  const file = join(tmp, `${f.version}.png`);
  writeFileSync(file, png);
  const version =
    f.version === 'today'
      ? `v${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}`
      : f.version;
  const date =
    f.date ||
    execFileSync('git', ['log', '-1', '--format=%ad', '--date=short'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return { ...f, version, date, data: 'data:image/png;base64,' + png.toString('base64') };
});

const cards = frames
  .map(
    (f) => `
  <figure>
    <img src="${f.data}" alt="">
    <figcaption><b>${f.version}</b><i>${f.date}</i><span>${f.caption}</span></figcaption>
  </figure>`,
  )
  .join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #0b0d12; color: #d7dde6; font: 14px/1.4 Inter, system-ui, sans-serif; }
  main { display: grid; grid-template-columns: repeat(${frames.length}, 460px); gap: 24px; padding: 28px; }
  figure { margin: 0; display: grid; gap: 12px; align-content: start; }
  img { width: 460px; border-radius: 10px; border: 1px solid #262b36; display: block; }
  figcaption { display: grid; gap: 4px; }
  b { font-size: 16px; color: #fff; }
  i { font-style: normal; font-size: 12px; color: #7f8b99; }
  span { font-size: 13px; color: #9fb3c8; }
</style></head><body><main>${cards}</main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1520, height: 900 }, deviceScaleFactor: 1.25 });
await page.setContent(html);
await page.waitForTimeout(400);
const box = await page.locator('main').boundingBox();
const out = join(ROOT, 'docs', 'screens', 'evolution.png');
await page.screenshot({ path: out, clip: box });
console.log('wrote', out, `${Math.round(box.width)}×${Math.round(box.height)}`);
await browser.close();
