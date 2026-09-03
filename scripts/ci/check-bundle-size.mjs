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
// i18n foundation's fly-bar slice (board web-msnsndki-dz3vn1) — see the
// matching comment in apps/dashboard/test/server/client-bundle-size-budget.test.ts
// for the measured sizes behind each bump.
const CORE_RAW_BUDGET = 164 * 1024;
const CORE_GZIP_BUDGET = 49 * 1024;
// Deferred chunks never block first paint — the budget exists so they cannot
// silently become a second monolith. Measured at introduction (2026-08-28):
// project ~44KB, panels ~19KB raw.
const CHUNK_RAW_BUDGET = 100 * 1024;
const CHUNK_GZIP_BUDGET = 30 * 1024;

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
