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
 *
 * Raised 176→180KB / 52→53KB (2026-09-07): the Flight console panel's i18n
 * slice (board web-msnsndki-dz3vn1 — three STRINGS.en keys, consoleEmpty /
 * consoleCollapsed / consoleUnavailable, relanded after the 07:47 revert
 * burst discarded c9f4d502) measured 53268 gzip against the old 53248
 * budget: 20 bytes over on gzip alone, out of the 33 bytes of headroom the
 * entry above left. The panel itself rides /project.js, but every English
 * STRINGS entry lands in core via `localeJs()` regardless of which chunk its
 * surface is served from. This bump leaves ~5.7KB raw / ~1KB gzip headroom,
 * about five more slices at ~180 gzip each. The structural fix (VERDICT
 * split web-mtbodv7m-uzhovs) remains the tracked follow-up.
 *
 * Raised GZIP ONLY 53→54KB (2026-09-07): the masthead link finishing piece
 * of EPIC 0018 slice 2 (board web-mtq03uzp-hubr6g) — every lane card
 * (`.live-worker` / `.lane-card`) now carries a stable id and the "flying
 * now" chip strip is a real anchor to it (click/Enter smooth-scrolls +
 * focuses same-page, falls through to a real `/p/<id>#lane-...` navigation
 * for a lane on another project's page) — measured 183277 raw / 54362 gzip
 * against the old 184320 / 54272 budget: still under on raw (~1KB headroom
 * intact), 90 bytes over on gzip alone. `renderLiveWorkers`/`liveWorkerCard`/
 * `laneCard`/`laneGridCard` all live in the same unguarded core-chunk set the
 * entries above describe, so this bump is gzip-only rather than the usual
 * paired raise. The structural fix (VERDICT split web-mtbodv7m-uzhovs)
 * remains the tracked follow-up.
 *
 * Raised RAW ONLY 180→184KB (2026-09-07): the search palette's four
 * result-state notes + the project page's two settings-row hints (board
 * web-msnsndki-dz3vn1 — six STRINGS.en keys, `searchPickProject` /
 * `searchSearching` / `searchNoMatches` / `searchFailed` / `startOverHint` /
 * `githubSyncHint`, plus the tr()-at-birth `searchNote()` helper in
 * `web/features/search.ts`, a core module) measured 184050 raw / 54621 gzip
 * against the old 184320 / 55296 budget: still green on both axes, but
 * with 270 bytes of raw headroom — the same single-digit-percent-of-a-slice
 * margin the 172→176KB entry above describes, where the next core-chunk
 * change of ANY kind (a sibling's one-line fix included) would go red on a
 * budget line unrelated to its own work. This bump leaves ~4KB raw; the
 * gzip line keeps its ~0.7KB and is not moved. The structural fix (VERDICT
 * split web-mtbodv7m-uzhovs) remains the tracked follow-up.
 *
 * NOT raised (2026-09-08): the project page's "⇪ Sync to GitHub" button
 * label + its "Make public instead" checkbox text (board web-msnsndki-dz3vn1
 * — two STRINGS.en keys, `githubSync` / `githubSyncPublicLabel`, plus the
 * click handler's busy/idle data-i18n key swap in `shell.ts`) measured
 * 184470 raw / 54757 gzip against the 188416 / 55296 budget the entry above
 * set: ~3.9KB raw and ~0.5KB gzip headroom, no bump needed. Recorded because
 * a checkpoint of this slice briefly raised raw to 188KB by reading the
 * entry above's OLD budget (184320 = 180KB) as the current one — "184KB" is
 * 188416 bytes, not 184320. Compare in bytes, not in the KB label.
 *
 * Raised GZIP ONLY 54→55KB (2026-09-08): the search palette's Ask flow
 * (board web-msnsndki-dz3vn1 — five STRINGS.en keys, `askAsking` /
 * `askPickProject` / `askThinking` / `askThinkingDeep` / `askFailed`, the
 * tr()-at-birth `renderAskNote()` + `setAskLabel()` helpers in
 * `web/features/search.ts`, and the change-only guard on
 * `features/locale.ts`'s [data-i18n] sweep) measured 186011 raw / 55168 gzip
 * against the 188416 / 55296 budget: green on both axes, but with 128 bytes
 * of gzip headroom — the same next-change-of-any-kind-goes-red margin the
 * 172→176KB and 180→184KB entries above describe, this time on the gzip
 * line. This bump leaves ~1.1KB gzip; the raw line keeps its ~2.3KB and is
 * not moved. The structural fix (VERDICT split web-mtbodv7m-uzhovs) remains
 * the tracked follow-up.
 *
 * Raised RAW ONLY 184→185KB (2026-09-08): the live worker card's
 * fixation-warning chip's i18n slice (board web-msnsndki-dz3vn1 — four
 * STRINGS.en keys, `orientFixationTipSingular` / `orientFixationTipPlural` /
 * `orientFixationAriaSingular` / `orientFixationAriaPlural`, plus the
 * template-key-by-turnsSeen tagging in `shell.ts`'s `liveWorkerCard()`)
 * measured 188634 raw / 55764 gzip against the 188416 / 56320 budget: 218
 * bytes over on raw alone, ~556 bytes of gzip headroom untouched. This bump
 * leaves ~806 bytes raw; the gzip line is not moved. The structural fix
 * (VERDICT split web-mtbodv7m-uzhovs) remains the tracked follow-up.
 */
// Raised with the script (2026-09-09) to reland the Hebrew report-menu
// toolkit — see check-bundle-size.mjs for the full reasoning.
// Raised with the script (2026-09-09) for the shared socialIdentity()
// resolver — a relocation, not growth: combined bundle is unchanged.
// Raised RAW ONLY 184→188KB (2026-09-09): the report-menu copy toolkit's
// i18n slice (board web-msnsndki-dz3vn1 — seven STRINGS.en keys, the five
// copy-item label/tip pairs plus the ✓/✗ `reportMenuCopy` result flash,
// `report-menu.ts`) measured 188924 raw / 55905 gzip against the 188416 /
// 56320 budget: 508 bytes over on raw alone, gzip still ~400 bytes under.
// `report-menu.ts` is a core module (the context menu paints on every page),
// so its English + Hebrew STRINGS entries land in core via `localeJs()` like
// every prior i18n slice here. This bump leaves ~3.5KB raw; the gzip line
// keeps its headroom and is not moved. The structural fix (VERDICT split
// web-mtbodv7m-uzhovs) remains the tracked follow-up.
// Raised RAW ONLY 188→189KB (2026-09-11): the MIRROR PASS panel's EXECUTE
// button i18n slice (board web-msnsndki-dz3vn1 — five STRINGS.en keys,
// `mirrorPassExecute` (its data-i18n tag had shipped with no key behind it),
// `mirrorPassExecuteTip`, `mirrorPassExecuteConfirm`, `mirrorPassExecuting`,
// `mirrorPassRequestFailed`) measured 192866 raw / 56956 gzip against the
// 192512 / 57344 budget: 354 bytes over on raw alone, gzip still ~390 bytes
// under. The panel rides /project.js, but every English key lands in core
// via `localeJs()`'s STRINGS.en splice, like every prior i18n slice here.
// Panels (the Hebrew twins, via locale-data.ts) measured 129557 / 39557
// against 130048 / 39936 and is not moved. Mirrored in
// scripts/ci/check-bundle-size.mjs.
/**
 * Then core raw 189→190KB (2026-09-12) for EPIC 0021 slices 7+8: thirteen
 * English strings for the command palette and focus mode — measured 189.4KB.
 */
/**
 * Then core gzip 56→57KB (2026-09-12) for EPIC 0021 slices 3+4 (first cuts):
 * five English strings for the plan canvas and the Keeper count — 56.1KB.
 */
/**
 * Then core raw 190→191KB (2026-09-12) for the Ask panel's low-confidence
 * escalation offer (a fleet lane's checkpointed-then-completed unit) —
 * measured 190.4KB at landing.
 */
/**
 * Then core raw 191→192KB (2026-09-12) for EPIC 0021 slice 6: the context
 * rail's two English strings — measured 191.0KB, 19 bytes over the old line.
 */
// Then core raw 192→193KB (2026-09-12) for EPIC 0021 slice 3 (second cut): the
// flight plan editor's fourteen English strings — measured 192.2KB.
const CORE_RAW_BUDGET = 193 * 1024;
const CORE_GZIP_BUDGET = 57 * 1024;
// raw-only 112→116KB (2026-09-09): the third maintainer verb (re-run failed
// checks) closed the panel's last dead end. Tripwire paid three times first —
// prose pass (-466B), one shared click-handler wiring, and prPanelButton()
// replacing four verbatim button blocks (-400B). Deferred chunk, never blocks
// first paint; core budgets untouched.
// Raised with the script (2026-09-09) for the standing panel's role
// gating — see check-bundle-size.mjs for the reasoning.
// Raised with the script (2026-09-09) for this round's landed UI.
// Raised with the script (2026-09-10) for the recovered
// contributor-issue-list panel.
// Raised panels raw 122→123KB / gzip 37→38KB (2026-09-10): the LANDING
// panel's branch-line i18n slice (board web-msnsndki-dz3vn1 — six STRINGS
// keys, `landingBranchTip`/`landingBranchAria`, `landingBranchArrowTip`/
// `landingBranchArrowAria`, `landingBaseTip`/`landingBaseAria`, plus the
// tr()-at-build + sweep tags on the three branch-line fields in
// `web/features/landing.ts`). The panel's own code rides /project.js (huge
// headroom there), but its six STRINGS.he translations land in panels.js via
// locale-data.ts — the same shape the MIRROR PASS entry below describes.
// Measured 124884 raw / 37932 gzip against the old 124928 / 37888 budget: 44
// bytes over on gzip, and 44 bytes UNDER on raw — the next-change-of-any-
// kind-goes-red margin the core entries above describe — so both lines move.
// Core measured 191852 / 56682 against 192512 / 57344 (~660B headroom each
// way, about one more slice) and is not moved. Mirrored in
// scripts/ci/check-bundle-size.mjs.
/**
 * Then raw 123→127KB / gzip 38→39KB (2026-09-11) for EPIC 0021 slice 2: the
 * app shell's subject-nav client (web/features/subject-nav.ts) rides this
 * deferred chunk by design — it self-initializes and nothing in core calls
 * it — measured 125.8KB/38.4KB after landing, 2.8KB/0.4KB over the old line.
 */
/**
 * Then raw 127→128KB (2026-09-12) for EPIC 0021 slice 5: the subject nav
 * reads its subject set from the page's links, scans main#fleet's sections
 * on a project page and marks inactive ones — measured 127.4KB raw.
 */
/**
 * Then raw 128→133KB / gzip 39→41KB (2026-09-12) for EPIC 0021 slices 7+8:
 * the command palette and focus mode join the shell's deferred client —
 * measured 132.7KB/40.1KB.
 */
/**
 * Then raw 133→135KB (2026-09-12) for EPIC 0021 slice 4 (first cut): the
 * Keeper place's live "waiting on you" count — measured 134.0KB raw.
 */
/**
 * Then raw 135→137KB (2026-09-12) for EPIC 0021 slice 6: the context rail's
 * client (sections in and out of the aside at xl) — measured 136.6KB raw.
 */
/**
 * Then raw 137→144KB (2026-09-12) for EPIC 0021 slice 4: the Keeper queue (a view
 * over the panels with keyboard exit actions) — measured 142.6KB raw.
 */
/**
 * Then raw 144→145KB (2026-09-12) for EPIC 0020 slice 8: the 🔧 Diagnose
 * button — the fourth maintainer verb, reading `GET /api/pr-review/diagnose`
 * and rendering its flake/defect/unknown verdict. Paid the tripwire first:
 * folded the repeated disable/restore/render-result logic across every
 * maintainer-verb click handler (execute, merge, re-run, update-branch, and
 * this one) into two shared helpers, generalized `wirePrMaintainerAction` to
 * cover a confirm-free GET as well as its three POST call sites, and
 * shortened the button's own tooltip — brought a 824B overage down to 81B.
 * Measured 144.1KB raw against the old 144KB budget; gzip (43.4KB) stays
 * comfortably under CHUNK_GZIP_BUDGET, untouched.
 */
const CHUNK_RAW_BUDGET = 145 * 1024;
// gzip-only 34→35KB (2026-09-09), EPIC 0020 slices 1+2: PR pipeline strip +
// maintainer merge/update-branch buttons. Paid the tripwire twice first — a
// prose pass (-466B raw) and a DRY fold of the two identical maintainer-verb
// click handlers — which brought RAW back under 112KB on its own. Gzip
// measured 35068B against 34816B; the residue is unique prose that gzip
// cannot compress away. Core budgets untouched.
// gzip-only 35→36KB (2026-09-09), CONTRIBUTOR JOURNEY (board web-mtt3hery-
// l8v0lf): the contributor-standing panel client — a deferred-chunk feature
// module (chunks.ts's DEFERRED_OPERATOR_FEATURES), same shape publicity.ts/
// tour.ts already establish — added ~95B gzip on top of the EPIC 0020
// baseline. Panels.js raw stays well under CHUNK_RAW_BUDGET (117709B against
// 118784B); this is a gzip-only bump. Core budgets untouched.
// raw-only 117→118KB (2026-09-09), MIRROR PASS panel (EPIC 0019 S3, VERDICT
// ap-mtsg3nc0-3 slice (c)): the panel client itself rides /project.js (huge
// headroom there), but its four STRINGS.he translations land in panels.js
// via locale-data.ts regardless of which chunk the panel's own code is
// served from — the same "every locale key costs the deferred chunk, not
// just the surface's own chunk" shape the core-chunk entries above describe
// for English keys. Measured 119958B raw against the old 119808B budget: 150
// bytes over on raw alone, gzip (36160B against 36864B) untouched. Core
// budgets untouched.
// gzip 37→38KB (2026-09-10): see the branch-line i18n entry above
// CHUNK_RAW_BUDGET — 37932B measured against 37888B.
// Then gzip 41→42KB (2026-09-12) for EPIC 0021 slice 6 (the context rail client) — measured 41.2KB gzip.
// Then gzip 42→43KB (2026-09-12) for EPIC 0021 slice 4 (the Keeper queue) — measured 42.9KB gzip.
// Then gzip 43→44KB (2026-09-12) for EPIC 0021 slice 3 (second cut): the flight
// plan editor — measured 43.1KB gzip.
const CHUNK_GZIP_BUDGET = 44 * 1024;

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
