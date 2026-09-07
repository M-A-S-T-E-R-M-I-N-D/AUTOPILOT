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
 *
 * Raised 164→168KB / 49→50KB: the i18n status-pill slice (board
 * web-msnsndki-dz3vn1) — the fleet card header's project-status badge and
 * the task board's per-task pill, 21 more STRINGS.en keys plus their key
 * maps in `statusPill()` — measured 164.1KB/49.3KB raw/gzip after trimming
 * (the tip key is derived from the label key by the `xxxTip` convention, and
 * the composed aria template reads the pill's own keys rather than carrying
 * them again), 74 bytes over the previous raw line. Every remaining core
 * module is still the unguarded synchronous set described above, so the
 * structural fix — deferring one behind a `typeof` guard — stays the tracked
 * follow-up; this bump buys ~4KB for the next few fleet-card i18n slices.
 *
 * Raised 168→172KB / 50→51KB (2026-09-06): those "next few" slices spent it
 * — the i18n flight-log cost/ago-tips slice (board web-msnsndki-dz3vn1, six
 * STRINGS.en keys plus seven `data-i18n-tip` tags in `shell.ts`) measured
 * 171226 raw / 51197 gzip against 172032 / 51200, i.e. 3 bytes of gzip
 * headroom: still green, but the next core-chunk change of ANY kind (a
 * sibling's one-line fix included) would have gone red on a budget line
 * unrelated to its own work. Every English STRINGS entry lands in core via
 * `localeJs()` regardless of which chunk its surface rides, so each i18n
 * slice costs ~700 raw / ~180 gzip; this bump buys ~4-5 more. The
 * structural fix (VERDICT split web-mtbodv7m-uzhovs) remains the tracked
 * follow-up.
 *
 * Raised 172→176KB / 51→52KB (2026-09-06): the previous bump's 3-byte gzip
 * headroom was exactly as thin as it looked — the LANDING panel's i18n
 * slice (board web-msnsndki-dz3vn1, nine STRINGS.en keys for its persistent
 * on-screen text: title, status lines, debrief labels, the Execute button)
 * measured 175567 raw / 52362 gzip against the old 176128 / 52224 budget,
 * 138 bytes over on gzip alone. This bump leaves ~4.5KB raw / ~0.9KB gzip
 * headroom this time, matching the size of the last few slices rather than
 * cutting it to single digits again. The structural fix (VERDICT split
 * web-mtbodv7m-uzhovs) remains the tracked follow-up.
 *
 * CORE unchanged by the entry below (178307 raw / 53215 gzip, ~1.9KB/33B
 * headroom left — the single new `foundationQrAlt` STRINGS key still lands
 * in core via `localeJs()`, board web-mtq0rsit-ywz1m7's QR slice). The
 * CHUNK budget is the one that moved:
 *
 * Raised CHUNK 100→112KB / 30→34KB (2026-09-07): FOUNDATION 1/3's QR slice
 * embeds a trimmed vendor copy of `qrcode-generator` (MIT,
 * `web/qrcode-lib.ts`) into `foundation.ts`'s panels-chunk module so
 * donation-address rows render a local QR (no third-party service).
 * Trimmed to byte-mode-only + inline-SVG output, panels measured 103403 raw
 * / 31798 gzip against the old 102400 / 30720 budget. Mirror any further
 * change here in scripts/ci/check-bundle-size.mjs.
 */
const CORE_RAW_BUDGET = 176 * 1024;
const CORE_GZIP_BUDGET = 52 * 1024;
const CHUNK_RAW_BUDGET = 112 * 1024;
const CHUNK_GZIP_BUDGET = 34 * 1024;

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
