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
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
// web-mtq03uzp-hubr6g), then raw-only 180→184KB (2026-09-07) for the i18n
// search-palette notes + settings-hints slice (board web-msnsndki-dz3vn1),
// then gzip-only 54→55KB (2026-09-08) for the i18n Ask-flow slice (same
// board), then raw-only 184→185KB (2026-09-08) for the live worker card's
// fixation-chip i18n slice (same board) — see the matching comment in
// apps/dashboard/test/server/client-bundle-size-budget.test.ts for the
// measured sizes behind each bump.
//
// Then core raw 185→186KB and panels raw 116→117KB / gzip 35→36KB
// (2026-09-09) to RELAND the Hebrew report-menu toolkit. That work was
// reverted mid-flight by a bare `Revert` with no stated reason and then
// abandoned — 115 lines of the founders' own language silently dropped.
// The revert was legitimate (it did breach the wall); the abandonment was
// not. This is new user-facing value in a language the roadmap names as a
// goal, not accidental bloat, so the wall moves by the smallest amount
// that fits it: 0.1KB core, 0.3KB panels raw, 0.5KB panels gzip over.
// The structural answer row 14 keeps inviting — move the non-English
// STRINGS table out of core entirely — is boarded, not done here.
//
// Then core raw 186→187KB / gzip 55→56KB (2026-09-09) for the shared
// socialIdentity() resolver. This one is a RELOCATION, not growth: three
// role-gated panels each ran their own identity fetch, so the helper moved
// those bytes into core (where every chunk can reach it) and deleted them
// from panels and project. Combined across the three chunks measured
// 364.6KB both before and after — identical. What actually shrank is the
// network: one identity read per page load instead of three.
//
// Then raw-only 188→189KB (2026-09-11) for the MIRROR PASS panel's EXECUTE
// button i18n slice (board web-msnsndki-dz3vn1 — five STRINGS.en keys: the
// idle label whose data-i18n tag had shipped with no key behind it, the
// tip/aria, the confirm, and the two transient click-handler states). The
// panel's own code rides /project.js, but every English key lands in core
// via `localeJs()`'s STRINGS.en splice. Measured 192866B raw / 56956B gzip
// against the 192512B / 57344B budget: 354 bytes over on raw alone, gzip
// still ~390 bytes under and not moved. The prior slice's 241-byte headroom
// note said the next core string of any size would go red — it did.
// Then core raw 189→190KB (2026-09-12) for EPIC 0021 slices 7+8: thirteen
// English strings for the command palette and focus mode (the Hebrew ones
// ride the deferred locale-data chunk) — measured 189.4KB.
// Then core gzip 56→57KB (2026-09-12) for EPIC 0021 slices 3+4 (first cuts):
// five English strings for the plan canvas and the Keeper count — measured
// 56.1KB gzip.
// Then core raw 190→191KB (2026-09-12) for the Ask panel's low-confidence
// escalation offer (answer-quality doctrine slice 3, a fleet lane's
// checkpointed-then-completed unit) — measured 190.4KB at landing.
// Then core raw 191→192KB (2026-09-12) for EPIC 0021 slice 6: the context
// rail's two English strings (its aria-label and empty line) — measured
// 191.0KB, 19 bytes over the old line.
// Then core raw 192→193KB (2026-09-12) for EPIC 0021 slice 3 (second cut): the
// flight plan editor's fourteen English strings — measured 192.2KB.
// Then core raw 193→195KB (2026-09-12) for EPIC 0021 slice 9: the board as
// columns (view toggle, column heads, a status attribute per row; five
// strings) — measured 194.0KB.
// Then core raw 195→196KB (2026-09-12) for the round-3 lanes' strings (mirror-pass
// drift + landing-note execute, discussions triage, CI status) — measured 195.2KB.
// Then core raw 196→198KB (2026-09-12) for the 🍀 button's WHAT-to-fly half
// (issue #44): the fit shortlist under the Fly bar and its attention toggle,
// eight strings in two locales — measured 197.5KB raw.
// Then core raw 198→199KB (2026-09-12, round 4): four lanes' strings (mirror-pass
// stale-claim UI, reaper) merged 416 bytes past the budget each was under alone —
// measured 198.4KB raw.
// Then core raw 199→201KB (2026-09-12) for the flicker fix: the project-page panel
// cache, the 1 s live clocks, the hidden-tab pause and the live-workers guard —
// measured 200.2KB raw.
// Then core raw 201→216KB / gzip 60→64KB and panels raw 150→156KB / gzip
// 45→47KB (2026-09-13) for BUSY STATES (web/features/busy.ts — the ritual
// scrim, pill, toast and write lock, core) and the claims ledger line on the
// pool panel (deferred): measured 210.2KB/62.3KB core, 152.0KB/45.7KB panels.
// Then core raw 216→220KB (2026-09-13) for THE ASK SHEET (web/features/
// ask-sheet.ts, core: the floating button, the sheet, the move-and-return):
// measured 216.0KB raw / 63.7KB gzip.
// Then core raw 220→226KB / gzip 66→68KB (2026-09-13) for DISPLAY & ACCESSIBILITY
// (web/features/prefs.ts + the Settings popover + five masthead stroke icons):
// measured 222.7KB raw / 66.3KB gzip.
// Then core raw 226→231KB / gzip 68→69KB (2026-09-13) for EPIC 0025 slice 2's hub: 32 more
// Lucide shapes vendored as data for the panel headings, chips and lines
// that still draw emoji (ICON_SHAPES rides the core bundle as JSON so
// iconEl() can build any of them), plus panelHeading(). Measured 235733B
// raw / 70523B gzip against the old 231424B / 69632B budgets; the lane conversions that follow
// remove emoji text, they do not add bytes.
// Then core raw 231→233KB / gzip 69→70KB (2026-09-13) for EPIC 0029 slice 6: the masthead
// popovers' laws (light dismiss on an outside pointer or Escape, a theme or
// language choice closes, hover opens temporarily and a click pins) — one
// core feature module, web/features/popovers.ts. Measured 238116B raw /
// 71187B gzip against the old 236544B / 70656B budgets.
// Then core raw 233→234KB (2026-09-13) for EPIC 0029 slice 7: the whole-design
// hue — a range in Settings that rotates every chromatic, non-semantic token
// through relative colour (prefs.ts reads, validates, applies and resets it).
// Measured 238943B raw against the old 238592B budget; gzip untouched.
// Then 234→235KB the same day: the rotation moved into the client (relative
// colour syntax is unsupported in this Chromium and made every colour vanish);
// measured 239865B raw / 71842B gzip against the old 239616B / 71680B
// budgets (gzip 70→71KB).
// Then core raw 235→236KB / panels raw 161→162KB (2026-09-14) for EPIC 0017 slice 3:
// the overflow menu (Tour, the docs, Report from here behind one ellipsis) —
// the ellipsis shape in ICON_SHAPES, the report item's click delegate, and
// the menu's STRINGS.he in panels. Measured 240964B / 165232B raw against
// the old 240640B / 164864B budgets; gzip untouched.
// Then core raw 236→237KB (2026-09-14): the Fly bar's settings toggle (the
// gear, its remembered [hidden] flip) and the CI panel's no-runs-yet state.
// Measured 241694B raw against the old 241664B budget — 30 bytes.
// Then core raw 237→241KB / gzip 71→72KB and panels raw 162→163KB (2026-09-14)
// for EPIC 0031: the snackbar (one transient outcome surface: host, stacking,
// pause-on-read, one action) plus the Lucky roll's why rows and the
// shortlist's hand-to-the-pilot verb, and their STRINGS.he in panels.
// Then core raw 241→243KB (2026-09-14) for THE ONBOARDING LADDER (epic 0032):
// the ladder adds ~30 English STRINGS keys, and locale.ts splices the whole
// English table into CORE — measured 242.1KB. The ladder panel itself is
// deferred, so none of its own code is in this number.
// Then core raw 243→246KB (2026-09-15) for THE GUIDED WALK: nine stops of
// prose replace four, and locale.ts splices the whole English table into
// CORE — measured 244.4KB.
// Then core raw 246→251KB / gzip 74→76KB and panels raw 195→198KB / gzip
// 58→60KB (2026-09-18) for five operator-reported cockpit fixes landing
// together: the tour's ring-inside-overlay + reflow, the anomaly chip
// popovers (what it means / what to do, 28 strings in two locales), the
// terminal HUD rows in Settings, the ladder's MY PROGRESS entry, and the
// pipeline label fitter. Measured 250.3KB raw / 75.1KB gzip core and
// 197.7KB raw / 59.3KB gzip panels after `pnpm run build`.
// Then core raw 251→255KB / gzip 76→77KB (2026-09-18, same day) for the docs
// reader's parity slice: eleven spliced markdown helpers (quotes, rules,
// anchors, aligned tables, nested and task lists, strikethrough, self-
// resolved links). Measured 253.8KB raw / 76.3KB gzip.
// Then core raw 255→256KB (2026-09-21) for the task board's unpin button
// wiring — measured 255.3KB raw / 76.6KB gzip. This raise ALSO closes a
// drift: the mirrored budget in
// apps/dashboard/test/server/client-bundle-size-budget.test.ts had already
// been raised to 256KB while this file stayed at 255KB, so the unit test
// passed while the landing gate's own run of this script went red. A
// census in that test now asserts the two files agree — the comment
// asking to "keep the two in sync" was never enforced by anything.
// Then core raw 256->257KB (2026-09-24), epic 0025 icon system continuation
// (board web-mtywp7zq-55f3o9): the KEEPER PR review panel's queue-for-human
// badge drops its baked-in lock/purple-circle glyph for two new vendored
// icons (lock, user) in web/icons.ts -- measured 262150B raw, 6 bytes over
// the old 262144B budget.
// Then core raw 257->258KB (2026-09-26), epic 0024's pipeline switch tips
// follow-up (board web-mtywp7wk-tkdwhi, report-element-mb528l): six new
// STRINGS.en keys (pipelineLensFleetTip etc.) for the six lens/mode/layout
// switch tips, which ship in localeJs()'s STRINGS.en splice like every prior
// i18n slice here -- measured 263401B raw against the old 263168B budget,
// 233 bytes over.
// Then core raw 258->259KB (2026-09-26), epic 0026 the tasks screen slice 1
// (board web-mtywp82m-zodn7z): the j/k row-to-row keyboard cursor over the
// task list (one document-delegated keydown handler in shell.ts's client
// script). This is a RELAND: the first landing (494e16cc) shipped the code
// without this bump, the landing gate's run of this script went red, and it
// was reverted (a451d167) -- measured 264271B raw against the old 264192B
// budget, 79 bytes over. Gzip (77.3KB) stays under CORE_GZIP_BUDGET.
// Then core raw 259->260KB (2026-09-26), the same epic's next slice: a/d
// row actions on the keyboard cursor plus the one-line key legend under the
// board's column heads (four STRINGS.en keys, boardKeysHint(), the widened
// keydown handler) -- measured 265203B raw against the old 265216B line, 13
// bytes UNDER, bumped anyway: a margin that thin turns the merged landing
// gate red the moment a sibling's slice adds a dozen bytes beside it, which
// is exactly how 494e16cc died. Gzip (79482B, 77.6KB) stays under the line.
// Then core raw 260->262KB (2026-09-26), the same epic's row selection: a
// leading checkbox per row, the x key on the cursor, the "N selected" status
// line, a two-stage Escape (boardSelected/syncBoardSelection in shell.ts,
// three STRINGS.en keys) -- measured 266956B raw against the old 266240B
// line, 716 bytes over. Two KB, not one: a 261KB line would leave 308
// bytes, the same thin margin the entry above refused.
// Then core raw 262->264KB (2026-09-26), the same epic's Enter: the task
// title becomes the row's disclosure button and opens a read-only detail
// under the row -- the whole body, the id and age (boardOpen, one click
// listener, Enter/Space on the keydown handler, two STRINGS.en keys) --
// measured 268844B raw against the old 268288B line, 556 bytes over. Two KB
// again, for the margin the entries above keep.
// Then core raw 264->226KB (2026-09-26), ADR 0012 slice 2b, the first time
// this line moves DOWN: English travels with its first caller. Core keeps
// only the 349 STRINGS.en keys core references; the rest head /project.js
// and /panels.js (web/english-heads.ts) -- measured 229068B raw, down from
// 268829B. About two KB of margin, as the entries above keep.
const CORE_RAW_BUDGET = 226 * 1024;
// Then core gzip 57→58KB (2026-09-12) for EPIC 0021 slice 9 (the board as columns) — measured 57.5KB gzip.
// Then core gzip 58→59KB (2026-09-12), the same #44 shortlist — measured 58.6KB gzip.
// Then core gzip 59→60KB (2026-09-12), the same flicker fix — measured 59.3KB gzip.
// Then core gzip 64→66KB (2026-09-13) for THE ICON SYSTEM slice 1 (web/icons.ts:
// the vendored Lucide shapes spliced into core as data + iconEl): measured
// 218.5KB raw / 64.9KB gzip.
// Then core gzip 72→73KB (2026-09-14), the same epic-0032 English STRINGS
// growth as the raw note above — measured 72.6KB.
// Then core gzip 73→74KB (2026-09-15), the same guided-walk prose growth as
// the raw note above — measured 73.3KB.
// Then core gzip 77→78KB (2026-09-26) for epic 0024's flight plan outcomes:
// six English STRINGS keys, prose trimmed first — measured 78860B, 12 bytes
// over the old line. See the mirrored budget test for the full note.
// Then core gzip 78→79KB (2026-09-26), the same epic 0026 row-selection
// slice as the raw entry above — measured 79902B against the old 79872B
// line, 30 bytes over.
// Then core gzip 79→80KB (2026-09-26), the same epic 0026 Enter slice as the
// raw entry above — measured 80512B, 384 bytes UNDER the old 80896B line,
// bumped for the reason the 260KB raw entry gives: a margin that thin goes
// red the moment a sibling lane's core growth merges beside it.
// Then core gzip 80->67KB (2026-09-26), the same ADR 0012 byte move as the
// raw entry above -- measured 67222B, down from 80502B.
const CORE_GZIP_BUDGET = 67 * 1024;
// board), then raw-only 184→188KB (2026-09-09) for the report-menu copy
// toolkit's i18n slice (same board) — see the matching comment in
// apps/dashboard/test/server/client-bundle-size-budget.test.ts for the
// measured sizes behind each bump.
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
//
// Then gzip-only 34→35KB (2026-09-09) for EPIC 0020 slices 1+2: the PR
// cards' pipeline strip (per-check glyph, duration, deep link) plus the
// maintainer merge + update-branch buttons. The tripwire fired first and
// was paid twice before this bump — a prose pass on the new tips/confirms
// (-466B raw) and a real DRY fix folding the two maintainer-verb click
// handlers into one wiring (they were the same confirm→disable→POST→
// live-region→re-poll shape). Raw came back under 112KB on its own; only
// gzip stayed over, at 35068B against 34816B, because the remaining growth
// is unique prose that compresses poorly. Core (first-paint) budgets are
// untouched.
// Then raw-only 112→116KB (2026-09-09) for the third maintainer verb —
// re-run failed checks — which closed the panel's last dead end: a red
// check disabled the merge button with an honest reason and nothing in the
// app could act on it. The tripwire was paid THREE times across this epic
// before either number moved: a prose pass on the new tips (-466B), a fold
// of the two identical maintainer-verb click handlers into one wiring, and
// a prPanelButton() helper replacing four verbatim button-construction
// blocks (-400B). Panels is a deferred chunk — it never blocks first paint
// — and the core budgets are untouched at 184KB/55KB.
// raw-only 117→118KB (2026-09-09), MIRROR PASS panel (EPIC 0019 S3, VERDICT
// ap-mtsg3nc0-3 slice (c)): the panel client rides /project.js, but its four
// STRINGS.he translations land in panels.js via locale-data.ts regardless of
// which chunk the panel's own code is served from. Measured 119958B raw
// against the old 119808B budget: 150 bytes over on raw alone, gzip
// untouched. See apps/dashboard/test/server/client-bundle-size-budget.test.ts
// for the mirrored budget and full reasoning.
//
// Then panels raw 118→119KB / gzip 36→37KB (2026-09-09) for the standing
// panel's role gating. It used to invite the repo's OWN maintainer to
// apply for a rank below his — the identity endpoint resolved his role
// correctly, the panel simply never asked. Paid first by folding the two
// near-identical anchor builders into one; the residue is the role
// decision itself, spliced from the panel module so it cannot drift.
//
// Then panels raw 119→120KB (2026-09-09, second landing of the day) for
// the 56 commits this round landed — the fleet's own UI growth, not one
// slice's. Deferred chunk, never blocks first paint; core untouched.
//
// Then panels raw 120→122KB (2026-09-10) for the contributor-issue-list
// panel recovered from the lanes after the 13:06 power loss. Deferred
// chunk, never blocks first paint; core untouched.
//
// Then panels raw 122→123KB / gzip 37→38KB (2026-09-10) for the LANDING
// panel's branch-line i18n slice (board web-msnsndki-dz3vn1 — six STRINGS
// keys for the branch/arrow/base tips and aria-labels). The panel's own
// code rides /project.js, but its six STRINGS.he translations land in
// panels.js via locale-data.ts, the same shape the MIRROR PASS entry above
// describes. Measured 124884B raw / 37932B gzip against the old 124928B /
// 37888B budget: 44 bytes over on gzip and 44 bytes under on raw, so both
// lines move. Core (191852B / 56682B against 192512B / 57344B) untouched.
// See apps/dashboard/test/server/client-bundle-size-budget.test.ts for the
// mirrored budget and full reasoning.
// Then raw 123→127KB / gzip 38→39KB (2026-09-11) for EPIC 0021 slice 2: the
// app shell's subject-nav client (web/features/subject-nav.ts) rides this
// deferred chunk by design — it self-initializes and nothing in core calls
// it — measured 125.8KB/38.4KB after landing, 2.8KB/0.4KB over the old line.
// Then raw 127→128KB (2026-09-12) for EPIC 0021 slice 5: the subject nav
// reads its subject set from the page's links, scans main#fleet's sections
// on a project page and marks inactive ones — measured 127.4KB raw.
// Then raw 128→133KB / gzip 39→41KB (2026-09-12) for EPIC 0021 slices 7+8:
// the command palette (a combobox over a listbox, items read from the page)
// and focus mode join the shell's deferred client — measured 132.7KB/40.1KB.
// Then raw 133→135KB (2026-09-12) for EPIC 0021 slice 4 (first cut): the
// Keeper place's live "waiting on you" count — measured 134.0KB raw.
// Then raw 135→137KB (2026-09-12) for EPIC 0021 slice 6: the context rail
// — the shell client moves the lanes and the Keeper queue into the aside
// from xl and back below it, and keeps the rail's empty line honest —
// measured 136.6KB raw.
// Then raw 137→144KB (2026-09-12) for EPIC 0021 slice 4: the Keeper queue — one
// list of everything waiting on a human, a view over the panels with keyboard
// exit actions — measured 142.6KB raw.
// Then raw 144→146KB (2026-09-12) for EPIC 0021 slice 4 (remainder): the Keeper
// queue's settled-this-session history — measured 144.3KB raw.
// Then raw 144→145KB (2026-09-12) for EPIC 0020 slice 8: the 🔧 Diagnose button
// — measured 144.1KB raw after trimming (shared restore/render helpers, a
// generalized wirePrMaintainerAction, a shorter tooltip). Mirrors the budget
// comment in test/server/client-bundle-size-budget.test.ts.
// Merged 2026-09-12: both lines above landed in the same round (the Keeper queue's
// settled history HERE, the Diagnose button in a lane); one budget covers both.
// Then raw 146→148KB (2026-09-12) for a lane's KEEPER CI-status panel (ci-status.ts,
// a self-initialising deferred panel that had been left out of every chunk list
// and rode core) — measured 146.5KB raw with it in /panels.js.
// Then raw 148→149KB (2026-09-12) for #43: each list says who it is for (two
// audience lines under the Pool and Good-first titles, en+he) — measured 148.1KB raw.
// Then raw 149→150KB (2026-09-12, round 4): the mirror-pass stale-claim UI in
// /panels.js merged 226 bytes past the budget — measured 149.2KB raw.
// Then panels raw 156→160KB / gzip 47→48KB (2026-09-13) for THE VERSION MENU
// (web/features/update.ts: the masthead chip, the popover, the shared update
// runner): measured 157.3KB/47.2KB.
// Then panels raw 160→161KB / gzip 48→49KB (2026-09-13) for EPIC 0029 slice 2: GitHub
// connection management in the Connect popover — log in / switch / log out
// as three buttons with their tips and status lines, each a terminal launch
// of a fixed gh auth literal (the Claude button's own pattern), plus the
// STRINGS.he translations that land here via locale-data.ts. Measured
// 164414B raw / 49318B gzip against the old 163840B / 49152B budgets.
// Deferred chunk, never blocks first paint; core untouched.
// Then chunk raw 163→176KB (2026-09-14) for THE ONBOARDING LADDER (epic 0032):
// features/onboarding.ts (the panel, the seven micro-tasks and their actions)
// plus the ladder model spliced in beside it, and locale-data.ts carrying the
// same ~30 keys in Hebrew — measured 175.4KB.
// Then chunk raw 176→178KB (2026-09-15): the ladder's GitHub-connection
// fetch, the Connect-popover opener, and the tour<->ladder hand-over in
// both directions — measured 177.0KB.
// Then chunk raw 178→185KB (2026-09-15) for THE GUIDED WALK: the spotlight,
// the anchoring geometry spliced from web/tour.ts, and the same nine stops
// again in Hebrew via locale-data.ts — measured 184.0KB.
// Then chunk raw 185→187KB (2026-09-16) for the diff-approval UI shell
// (VERDICT ap-mtydvfm1-0 slice (a), epic 0020 slice 8): fixProposalDiffLines/
// fixProposalApproveDisabledReason/fixProposalDiscardTip spliced into
// web/features/pr-review.ts, plus renderFixProposal and its Discard wiring —
// measured 186.4KB (190840B).
// Then chunk raw 187→195KB (2026-09-18) for the COLLABORATION panel (board
// web-mtpzqrxl-z7jgbu): web/features/collaboration.ts — GET /api/collaboration's
// roadmap + help-wanted lists, per-item claim state, and the my-claims filter
// over the viewer's own login — joins /panels.js as a deferred, self-init
// panel (chunks.ts's DEFERRED_OPERATOR_FEATURES), the same shape
// contributor-issue-list.ts already establishes. Measured 189.7KB (194246B)
// against the old 191488B budget: 2758 bytes over. Gzip (58162B) stays under
// CHUNK_GZIP_BUDGET untouched, so only the raw line moves; this bump leaves
// ~5.3KB raw headroom, matching the size of recent panel-sized bumps here.
// Then panels raw 198→200KB (2026-09-18, same day) for the ladder's minimised
// strip (rank, step count, the social state) — measured 199.5KB raw.
// Then panels raw 200→201KB (2026-09-18, same day), epic 0025 icon system:
// the KEEPER PR review panel's approve-link and maintainer-merge button trade
// their baked-in 🔓/🤝 glyphs for lock-open/handshake stroke icons — measured
// 200.0KB raw (204811B). Gzip (61268B) stays under CHUNK_GZIP_BUDGET
// untouched, so only the raw line moves.
// Then panels raw 201→202KB (2026-09-24) for claim routing by repository:
// the pool panel locks its project picker to the registered checkout of
// the issue's own repository, with two new strings and their STRINGS.he
// in panels — measured 201.5KB raw (206360B).
// Then panels raw 202→203KB (2026-09-26), the same epic 0024 pipeline
// switch tips follow-up as the core entry above: the six tips' Hebrew
// translations ship via locale-data.ts's deferred STRINGS.he splice, which
// rides /panels.js regardless of which chunk the switches' own code is
// served from — measured 207315B raw against the old 206848B budget, 467
// bytes over.
// Then panels raw 203→204KB (2026-09-26), epic 0026's row selection: the
// three keys' Hebrew translations ride the same deferred STRINGS.he splice
// — measured 207933B raw against the old 207872B budget, 61 bytes over.
// Gzip (62142B) stays under CHUNK_GZIP_BUDGET untouched.
// Then SPLIT (2026-09-26), ADR 0012 slice 2b: the shared CHUNK_RAW_BUDGET
// becomes one line per chunk. English moved out of core: the 191 keys only
// project code references head /project.js, and the other 478 (with the
// keys only the server renders) head /panels.js. One shared line raised to
// fit /panels.js would hand /project.js ~115KB of slack nobody asked for.
// Measured 118263B raw for /project.js (was 107507B) and 237238B for
// /panels.js (was 208177B); each line sits about two KB above.
const PROJECT_RAW_BUDGET = 118 * 1024;
const PANELS_RAW_BUDGET = 234 * 1024;
// Then gzip 41→42KB (2026-09-12) for EPIC 0021 slice 6 (the context rail client) — measured 41.2KB gzip.
// Then gzip 42→43KB (2026-09-12) for EPIC 0021 slice 4 (the Keeper queue) — measured 42.9KB gzip.
// Then gzip 43→44KB (2026-09-12) for EPIC 0021 slice 3 (second cut): the flight
// plan editor — measured 43.1KB gzip.
// Then gzip 44→45KB (2026-09-12) for the CI-status panel in /panels.js — measured 44.1KB gzip.
// Then chunk gzip 49→53KB (2026-09-14) for the same epic-0032 ladder panel
// and its Hebrew strings — measured 52.6KB.
// Then chunk gzip 53→56KB (2026-09-15) for the guided walk and its Hebrew
// half — measured 55.3KB.
// Then chunk gzip 56→57KB (2026-09-16) for the same diff-approval UI shell
// entry above — measured 56.1KB (57407B).
// Then chunk gzip 57→58KB (2026-09-18) for connect-panel composer parity
// (board web-mtq70akb-rhsy6s): web/features/connect.ts's CONNECT-popover
// issue form gains the same four report-from-here targets (issue/quick-fix-
// pr/local-task/pool-offer) report-menu.ts's right-click dialog already
// offers, instead of hardwiring 'issue' — reportActionLabel/
// reportConfirmMessage/reportExecuteResult are called as bare hoisted
// identifiers off report-menu.ts's existing splice (no second copy of
// report-panel.ts's source). Measured 57.4KB (58796B) against the old
// 58368B budget: 428 bytes over; raw stays well under CHUNK_RAW_BUDGET, so
// only the gzip line moves.
// Then chunk gzip 60→61KB (2026-09-24) for the same claim-routing strings
// — measured 60.2KB gzip.
// Then SPLIT (2026-09-26), the same ADR 0012 byte move as the raw lines
// above: measured 31521B gzip for /project.js (was 28433B) and 72310B for
// /panels.js (was 62209B).
const PROJECT_GZIP_BUDGET = 32 * 1024;
const PANELS_GZIP_BUDGET = 72 * 1024;
// THE WHAT'S NEW CHUNK (2026-09-24): /whats-new.js carries the once-per-
// version message and its own English and Hebrew strings, so neither
// full chunk grows. Measured 8.2KB raw / 3.3KB gzip at introduction.
const WHATS_NEW_RAW_BUDGET = 12 * 1024;
const WHATS_NEW_GZIP_BUDGET = 5 * 1024;
// THE BENCHMARK CHUNK (2026-09-26): /benchmark.js draws the benchmark
// page, and only that page loads it. Measured 9.7KB raw / 4.0KB gzip at
// introduction.
const BENCHMARK_RAW_BUDGET = 14 * 1024;
const BENCHMARK_GZIP_BUDGET = 6 * 1024;

