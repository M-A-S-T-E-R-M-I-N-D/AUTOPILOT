// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Composes `docs/screens/evolution.png` — the same screen, release by
 * release, from the repository's OWN history. A frame is either the
 * `docs/screens/fleet-dark.png` that shipped at that version, read straight
 * out of git (`git show <sha>:<path>`), or a committed frame for an era that
 * predates those files — so the strip cannot drift from what was true at the time.
 *
 * The first column predates the public repository. Its frame was taken by
 * checking the MYTH backup tag out into a worktree, installing and building
 * it, seeding its own demo store and running its server on a spare port:
 *
 *   git worktree add --detach /tmp/ap-v010 autopilot/myth
 *   cd /tmp/ap-v010 && HUSKY=0 pnpm install --frozen-lockfile && pnpm run build
 *   AUTOPILOT_DB=/tmp/ap-v010/.autopilot/demo.db node apps/dashboard/dist/demo.js
 *   AUTOPILOT_DB=… AUTOPILOT_DASHBOARD_PORT=4399 AUTOPILOT_NO_OPEN=1 \
 *     node apps/dashboard/dist/server/main.js
 *
 * …then screenshotting 127.0.0.1:4399 at 1440×1030 @2×, dark. The result is
 * committed as `docs/screens/evolution-v0.10.0.png` because rebuilding a
 * two-month-old tree on every run is not a doc generator's job.
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
    file: 'docs/screens/evolution-v0.10.0.png',
    version: 'v0.10.0',
    date: '2026-07-11',
    caption:
      'Before the public repository — the read-only dashboard, taken from the MYTH backup tag. Totals all zero, one Firings field, three themes as words.',
  },
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
  const png = f.file
    ? readFileSync(join(ROOT, f.file))
    : execFileSync('git', ['show', `${f.sha}:${PATH}`], {
        windowsHide: true,
        cwd: ROOT,
        maxBuffer: 64 * 1024 * 1024,
        encoding: 'buffer',
      });
  writeFileSync(join(tmp, `${f.version}.png`), png);
  const version =
    f.version === 'today'
      ? `v${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version}`
      : f.version;
  const date =
    f.date ||
    execFileSync('git', ['log', '-1', '--format=%ad', '--date=short'], { windowsHide: true, cwd: ROOT, encoding: 'utf8' }).trim();
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
  main { display: grid; grid-template-columns: repeat(${frames.length}, 380px); gap: 20px; padding: 24px; }
  figure { margin: 0; display: grid; gap: 12px; align-content: start; }
  img { width: 380px; border-radius: 10px; border: 1px solid #262b36; display: block; }
  figcaption { display: grid; gap: 4px; }
  b { font-size: 16px; color: #fff; }
  i { font-style: normal; font-size: 12px; color: #7f8b99; }
  span { font-size: 13px; color: #9fb3c8; }
</style></head><body><main>${cards}</main></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1648, height: 900 }, deviceScaleFactor: 1.25 });
await page.setContent(html);
await page.waitForTimeout(400);
const box = await page.locator('main').boundingBox();
const out = join(ROOT, 'docs', 'screens', 'evolution.png');
await page.screenshot({ path: out, clip: box });
console.log('wrote', out, `${Math.round(box.width)}×${Math.round(box.height)}`);
await browser.close();
