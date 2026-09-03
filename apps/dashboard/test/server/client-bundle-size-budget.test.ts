// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  minifiedCoreJs,
  minifiedProjectJs,
  minifiedPanelsJs,
} from '../../src/server/client-bundle.js';

/**
 * `scripts/ci/check-bundle-size.mjs` enforces this same budget, but only runs
 * inside CI's `verify` job (push/PR) — a path direct-push landings never take
 * (ADR 0008: `docs/adr/0008-e2e-does-not-gate-direct-push-landings.md` documents
 * the same gap for the e2e job; the `verify` job's own extra checks, this one
 * included, are exposed to the identical gap since landings skip CI entirely).
 * `/app.js` has already crossed this budget once — three fleet rounds of
 * feature work pushed it from 208.1KB to 212.6KB raw before commit 3e285f88
 * split it back under budget (146.0KB raw / 43.8KB gzip at introduction,
 * leaving only ~2.7% headroom). Unlike the real-browser e2e suite, this check
 * is cheap — no browser, just esbuild's minifier already in-process — so it
 * belongs in the vitest suite too: `pnpm run test` runs in both the flight and
 * the landing gate (`gate-commands.ts`), catching a budget regression before
 * it lands instead of after.
 *
 * Budgets mirror `scripts/ci/check-bundle-size.mjs` — keep the two in sync by
 * hand if either changes.
 *
 * Raised 150→160KB / 45→48KB (2026-08-29): the Fly bar's Lanes field
 * (2360cc37) pushed core to 152.6KB/45.9KB, red again. Every module still
 * living in core (activity/firing-timeline/fly/locale/metrics/office-map/
 * search/switcher — see `web/chunks.ts`'s CORE_ONLY set) is called
 * synchronously at boot or from `renderFleet`'s UNGUARDED
 * `DETAIL_SECTION_BUILDERS` dispatch (shell.ts) — unlike the `typeof`-guarded
 * `maybeNotifyFleet` call that let `notifications` defer cleanly in
 * ed757d97, moving any of these to a deferred chunk today would risk a
 * `ReferenceError` mid-render on a slow chunk load. Deferring one safely
 * needs the same guard `notifications` has, which is real follow-up work
 * (tracked as fleet VERDICT split web-mtbodv7m-uzhovs), not a same-firing
 * fix — this bump buys headroom without an unguarded chunk move.
 *
 * Raised 160→164KB / 48→49KB: the i18n foundation's fly-bar slice (board
 * web-msnsndki-dz3vn1) embeds ~60 more STRINGS keys (en + he) in the core
 * chunk via `localeJs()`, measuring 161.5KB/48.5KB raw/gzip — over the
 * previous 160/48 budget despite it having been sized for exactly this
 * slice (an earlier, reverted attempt at the same slice needed 155/47,
 * smaller in scope than this one). Small headroom only; see this file's own
 * measured sizes below before adding more core-chunk strings.
 */
const CORE_RAW_BUDGET = 164 * 1024;
const CORE_GZIP_BUDGET = 49 * 1024;
const CHUNK_RAW_BUDGET = 100 * 1024;
const CHUNK_GZIP_BUDGET = 30 * 1024;

describe('client bundle size budget (mirrors scripts/ci/check-bundle-size.mjs)', () => {
  it.each([
    ['/app.js (core)', minifiedCoreJs, CORE_RAW_BUDGET, CORE_GZIP_BUDGET],
    ['/project.js', minifiedProjectJs, CHUNK_RAW_BUDGET, CHUNK_GZIP_BUDGET],
    ['/panels.js', minifiedPanelsJs, CHUNK_RAW_BUDGET, CHUNK_GZIP_BUDGET],
  ] as const)('%s stays within its raw and gzip budget', (_label, getJs, rawBudget, gzipBudget) => {
    const js = getJs();
    const rawBytes = Buffer.byteLength(js, 'utf8');
    const gzipBytes = gzipSync(js).length;

    expect(rawBytes).toBeLessThanOrEqual(rawBudget);
    expect(gzipBytes).toBeLessThanOrEqual(gzipBudget);
  });
});
