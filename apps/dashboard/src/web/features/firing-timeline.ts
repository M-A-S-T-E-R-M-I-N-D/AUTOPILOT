// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "Per-firing trace" panel cluster — one expandable row
 * per firing (`firingTimelineSection`) plus its own Firing Replay viewer
 * (trace drill-down, diff view, step-through playback), extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `firingTimelineJs`
 * export the same way it already finds every other extracted module's own.
 * This file carries real relative-import splices of its own —
 * `groupByFiring`/`firingLogEntry` (from `web/activity-log.ts`),
 * `trajectorySignalOf`/`firingTimelineRowMeta` (from `web/flight-metrics.ts`,
 * `firingTimelineRowMeta` calling `trajectorySignalOf` internally the same
 * same-module-call pattern `flightVerdictOf` already uses),
 * `diffLineClass`/`diffLinesForStep`/`diffToggleTip` (from
 * `web/diff-view.ts`), and `clampReplayStep`/`replayNav` (from
 * `web/replay-nav.ts`, `replayNav` calling `clampReplayStep` internally) —
 * now resolved relative to this file instead of `shell.ts`.
 * Unlike every prior whole-region move, this cluster keeps its OWN cache of
 * module-level state maps (`openFirings`/`firingActivityExtra`/
 * `firingActivityLoading`/`openDiffs`/`firingDiffExtra`/`firingDiffLoading`/
 * `replaySteps`) AND its own five click handlers plus one keydown handler
 * (event-delegated on `document`, mirroring the phase-toggle handler that
 * stays inline in `fleetJs()` for `openPhases`) — the same self-contained-
 * state shape `landing.ts`'s own `landingRestarting` cluster already proved
 * extractable, just with more state and more handlers since this cluster is
 * a full drill-down/diff/replay feature rather than a single toggle.
 * `openFirings[c.id]` is ALSO read by `fleetJs()`'s own `detailSectionSigsFor`
 * (change-detection for the Details panel's subsection re-render) — that
 * call site stays a bare, unimported identifier reference in `fleetJs()`'s
 * own served text, relying on the same concatenated-script hoisting every
 * whole-region move already depends on for `el`/`tipChip`/`fmtAgo`, just in
 * the opposite direction here: `fleetJs()` (served FIRST in the bundle) reads
 * a `var` this module (served AFTER, via `featureModulesJs()`) declares —
 * safe because `detailSectionSigsFor` is only ever CALLED during a render,
 * well after the whole concatenated script has already run once, the same
 * reasoning `landing.ts`'s own `lastFleetState` read already established for
 * a hoisted-read in the other direction.
 * `firingCallsign`/`CALLSIGN_WORDS` stay inline in `fleetJs()` instead of
 * moving with this cluster — `liveFiring`/`liveFirings` (broadly shared, the
 * live-worker card and others read them) also call `firingCallsign` as an
 * injected function, not just this cluster's own row rendering — the same
 * "shared helper stays behind, the moved cluster calls it as a bare hoisted
 * identifier" shape the issue-triage cut's own `decisionItemHeadMeta`
 * relocation already established. `el`/`tipChip`/`taskMap`/`flightHeadlineOf`/
 * `fmtAgo`/`guardDenialChipMeta`/`actRow`/`lastFleetState`/`lastFleetSig`/
 * `renderFleet`/`rerenderSoon` all stay inline too — broadly shared across
 * many panels beyond this cluster (or, for `lastFleetState`/`lastFleetSig`/
 * `renderFleet`, fleet-wide module state/functions already relied on the
 * same cross-module hoisted-read/call shape by `web/features/landing.ts`'s
 * own click handler) — called/read by name inside this cluster's functions,
 * hoisting the same way every whole-region move in this epic already relies
 * on.
 * `firingTimelineSection(c)` (declared below) is called from `fleetJs()`'s
 * `firingTimelineNode(c)` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text, the same reason
 * every whole-region move's own call site already relies on.
 */
import { groupByFiring, firingLogEntry } from '../activity-log.js';
import { trajectorySignalOf, firingTimelineRowMeta } from '../flight-metrics.js';
import { diffLineClass, diffLinesForStep, diffToggleTip } from '../diff-view.js';
import { clampReplayStep, replayNav } from '../replay-nav.js';

/** The "Per-firing trace" panel cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function firingTimelineJs(): string {
  return `
// Which firing is drilled open per project (survives SSE re-renders).
var openFirings = {};
// Firing Replay viewer, slice 1 (BOARD web-msnt26yk-5fzo6j): a drilled-open
// firing's COMPLETE trace, fetched on demand from /api/firing-activity since
// /api/state's own feed caps at the newest N events project-wide — keyed by
// "<projectId>:<firingId>", populated once per firing and cached (a past
// firing's trace never changes).
var firingActivityExtra = {};
var firingActivityLoading = {};
// Firing Replay viewer, diff-capture slice (BOARD web-msnt26yk-5fzo6j): a
// drilled-open firing's commit diff, fetched on demand from /api/firing-diff
// only once its "View diff" toggle is opened (no cost to firings the operator
// never inspects) — keyed by "<projectId>:<firingId>", cached like
// firingActivityExtra above (a past firing's diff never changes).
var openDiffs = {};
var firingDiffExtra = {};
var firingDiffLoading = {};
// Firing Replay viewer, step-through slice (BOARD web-msnt26yk-5fzo6j): which
// step a drilled-open firing's playback controls are showing, keyed by
// "<projectId>:<firingId>" like the caches above. No key present for a
// firing means "not in step-through mode" — the full trace renders as
// before; entering replay sets it to 0 and Prev/Next/Exit move or clear it.
var replaySteps = {};
// groupByFiring/firingLogEntry are generated FROM web/activity-log.ts below
// (epic 0002 "shell decomposition", slice 2) — their real compiled source
// via .toString(), not a hand-retyped copy. They can no longer drift apart.
${groupByFiring.toString()}
${firingLogEntry.toString()}
// trajectorySignalOf is generated FROM web/flight-metrics.ts below (epic
// 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
// firingTimelineRowMeta (embedded next) calls it directly, the same
// same-module-call pattern it already uses for flightVerdictOf.
${trajectorySignalOf.toString()}
// firingTimelineRowMeta is generated FROM web/flight-metrics.ts below (epic
// 0002 "shell decomposition", slice 2) — its real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
${firingTimelineRowMeta.toString()}
// diffLineClass/diffLinesForStep/diffToggleTip are generated FROM
// web/diff-view.ts below (Firing Replay viewer, diff-capture + per-step diff
// slices, BOARD web-msnt26yk-5fzo6j; diffToggleTip added for the app-wide
// interactivity audit v2, web-msm66jlc-gm4oom) — their real compiled source
// via .toString(), not a hand-retyped copy. They can no longer drift apart;
// firingTimelineSection (below) calls diffLineClass to color each patch line
// and diffLinesForStep to narrow the patch to the current replay step's file.
${diffLineClass.toString()}
${diffLinesForStep.toString()}
${diffToggleTip.toString()}
// clampReplayStep/replayNav are generated FROM web/replay-nav.ts below
// (Firing Replay viewer, step-through slice, BOARD web-msnt26yk-5fzo6j) —
// their real compiled source via .toString(), not a hand-retyped copy. They
// can no longer drift apart; replayNav calls clampReplayStep internally, and
// firingTimelineSection (below) calls replayNav to drive the playback
// controls.
${clampReplayStep.toString()}
${replayNav.toString()}
// The "who did what, when, in which firing" view — one expandable row per
// firing, newest first, joined against the flight log for its headline.
function firingTimelineSection(c) {
  var acts = c.activity || [];
  if (!acts.length) return null;
  var groups = groupByFiring(acts);
  var wrap = el('div', 'firing-timeline');
  // Task lookup for headline resolution — built once, shared by every row.
  var traceTaskById = taskMap(c.tasks);
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var f = firingLogEntry(c, g.firingId);
    var isOpen = openFirings[c.id] === g.firingId;
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'firing-toggle' + (isOpen ? ' firing-open' : '');
    row.setAttribute('data-firing-toggle', g.firingId);
    row.setAttribute('data-firing-pid', c.id);
    row.setAttribute('aria-expanded', String(isOpen));
    var meta = firingTimelineRowMeta(g, f, traceTaskById, flightHeadlineOf, fmtAgo);
    var headlineEl = el('span', 'firing-headline', meta.headlineDisplay);
    headlineEl.setAttribute('tabindex', '0');
    headlineEl.setAttribute('data-tip', meta.headline);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the span's own text (the 64-char
    // truncated headline) already names it, so the full headline rides
    // aria-describedby into a visually-hidden span instead of an aria-label
    // duplicating data-tip verbatim (same fix as the flight-map fnodes). The
    // desc lands AFTER the row button in the wrap — inside the button its
    // text would join the button's accessible name (a button names itself
    // from its contents, sr-only text included).
    var headlineDescId = 'firing-headline-desc-' + c.id + '-' + i;
    headlineEl.setAttribute('aria-describedby', headlineDescId);
    row.appendChild(headlineEl);
    if (meta.showCallsign) {
      row.appendChild(
        tipChip(firingCallsign(g.firingId), meta.callsignTip, meta.callsignAriaLabel, 'firing-callsign'),
      );
    }
    if (meta.verdict) {
      var verdictEl = el('span', meta.verdictClass, meta.verdict);
      verdictEl.setAttribute('tabindex', '0');
      verdictEl.setAttribute('data-tip', meta.verdictTip);
      verdictEl.setAttribute('aria-label', meta.verdictAriaLabel);
      row.appendChild(verdictEl);
    }
    // Same notable-event chips the flight-log rows carry (headless-surfacing
    // sweep, board web-msnqqjmd-9bx0wd) — the trace row already joins its
    // flight-log entry, so a bounced or rescued firing reads the same here.
    if (f && f.autoformatRescued) {
      row.appendChild(
        tipChip(
          '🔧 auto-fixed',
          'The gate failed a formatting check; mechanical remediation fixed it automatically and this firing shipped clean instead of reverting.',
          'auto-fixed: formatting was mechanically remediated before this firing shipped',
          'flight-autoformat-chip',
        ),
      );
    }
    if (f && f.guardDenials) {
      var guardMeta = guardDenialChipMeta(f.guardDenials);
      row.appendChild(tipChip(guardMeta.label, guardMeta.tip, guardMeta.ariaLabel, 'flight-guard-chip'));
    }
    var countEl = el('span', 'firing-count', meta.countLabel);
    countEl.setAttribute('tabindex', '0');
    countEl.setAttribute('data-tip', 'Tool calls and activity recorded for this firing');
    countEl.setAttribute('aria-label', meta.countLabel);
    row.appendChild(countEl);
    if (meta.redundancyLabel) {
      row.appendChild(
        tipChip(meta.redundancyLabel, meta.redundancyTip, meta.redundancyAriaLabel, 'chip-anomaly firing-redundancy'),
      );
    }
    var agoEl = el('span', 'muted firing-ago', meta.startedAgo);
    agoEl.setAttribute('tabindex', '0');
    agoEl.setAttribute('data-tip', 'When this firing started');
    agoEl.setAttribute('aria-label', meta.startedAgoAriaLabel);
    row.appendChild(agoEl);
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the fields above each
    // set tabindex="0" — up to ~8 Tab stops PER ROW on top of the row button
    // itself, the same per-row multiplier the flight-log rows already fixed.
    // Only the FIRST field (the headline) stays a real Tab stop; Left/Right/
    // Home/End walk the rest (delegated handlers below). Seeded here, once
    // the row is fully assembled, because every chip after the headline is
    // conditional — "which fields exist" is only knowable now.
    var rovingFields = row.querySelectorAll('[tabindex]');
    for (var rf = 0; rf < rovingFields.length; rf++) {
      rovingFields[rf].setAttribute('tabindex', rf === 0 ? '0' : '-1');
    }
    wrap.appendChild(row);
    // .sr-only is position:absolute, so this adds no phantom flex-gap row
    // to the .firing-timeline column.
    var headlineDesc = el('span', 'sr-only', meta.headline);
    headlineDesc.id = headlineDescId;
    wrap.appendChild(headlineDesc);
    if (isOpen) {
      var cacheKey = c.id + ':' + g.firingId;
      var fullTrace = firingActivityExtra[cacheKey];
      // An EMPTY fetched trace must not shadow the entries already in state:
      // [] is truthy, so a bare || kept rendering a blank drill-down whenever
      // the trace endpoint answered with nothing (older server, truncated
      // events, or a test's catch-all fetch mock). Fall back unless the fetch
      // actually brought rows.
      var traceEntries = fullTrace && fullTrace.length ? fullTrace : g.entries;
      // Firing Replay viewer, step-through slice (BOARD web-msnt26yk-5fzo6j):
      // a number in replaySteps[cacheKey] means playback mode is active — show
      // just that one step plus Prev/Next/Exit, instead of the full list. The
      // index survives a trace that's still lazy-loading (fewer entries now,
      // more once the fetch lands) since replayNav reclamps it every render.
      var replayIndex = replaySteps[cacheKey];
      var inReplay = typeof replayIndex === 'number';
      if (inReplay) {
        var nav = replayNav(replayIndex, traceEntries.length);
        var replayUl = el('ul', 'activity firing-detail firing-replay-single');
        if (traceEntries.length) replayUl.appendChild(actRow(traceEntries[nav.index], true));
        // D1 TAB-STOP ROVING: the single replayed row is still an .activity
        // group (sentence + step-cost meta) — seed it so it has exactly one
        // Tab stop like every other list. Left/Right here move between those
        // two fields; the replay's own step scrubbing lives on .replay-nav.
        seedRoving(replayUl, '[tabindex]');
        wrap.appendChild(replayUl);
        var navBar = el('div', 'replay-nav');
        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'replay-nav-btn';
        prevBtn.setAttribute('data-replay-prev', g.firingId);
        prevBtn.setAttribute('data-replay-pid', c.id);
        prevBtn.disabled = !nav.canPrev;
        // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the action
        // concisely — the full sentence lives in data-tip alone.
        prevBtn.setAttribute('aria-label', 'Previous action');
        prevBtn.setAttribute('data-tip', 'Step back to the previous action in this replay');
        prevBtn.textContent = '‹ Prev';
        navBar.appendChild(prevBtn);
        var navLabel = el('span', 'replay-nav-label', nav.label);
        navLabel.setAttribute('role', 'status');
        navLabel.setAttribute('aria-live', 'polite');
        // data-tip + tabindex only — an aria-label here would replace the
        // live region's announced "Step N of M" text with the tip.
        navLabel.setAttribute('data-tip', 'Your position in this replay — Left and Right arrow keys also step');
        navLabel.setAttribute('tabindex', '0');
        navBar.appendChild(navLabel);
        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'replay-nav-btn';
        nextBtn.setAttribute('data-replay-next', g.firingId);
        nextBtn.setAttribute('data-replay-pid', c.id);
        nextBtn.disabled = !nav.canNext;
        nextBtn.setAttribute('aria-label', 'Next action');
        nextBtn.setAttribute('data-tip', 'Advance to the next action in this replay');
        nextBtn.textContent = 'Next ›';
        navBar.appendChild(nextBtn);
        var exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.className = 'replay-nav-exit';
        exitBtn.setAttribute('data-replay-exit', g.firingId);
        exitBtn.setAttribute('data-replay-pid', c.id);
        exitBtn.setAttribute('aria-label', 'Exit replay');
        exitBtn.setAttribute('data-tip', 'Leave playback and show the full trace list');
        exitBtn.textContent = 'Exit replay';
        navBar.appendChild(exitBtn);
        wrap.appendChild(navBar);
      } else {
        var ul = el('ul', 'activity firing-detail');
        for (var k = 0; k < traceEntries.length; k++) {
          ul.appendChild(actRow(traceEntries[k], true));
        }
        // D1 TAB-STOP ROVING: the trace drill-down gave up to TWO Tab stops
        // per row (sentence + step-cost meta). One stop for the whole list;
        // wireRoving('.activity [tabindex]', ...) next to actRow moves it.
        seedRoving(ul, '[tabindex]');
        wrap.appendChild(ul);
        if (!fullTrace && firingActivityLoading[cacheKey]) {
          wrap.appendChild(el('div', 'muted firing-trace-loading', 'Loading full trace…'));
        }
        if (traceEntries.length > 1) {
          var replayToggle = document.createElement('button');
          replayToggle.type = 'button';
          replayToggle.className = 'diff-toggle';
          replayToggle.setAttribute('data-replay-start', g.firingId);
          replayToggle.setAttribute('data-replay-pid', c.id);
          // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the action
          // concisely — the full sentence lives in data-tip alone.
          replayToggle.setAttribute('aria-label', 'Step through');
          replayToggle.setAttribute(
            'data-tip',
            'Replay this firing one action at a time with Prev and Next controls',
          );
          replayToggle.textContent = '▶ Step through';
          wrap.appendChild(replayToggle);
        }
      }
      // Firing Replay viewer, diff-capture slice (BOARD web-msnt26yk-5fzo6j):
      // only a firing that actually shipped a commit (f.sha) has a diff to
      // show — a no-commit firing (turn cap, gate revert) gets no toggle at
      // all rather than a button that always resolves to "nothing to show".
      if (f && f.sha) {
        var diffOpen = openDiffs[cacheKey] === true;
        var diffToggle = document.createElement('button');
        diffToggle.type = 'button';
        diffToggle.className = 'diff-toggle';
        diffToggle.setAttribute('data-diff-toggle', g.firingId);
        diffToggle.setAttribute('data-diff-pid', c.id);
        diffToggle.setAttribute('aria-expanded', String(diffOpen));
        var diffTip = diffToggleTip(diffOpen);
        diffToggle.setAttribute('data-tip', diffTip);
        // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the action
        // concisely (matching the button's own visible text) instead of
        // duplicating the full data-tip sentence verbatim.
        diffToggle.setAttribute('aria-label', diffOpen ? 'Hide diff' : 'View diff');
        diffToggle.textContent = diffOpen ? 'Hide diff' : 'View diff';
        wrap.appendChild(diffToggle);
        if (diffOpen) {
          var diffPage = firingDiffExtra[cacheKey];
          if (diffPage && diffPage.patch) {
            var pre = el('pre', 'firing-diff');
            var lines = diffPage.patch.split('\\n');
            // Firing Replay viewer, per-step diff slice (BOARD
            // web-msnt26yk-5fzo6j): in step-through mode, narrow the patch
            // down to the CURRENT step's target file instead of showing the
            // whole firing's patch on every step.
            if (inReplay && traceEntries[nav.index]) {
              lines = diffLinesForStep(lines, traceEntries[nav.index].target);
            }
            for (var d = 0; d < lines.length; d++) {
              pre.appendChild(el('div', diffLineClass(lines[d]), lines[d]));
            }
            wrap.appendChild(pre);
          } else if (diffPage) {
            wrap.appendChild(el('div', 'muted firing-diff-empty', 'No diff available for this firing.'));
          } else if (firingDiffLoading[cacheKey]) {
            wrap.appendChild(el('div', 'muted firing-trace-loading', 'Loading diff…'));
          }
        }
      }
    }
  }
  return wrap;
}
// Per-firing trace drill-down (event-delegated): click a firing row to open
// its own timeline of tool uses — same pure UI-state-only re-render as the
// phase-toggle handler that stays inline in fleetJs().
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-firing-toggle]');
  if (!b) return;
  var pid = b.getAttribute('data-firing-pid');
  var fid = b.getAttribute('data-firing-toggle');
  var wasOpen = openFirings[pid] === fid;
  openFirings[pid] = wasOpen ? null : fid;
  if (lastFleetState) {
    lastFleetSig = null;
    renderFleet(lastFleetState);
  }
  var cacheKey = pid + ':' + fid;
  if (!wasOpen && !firingActivityExtra[cacheKey] && !firingActivityLoading[cacheKey]) {
    firingActivityLoading[cacheKey] = true;
    fetch(
      '/api/firing-activity?project=' + encodeURIComponent(pid) + '&firing=' + encodeURIComponent(fid),
      { headers: { accept: 'application/json' } },
    )
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (page) {
        firingActivityExtra[cacheKey] = (page && page.entries) || [];
      })
      .catch(function () {
        // Leave firingActivityExtra unset so a future open retries the fetch.
      })
      .then(function () {
        firingActivityLoading[cacheKey] = false;
        rerenderSoon();
      });
  }
});
// Firing diff toggle (event-delegated): click "View diff" inside an open
// firing's drill-down to fetch and show its commit patch — same lazy-fetch-
// and-cache shape as the firing-trace handler above.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-diff-toggle]');
  if (!b) return;
  var pid = b.getAttribute('data-diff-pid');
  var fid = b.getAttribute('data-diff-toggle');
  var cacheKey = pid + ':' + fid;
  var wasOpen = openDiffs[cacheKey] === true;
  openDiffs[cacheKey] = !wasOpen;
  if (lastFleetState) {
    lastFleetSig = null;
    renderFleet(lastFleetState);
  }
  if (!wasOpen && !firingDiffExtra[cacheKey] && !firingDiffLoading[cacheKey]) {
    firingDiffLoading[cacheKey] = true;
    fetch(
      '/api/firing-diff?project=' + encodeURIComponent(pid) + '&firing=' + encodeURIComponent(fid),
      { headers: { accept: 'application/json' } },
    )
      .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
      .then(function (page) {
        firingDiffExtra[cacheKey] = page || { patch: null };
      })
      .catch(function () {
        // Leave firingDiffExtra unset so a future open retries the fetch.
      })
      .then(function () {
        firingDiffLoading[cacheKey] = false;
        rerenderSoon();
      });
  }
});
// Firing Replay viewer, step-through slice (BOARD web-msnt26yk-5fzo6j):
// Start/Prev/Next/Exit playback controls (event-delegated), one handler per
// button since each sets replaySteps differently — same cache-key shape as
// the trace/diff handlers above. No fetch here: the trace is already loaded
// (or loading) via the existing firingActivityExtra path: stepping just
// changes which already-fetched entry is on screen.
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-replay-start]');
  if (!b) return;
  var cacheKey = b.getAttribute('data-replay-pid') + ':' + b.getAttribute('data-replay-start');
  replaySteps[cacheKey] = 0;
  rerenderSoon();
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-replay-exit]');
  if (!b) return;
  var cacheKey = b.getAttribute('data-replay-pid') + ':' + b.getAttribute('data-replay-exit');
  delete replaySteps[cacheKey];
  rerenderSoon();
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-replay-prev]');
  if (!b) return;
  var cacheKey = b.getAttribute('data-replay-pid') + ':' + b.getAttribute('data-replay-prev');
  if (typeof replaySteps[cacheKey] === 'number') replaySteps[cacheKey] -= 1;
  rerenderSoon();
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-replay-next]');
  if (!b) return;
  var cacheKey = b.getAttribute('data-replay-pid') + ':' + b.getAttribute('data-replay-next');
  if (typeof replaySteps[cacheKey] === 'number') replaySteps[cacheKey] += 1;
  rerenderSoon();
});
// Firing Replay viewer, playback-scrubbing slice (BOARD web-msnt26yk-5fzo6j):
// Left/Right arrow keys move Prev/Next while focus sits inside the replay
// nav bar — the scrubbing idiom every playback control (video, carousel)
// supports, instead of Tab+Enter/Space on each button. Scoped to
// '.replay-nav' so arrow keys anywhere else on the page (scrolling, other
// widgets) are untouched. Dispatches a REAL click at the target button
// rather than duplicating the step math here, so it shares the exact same
// replaySteps update / clamp / disabled-button guard as a mouse click.
// Guarded by a flag on 'document' (not just declared once in this script) —
// the client bundle can re-run on the same live document more than once (a
// test harness rebooting it against one jsdom document), and an unguarded
// second registration would fire this handler twice per keystroke,
// double-clicking the button and skipping a step.
if (!document.__replayArrowKeysBound) {
  document.__replayArrowKeysBound = true;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var bar = e.target && e.target.closest && e.target.closest('.replay-nav');
    if (!bar) return;
    var btn = bar.querySelector(e.key === 'ArrowLeft' ? '[data-replay-prev]' : '[data-replay-next]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    btn.click();
  });
}
// D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): Left/Right/Home/End move
// the single roving Tab stop across a trace row's fields/chips, clamped at
// the row rim so arrows never walk into a neighboring row. Delegated on
// document (rows are rebuilt wholesale on every SSE re-render, so per-field
// listeners would need re-attaching). Scoped to [tabindex] fields INSIDE
// '.firing-toggle', so the replay nav bar's own Left/Right scrubbing above
// stays untouched. Guarded like the replay-arrows handler: the bundle can
// re-run on the same live document (a test harness rebooting it), and an
// unguarded second registration would move the stop twice per keystroke.
if (!document.__firingTraceRovingBound) {
  document.__firingTraceRovingBound = true;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('tabindex') || !t.closest) return;
    var group = t.closest('.firing-toggle');
    if (!group) return;
    var items = Array.prototype.slice.call(group.querySelectorAll('[tabindex]'));
    var i = items.indexOf(t);
    if (i < 0) return;
    var next = i;
    if (e.key === 'ArrowLeft') next = i - 1;
    else if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'Home') next = 0;
    else next = items.length - 1;
    next = Math.max(0, Math.min(items.length - 1, next));
    if (next === i) return;
    e.preventDefault();
    items[i].setAttribute('tabindex', '-1');
    items[next].setAttribute('tabindex', '0');
    if (items[next].focus) items[next].focus();
  });
  // Mouse/programmatic focus also moves the roving stop (APG roving-tabindex
  // recommendation) so Tabbing away and back lands where the user last was,
  // not always back on the row's headline.
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('tabindex') || !t.closest) return;
    var group = t.closest('.firing-toggle');
    if (!group) return;
    var items = Array.prototype.slice.call(group.querySelectorAll('[tabindex]'));
    var i = items.indexOf(t);
    if (i < 0) return;
    for (var j = 0; j < items.length; j++) items[j].setAttribute('tabindex', j === i ? '0' : '-1');
  });
}
`.trim();
}