// Exported as a list, not per declaration, so every budget above stays a bare
// `const <NAME>_BUDGET = <n> * 1024;` line — the exact shape the mirror
// census in apps/dashboard/test/server/client-bundle-size-budget.test.ts reads.
export {
  CORE_RAW_BUDGET,
  CORE_GZIP_BUDGET,
  PROJECT_RAW_BUDGET,
  PROJECT_GZIP_BUDGET,
  PANELS_RAW_BUDGET,
  PANELS_GZIP_BUDGET,
  WHATS_NEW_RAW_BUDGET,
  WHATS_NEW_GZIP_BUDGET,
  BENCHMARK_RAW_BUDGET,
  BENCHMARK_GZIP_BUDGET,
};

/** `bytes` in KB to one decimal — the unit every budget line prints in. */
export function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** Measures one chunk: pushes one message onto `errors` per budget it
 *  exceeds (a size equal to its budget passes), logs its size line and
 *  returns its raw byte count. */
export function measure(name, js, rawBudget, gzipBudget, errors) {
  const rawBytes = Buffer.byteLength(js);
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

/** Measures the five served chunks against their budgets, prints the report
 *  and returns the exit code: 1 when any budget is exceeded, else 0.
 *  `bundle` is the compiled client-bundle module (or a stand-in with the same
 *  five `minified*Js()` functions). */
export function checkBundleSize(bundle) {
  const errors = [];
  const core = measure(
    '/app.js (core)',
    bundle.minifiedCoreJs(),
    CORE_RAW_BUDGET,
    CORE_GZIP_BUDGET,
    errors,
  );
  const project = measure(
    '/project.js',
    bundle.minifiedProjectJs(),
    PROJECT_RAW_BUDGET,
    PROJECT_GZIP_BUDGET,
    errors,
  );
  const panels = measure(
    '/panels.js',
    bundle.minifiedPanelsJs(),
    PANELS_RAW_BUDGET,
    PANELS_GZIP_BUDGET,
    errors,
  );
  const whatsNew = measure(
    '/whats-new.js',
    bundle.minifiedWhatsNewJs(),
    WHATS_NEW_RAW_BUDGET,
    WHATS_NEW_GZIP_BUDGET,
    errors,
  );
  const benchmark = measure(
    '/benchmark.js',
    bundle.minifiedBenchmarkJs(),
    BENCHMARK_RAW_BUDGET,
    BENCHMARK_GZIP_BUDGET,
    errors,
  );
  console.log(
    `combined: ${formatKb(core + project + panels + whatsNew + benchmark)} raw across the five chunks`,
  );

  if (errors.length > 0) {
    console.error(`check-bundle-size FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }

  console.log('check-bundle-size OK');
  return 0;
}

// Stryker disable all: `main` imports the real dist output and exits the
// process — exercised only by running the gate for real. The check it runs,
// `checkBundleSize`, IS mutation-tested
// (config/mutation/stryker.ci-check-bundle-size.config.mjs).
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

  const exitCode = checkBundleSize(bundleModule);
  if (exitCode !== 0) process.exit(exitCode);
}

// Run only as the entry point, so the test file can import the helpers above
// without needing a build.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
// Stryker restore all
