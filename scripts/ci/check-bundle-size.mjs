// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * check-bundle-size — budget gate for the dashboard's served client scripts.
 *
 * Since the code split (epic 0002 slice 2 / BUNDLE DIET, web/chunks.ts) the
 * client ships as three chunks: `/app.js` (core, every page — THE
 * first-load, render-blocking payload the landing-page budget governs),
 * `/project.js` (renderProjectPage panels, `/p/<id>` pages only, defer) and
 * `/panels.js` (self-init operator panels, every page, defer). The strict
 * 150/45 budget applies to the core chunk, because it is the only
 * render-blocking script; the deferred chunks get their own looser budget so
 * runaway growth still fails loudly, and the combined total is printed for
 * the record. Requires `pnpm run build` first — reads the compiled dist
 * output, the same code path the server serves.
 */
import { gzipSync } from 'node:zlib';

// Baseline after the esbuild minify pass was ~103KB raw / ~30KB gzip for the
// whole client before the split; the budgets leave real headroom for growth
// while still catching runaway bloat (e.g. an accidental vendor script
// pasted into a template).
//
// Raised 150→160KB / 45→48KB (2026-08-29), then 160→164KB / 48→49KB for the
// i18n foundation's fly-bar slice, then 164→168KB / 49→50KB for its
// status-pill slice, then 168→172KB / 50→51KB for its flight-log
// cost/ago-tips slice, then 172→176KB / 51→52KB (2026-09-06) for its LANDING
// panel slice, then 176→180KB / 52→53KB (2026-09-07) for its Flight console
// panel slice (all board web-msnsndki-dz3vn1), then gzip-only 53→54KB
// (2026-09-07) for EPIC 0018 slice 2's masthead link finishing piece (board
// web-mtq03uzp-hubr6g) — see the matching comment in
// apps/dashboard/test/server/client-bundle-size-budget.test.ts for the
// measured sizes behind each bump.
const CORE_RAW_BUDGET = 180 * 1024;
const CORE_GZIP_BUDGET = 54 * 1024;
// Deferred chunks never block first paint — the budget exists so they cannot
// silently become a second monolith. Measured at introduction (2026-08-28):
// project ~44KB, panels ~19KB raw.
//
// Raised 100→112KB / 30→34KB (2026-09-07): FOUNDATION 1/3's QR slice
// (board web-mtq0rsit-ywz1m7) embeds a trimmed vendor copy of
// `qrcode-generator` (MIT, `web/qrcode-lib.ts`) into `foundation.ts` so the
// masthead's donation-address rows render a local QR — no third-party QR
// service, matching docs/FOUNDATION.md's custody stance. Trimming to
// byte-mode-only + inline-SVG output (no GIF/raster exporters, no
// Numeric/Alphanumeric/Kanji modes) still measured 103.4KB/31.8KB, over the
// old 100/30 budget on both axes — see the matching comment in
// apps/dashboard/test/server/client-bundle-size-budget.test.ts for the exact
// numbers and `apps/dashboard/test/web/qrcode-lib.test.ts` for the
// upstream-equivalence proof the trim didn't change behavior.
const CHUNK_RAW_BUDGET = 112 * 1024;
const CHUNK_GZIP_BUDGET = 34 * 1024;

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function measure(name, js, rawBudget, gzipBudget, errors) {
  const rawBytes = Buffer.byteLength(js, 'utf8');
  const gzipBytes = gzipSync(js).length;
  if (rawBytes > rawBudget) {
    errors.push(`${name} raw ${formatKb(rawBytes)} exceeds budget ${formatKb(rawBudget)}`);
  }
  if (gzipBytes > gzipBudget) {
    errors.push(`${name} gzip ${formatKb(gzipBytes)} exceeds budget ${formatKb(gzipBudget)}`);
  }
  console.log(
    `${name}: ${formatKb(rawBytes)} raw (budget ${formatKb(rawBudget)}), ` +
      `${formatKb(gzipBytes)} gzip (budget ${formatKb(gzipBudget)})`,
  );
  return rawBytes;
}

async function main() {
  let bundleModule;
  try {
    bundleModule = await import('../../apps/dashboard/dist/server/client-bundle.js');
  } catch {
    console.error(
      'check-bundle-size FAILED: apps/dashboard/dist/server/client-bundle.js not found — run `pnpm run build` first',
    );
    process.exit(1);
    return;
  }

  const errors = [];
  const core = measure(
    '/app.js (core)',
    bundleModule.minifiedCoreJs(),
    CORE_RAW_BUDGET,
    CORE_GZIP_BUDGET,
    errors,
  );
  const project = measure(
    '/project.js',
    bundleModule.minifiedProjectJs(),
    CHUNK_RAW_BUDGET,
    CHUNK_GZIP_BUDGET,
    errors,
  );
  const panels = measure(
    '/panels.js',
    bundleModule.minifiedPanelsJs(),
    CHUNK_RAW_BUDGET,
    CHUNK_GZIP_BUDGET,
    errors,
  );
  console.log(`combined: ${formatKb(core + project + panels)} raw across the three chunks`);

  if (errors.length > 0) {
    console.error(`check-bundle-size FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log('check-bundle-size OK');
}

main();
