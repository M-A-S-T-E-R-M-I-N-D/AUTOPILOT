// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's post-flight LANDING card cluster — commit-run rendering
 * (`landingCommitRow`/`landingCommitGroupNode`), the flight debrief digest
 * (`flightDebriefSection`), the body/section renderers
 * (`renderLandingBody`/`landingSection`), and the panel's own EXECUTE click
 * handler, a whole bundle-composing assembler function extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/metrics.ts` for
 * the prior cluster extraction of this shape). `flightDebriefSection` is
 * called from nowhere else in `shell.ts` — it exists solely to be assembled
 * into `renderLandingBody`'s panel body — so it moves with the rest of the
 * cluster rather than staying behind. Unlike every prior whole-region move
 * in this epic, this is the FIRST to carry its own EXECUTE click handler:
 * `landing.ts`/`release.ts` were flagged as the two remaining candidates
 * precisely because of this (see the metrics cut's own epic note); this cut
 * takes `landing.ts`, leaving `release.ts` as the next follow-on.
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `landingJs`
 * export the same way it already finds `issue-triage.ts`'s. This file still
 * carries real relative-import splices of its own —
 * `landingDiffstatItems`/`landingCommitFilesMeta`/`landingOverlapItems`/
 * `landingWorktreeDivergence`/`landingCommitRuns`/`landingGroupHeadMeta`/
 * `landingExecuteResult`/`landingExecuteConfirmMessage`/`landingExecuteTip`
 * (from `web/landing-panel.ts`) and `flightDebriefOf`/
 * `flightDebriefChipItems`/`flightDebriefNotableItems` (from
 * `web/flight-debrief.ts`) — now resolved relative to this file instead of
 * `shell.ts`; a function's `.toString()` output is unaffected by which local
 * name imports it under, so this remains byte-for-byte the same generated
 * text. Like `issue-triage.ts`, this cluster keeps its own module-level
 * state — `landingRestarting`, a pid-keyed map surviving between the
 * EXECUTE click and the periodic re-renders while a self-hosted land's
 * rebuild+restart is presumed in flight — but unlike every self-contained
 * cut so far, its click handler DOES read fleet-wide mutable state
 * (`lastFleetState`/`lastFleetSig`) and call `renderFleet()`/`refresh()`,
 * the same cross-module hoisted-read shape `web/features/fly.ts`'s own
 * `lastFleetState` reference already proved safe: the served bundle is one
 * concatenated non-module script (`clientJs()` = `fleetJs()` +
 * `featureModulesJs()`), so by the time a click actually fires (well after
 * the whole script has already run once), `fleetJs()`'s own top-level
 * `var`/`function` declarations are already in the same shared top-level
 * scope this module's click handler closes over.
 * `flightVerdictOf`/`taskMap`/`flightHeadlineOf`/`fmtCost`/`fmtDuration`/
 * `el`/`tipChip` all stay inline in `fleetJs()` — broadly shared across
 * many panels beyond this cluster (`flightVerdictOf`/`taskMap`/
 * `flightHeadlineOf`/`fmtCost` are already relied on the same way by
 * `web/features/metrics.ts`) — called by name inside these functions, they
 * hoist the same way.
 *
 * `landingSection(pid, flightLog, tasks)` (declared below) is called from
 * `fleetJs()`'s `renderProjectPage()` — a call site that stays a bare,
 * unimported identifier reference in `fleetJs()`'s own served text, the same
 * reason every whole-region move's own call site already relies on.
 */
import {
  landingExecuteResult,
  landingJobLine,
  landingDiffstatItems,
  landingCommitFilesMeta,
  landingOverlapItems,
  landingWorktreeDivergence,
  landingExecuteConfirmMessage,
  landingExecuteTip,
  landingCommitRuns,
  landingGroupHeadMeta,
} from '../landing-panel.js';
import {
  flightDebriefOf,
  flightDebriefChipItems,
  flightDebriefNotableItems,
} from '../flight-debrief.js';

/** The post-flight LANDING card cluster client — vanilla, external (keeps CSP script-src 'self'). */
export function landingJs(): string {
  return `
// The post-flight LANDING card (web-msm59yvg-hk7hkw): what the project's
// checked-out branch would bring into its base branch — unmerged commits plus
// their combined diffstat. Fetched on demand (GET /api/landing), never folded
// into the polled /api/state — shelling out to git on every tick would be
// wasteful for a preview that is only useful once a flight actually lands.
// landingDiffstatItems/landingCommitFilesMeta/landingOverlapItems are
// generated FROM web/landing-panel.ts below (epic 0002 "shell
// decomposition", slice 2, fifty-third cut) — their real compiled source via
// .toString(), not a hand-retyped copy. They can no longer drift apart.
${landingDiffstatItems.toString()}
${landingCommitFilesMeta.toString()}
${landingOverlapItems.toString()}
${landingWorktreeDivergence.toString()}
${landingCommitRuns.toString()}
${landingGroupHeadMeta.toString()}
function landingCommitRow(commit) {
  var files = commit.files || [];
  var li = el('li', 'landing-commit');
  // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): one Tab stop per commit
  // row — the sha always leads, so it seeds '0' directly (no seedRoving pass
  // needed); subject/files start at -1 and wireRoving() below moves the stop
  // with Left/Right/Home/End.
  var shaEl = el('span', 'landing-commit-sha', commit.shortSha);
  shaEl.setAttribute('tabindex', '0');
  shaEl.setAttribute('data-tip', 'Abbreviated commit hash');
  shaEl.setAttribute('aria-label', 'commit ' + commit.shortSha);
  li.appendChild(shaEl);
  var subjectEl = el('span', 'landing-commit-subject', commit.subject);
  subjectEl.setAttribute('tabindex', '-1');
  subjectEl.setAttribute('data-tip', 'What this commit changed');
  subjectEl.setAttribute('aria-label', commit.subject);
  li.appendChild(subjectEl);
  var filesMeta = landingCommitFilesMeta(files);
  var filesEl = el('span', 'landing-commit-files muted', filesMeta.label);
  filesEl.setAttribute('tabindex', '-1');
  filesEl.setAttribute('data-tip', filesMeta.tip);
  filesEl.setAttribute('aria-label', files.length + ' files changed');
  li.appendChild(filesEl);
  return li;
}
// One collapsed commit-group row (COCKPIT 2/6): a real <button> toggle
// (native keyboard support, no roving tabindex needed) that shows/hides a
// nested <ul> of the run's individual commit rows. State lives in the
// button/nested-list's own attributes rather than a global open-row map —
// unlike the flight log's flightGroupRow, the LANDING panel is fetched once
// per open (landingSection above) and never re-renders on a poll tick, so
// there is nothing for a global map to survive across.
function landingCommitGroupNode(row, groupId) {
  var meta = landingGroupHeadMeta(row);
  var li = el('li', 'landing-commit-group');
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'landing-group-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', groupId);
  toggle.setAttribute('aria-label', meta.ariaLabel);
  toggle.setAttribute('data-tip', meta.tip);
  var labelEl = el('span', 'landing-group-label', row.label);
  toggle.appendChild(labelEl);
  var countEl = el('span', 'landing-group-count muted', meta.toggleClosedText);
  toggle.appendChild(countEl);
  li.appendChild(toggle);
  var nested = el('ul', 'landing-commit-nested');
  nested.id = groupId;
  nested.hidden = true;
  for (var ni = 0; ni < row.commits.length; ni++) nested.appendChild(landingCommitRow(row.commits[ni]));
  li.appendChild(nested);
  toggle.addEventListener('click', function () {
    var expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    nested.hidden = expanded;
    countEl.textContent = expanded ? meta.toggleClosedText : meta.toggleOpenText;
  });
  return li;
}
// FLIGHT DEBRIEF (board web-msnt50ct-oezq8r): "when a flight ends, the
// landing card gains a digest — ships/deaths, $, duration, best and worst
// firing, notable events — one glance tells the whole story." Renders above
// the raw commit list since the aggregate story is what a landing operator
// wants FIRST, the same "human story first" ordering flightSummarySection's
// own comment states. Returns null (renders nothing) when the flight log is
// empty — flightDebriefOf's own "nothing to debrief yet" signal.
// flightDebriefOf/flightDebriefChipItems/flightDebriefNotableItems are
// generated FROM web/flight-debrief.ts below (board web-msnt50ct-oezq8r,
// FLIGHT DEBRIEF) — their real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${flightDebriefOf.toString()}
${flightDebriefChipItems.toString()}
${flightDebriefNotableItems.toString()}
function flightDebriefSection(flightLog, tasks) {
  var digest = flightDebriefOf(flightLog || [], flightVerdictOf);
  if (!digest) return null;
  var taskById = taskMap(tasks);
  var wrap = el('div', 'flight-debrief');
  wrap.appendChild(el('h4', 'flight-debrief-title', '📋 Flight debrief'));
  var chips = el('p', 'flight-debrief-chips');
  var chipItems = flightDebriefChipItems(digest, fmtCost, fmtDuration);
  chips.appendChild(tipChip(chipItems[0][0], chipItems[0][1], chipItems[0][2], 'flight-debrief-ship'));
  chips.appendChild(tipChip(chipItems[1][0], chipItems[1][1], chipItems[1][2], 'flight-debrief-death'));
  chips.appendChild(tipChip(chipItems[2][0], chipItems[2][1], chipItems[2][2]));
  chips.appendChild(tipChip(chipItems[3][0], chipItems[3][1], chipItems[3][2]));
  // D1 TAB-STOP ROVING: tipChip seeds every chip at tabindex 0 — collapse
  // the line to one shared stop after assembly (wireRoving moves it).
  seedRoving(chips, '.chip');
  wrap.appendChild(chips);
  if (digest.best) {
    var bestText = flightHeadlineOf(digest.best, taskById) + ' — ' + fmtCost(digest.best.cost);
    var bestLine = el('p', 'flight-debrief-best');
    bestLine.appendChild(el('span', 'flight-debrief-label', '🏆 Best: '));
    var bestVal = el('span', null, bestText);
    bestVal.setAttribute('tabindex', '0');
    bestVal.setAttribute('data-tip', 'The most cost-efficient shipped firing this flight');
    bestVal.setAttribute('aria-label', 'best firing: ' + bestText);
    bestLine.appendChild(bestVal);
    wrap.appendChild(bestLine);
  }
  if (digest.worst) {
    var worstText = flightHeadlineOf(digest.worst, taskById) + ' — ' + fmtCost(digest.worst.cost);
    var worstLine = el('p', 'flight-debrief-worst');
    worstLine.appendChild(el('span', 'flight-debrief-label', '💀 Worst: '));
    var worstVal = el('span', null, worstText);
    worstVal.setAttribute('tabindex', '0');
    worstVal.setAttribute('data-tip', 'The priciest firing that did not ship this flight');
    worstVal.setAttribute('aria-label', 'worst firing: ' + worstText);
    worstLine.appendChild(worstVal);
    wrap.appendChild(worstLine);
  }
  var notable = flightDebriefNotableItems(digest);
  if (notable.length) {
    var notableP = el('p', 'flight-debrief-notable muted');
    for (var ni = 0; ni < notable.length; ni++) {
      if (ni > 0) notableP.appendChild(document.createTextNode(' · '));
      notableP.appendChild(tipChip(notable[ni][0], notable[ni][1], notable[ni][2]));
    }
    seedRoving(notableP, '.chip');
    wrap.appendChild(notableP);
  }
  return wrap;
}
function renderLandingBody(body, landing, pid, flightLog, tasks) {
  body.replaceChildren();
  var debrief = flightDebriefSection(flightLog, tasks);
  if (debrief) body.appendChild(debrief);
  // Checked BEFORE the "nothing to land" early return: this card previously
  // only ever read the checked-out branch, so a checkout that looked level
  // with base could still be hiding commits stranded on the flight worktree
  // by a refusing sync-back — the exact blind spot that stranded 144 commits
  // for 2 days, invisible here (web-msvbzahx-uiemjb, follow-up of a81221f).
  var worktreeWarning = landing ? landingWorktreeDivergence(landing.worktreeAhead || []) : null;
  if (worktreeWarning) {
    var worktreeEl = el('p', 'landing-worktree-divergence', worktreeWarning);
    worktreeEl.setAttribute('role', 'alert');
    body.appendChild(worktreeEl);
  }
  if (!landing || !landing.commits || !landing.commits.length) {
    body.appendChild(el('p', 'muted', 'Nothing to land — the branch is level with its base.'));
    return;
  }
  // D1 TAB-STOP ROVING: the branch line is one roving group — the branch
  // name always leads, so it seeds '0' directly; arrow/base start at -1.
  var branchLine = el('p', 'landing-branch');
  var branchNameEl = el('span', 'landing-branch-name', landing.branch);
  branchNameEl.setAttribute('tabindex', '0');
  branchNameEl.setAttribute('data-tip', 'Currently checked-out branch');
  branchNameEl.setAttribute('aria-label', 'branch: ' + landing.branch);
  branchLine.appendChild(branchNameEl);
  var arrowEl = el('span', 'landing-branch-arrow', '→');
  arrowEl.setAttribute('tabindex', '-1');
  arrowEl.setAttribute('data-tip', 'Merge direction: branch into base');
  arrowEl.setAttribute('aria-label', 'merges into');
  branchLine.appendChild(arrowEl);
  var baseNameEl = el('span', 'landing-base-name', landing.base);
  baseNameEl.setAttribute('tabindex', '-1');
  baseNameEl.setAttribute('data-tip', 'Branch this would merge into');
  baseNameEl.setAttribute('aria-label', 'base branch: ' + landing.base);
  branchLine.appendChild(baseNameEl);
  body.appendChild(branchLine);

  var overlapItems = landingOverlapItems(landing.overlaps || []);
  if (overlapItems.length) {
    var overlapList = el('ul', 'landing-overlaps');
    overlapList.setAttribute('role', 'alert');
    for (var oi = 0; oi < overlapItems.length; oi++) {
      var overlapItem = overlapItems[oi];
      var overlapLi = el('li', 'landing-overlap', overlapItem.text);
      // D1 TAB-STOP ROVING: one stop for the whole overlap list.
      overlapLi.setAttribute('tabindex', oi === 0 ? '0' : '-1');
      overlapLi.setAttribute('data-tip', overlapItem.tip);
      overlapLi.setAttribute('aria-label', overlapItem.text + ': ' + overlapItem.tip);
      overlapList.appendChild(overlapLi);
    }
    body.appendChild(overlapList);
  }

  var ds = landing.diffstat || { filesChanged: 0, insertions: 0, deletions: 0 };
  var statLine = el('p', 'landing-diffstat');
  var diffstatItems = landingDiffstatItems(ds);
  for (var di = 0; di < diffstatItems.length; di++) {
    var diffstatItem = diffstatItems[di];
    statLine.appendChild(tipChip(diffstatItem[0], diffstatItem[1], diffstatItem[2], diffstatItem[3]));
  }
  seedRoving(statLine, '.chip');
  body.appendChild(statLine);

  var ul = el('ul', 'landing-commits');
  var runs = landingCommitRuns(landing.commits);
  for (var ri = 0; ri < runs.length; ri++) {
    var run = runs[ri];
    if (run.isGroup) {
      ul.appendChild(landingCommitGroupNode(run, 'landing-group-' + pid + '-' + ri));
    } else {
      ul.appendChild(landingCommitRow(run.commit));
    }
  }
  body.appendChild(ul);

  // EXECUTE (web-msnqeegt-ki7dm0): gate-then-merge, real git — explicit
  // confirm required, same pattern as Remove/Start over below. The button
  // carries the project id so the click handler (event-delegated, survives
  // re-renders) doesn't need a closure over this render.
  var actions = el('div', 'landing-actions');
  var execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'landing-execute';
  execBtn.textContent = '🛬 Execute landing → ' + landing.base;
  execBtn.setAttribute('data-land-execute', pid);
  var execTip = landingExecuteTip(landing.base);
  execBtn.setAttribute('data-tip', execTip);
  execBtn.setAttribute('aria-label', execTip);
  if (landing.overlaps && landing.overlaps.length) {
    execBtn.setAttribute(
      'data-land-overlap-branches',
      JSON.stringify(landing.overlaps.map(function (o) { return o.branch; })),
    );
  }
  actions.appendChild(execBtn);
  body.appendChild(actions);
  var resultEl = el('div', 'landing-result');
  resultEl.setAttribute('data-land-result', pid);
  resultEl.setAttribute('role', 'status');
  resultEl.setAttribute('aria-live', 'polite');
  body.appendChild(resultEl);
  // A landing may already be running (this render could be a poll tick mid-gate,
  // or a fresh page after a reload) — paint its live state immediately and keep
  // following it. The job lives on the SERVER, so a re-render can no longer lose
  // the story the way the click handler's own captured node used to.
  landingPaintJob(pid);
  // Only reach for the server when this render has nothing cached (a fresh page
  // that may be walking in on a landing already in progress) or when the cached
  // job is still moving. A FINISHED job renders from cache alone — re-polling
  // it on every render would refetch a settled answer for its whole TTL.
  if (!landingJobs[pid] || landingJobs[pid].phase !== 'finished') landingPollJob(pid);
}
// Live landing-job following (operator directive 2026-08-30). The old handler
// wrote its verdict into a node captured at CLICK time; a 4-minute gate almost
// always outlived that node (the panel re-renders on every SSE tick), so a land
// could succeed with nothing at all appearing. Everything now renders from
// GET /api/landing/job, looked up by project id at PAINT time, so whichever
// result element currently exists is the one that gets the news.
var landingJobs = {}; // pid -> last fetched job state
var landingJobTimers = {}; // pid -> poll timer, so one project polls once
// pid -> the startedAt of the job we already refreshed the fleet for. A landed
// job stays readable for its whole TTL, and every panel re-render re-reads it,
// so without this a single land would refresh → re-render → refresh forever.
var landingJobRefreshed = {};
var LANDING_JOB_POLL_MS = 2000;
function landingPaintJob(pid) {
  var el2 = document.querySelector('[data-land-result="' + pid + '"]');
  if (!el2) return false;
  var line = landingJobLine(landingJobs[pid], Date.now());
  if (!line) return false;
  el2.className = line.className;
  el2.textContent = line.text;
  var btn = document.querySelector('[data-land-execute="' + pid + '"]');
  if (btn) {
    btn.disabled = line.busy;
    if (line.busy) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
  }
  return line.busy;
}
function landingPollJob(pid) {
  if (landingJobTimers[pid]) return;
  var tick = function () {
    fetch('/api/landing/job?project=' + encodeURIComponent(pid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        landingJobs[pid] = data && data.job;
        var busy = landingPaintJob(pid);
        if (busy) {
          landingJobTimers[pid] = setTimeout(tick, LANDING_JOB_POLL_MS);
          return;
        }
        delete landingJobTimers[pid];
        // A finished job that LANDED changes the branch — refresh so the panel
        // repaints from the new git state instead of the stale preview. Once
        // per job (keyed by its start), never once per render.
        var done = landingJobs[pid];
        if (done && done.result && done.result.ok && landingJobRefreshed[pid] !== done.startedAt) {
          landingJobRefreshed[pid] = done.startedAt;
          refresh();
        }
      })
      .catch(function () {
        // The server may be mid-self-restart after a green land — keep the
        // timer alive so the page reconnects to the outcome by itself.
        landingJobTimers[pid] = setTimeout(tick, LANDING_JOB_POLL_MS * 2);
      });
  };
  landingJobTimers[pid] = setTimeout(tick, 0);
}
// Landing EXECUTE's rebuild+restart affordance (web-msnqeegt-ki7dm0): set true
// for a project id while a self-hosted land's fire-and-forget rebuild+restart
// is presumed in flight, so the LANDING panel keeps showing a "rebuilding…"
// state across the periodic re-renders instead of racing a normal /api/landing
// fetch against a server that's about to swap itself out. Cleared on a timeout
// rather than a health probe — simple, and matches the server side's own
// fire-and-forget stance (never blocks/awaits the rebuild).
var landingRestarting = {}; // project id -> true while presumed rebuilding
var LANDING_RESTART_GRACE_MS = 20000;
function landingSection(pid, flightLog, tasks) {
  var wrap = el('section', 'landing-panel');
  wrap.appendChild(el('h3', 'landing-title', '🛬 Landing'));
  var body = el('div', 'landing-body');
  if (landingRestarting[pid]) {
    var restartingEl = el('p', 'muted landing-restarting', '🔄 Landed — rebuilding & restarting the dashboard… this page reconnects automatically.');
    restartingEl.setAttribute('role', 'status');
    restartingEl.setAttribute('aria-live', 'polite');
    body.appendChild(restartingEl);
    wrap.appendChild(body);
    return wrap;
  }
  body.appendChild(el('p', 'muted', 'Checking for unmerged work…'));
  wrap.appendChild(body);
  fetch('/api/landing?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { landing: null }; })
    .then(function (data) {
      // The panel may have been re-rendered (SSE tick / UI toggle) while this
      // request was in flight — appending into a detached node is a stale
      // paint at best and a DOM error at worst. Bail if we're orphaned.
      if (!body.isConnected) return;
      renderLandingBody(body, data && data.landing, pid, flightLog, tasks);
    })
    .catch(function () {
      if (!body.isConnected) return;
      body.replaceChildren(el('p', 'muted', 'Landing preview unavailable.'));
    });
  return wrap;
}
// EXECUTE the landing (event-delegated so it survives card re-renders).
// Confirms first — this runs a real gate, then a real git merge. The result
// (landed, or an honest refusal with the gate/merge detail) renders in place
// instead of an alert(); the fleet refresh below picks up the branch's new
// state on the next poll/SSE tick. landingExecuteResult is generated FROM
// web/landing-panel.ts below (epic 0002 "shell decomposition", slice 2,
// forty-third cut) — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift apart.
${landingExecuteResult.toString()}
// landingJobLine renders the live job state the poller fetches — generated
// FROM web/landing-panel.ts (operator directive 2026-08-30, durable landing
// jobs) via .toString(), never a hand-retyped copy.
${landingJobLine.toString()}
// landingExecuteConfirmMessage is generated FROM web/landing-panel.ts below
// (BOARD web-msw5zxfi-oa2olf: "flag for lead consolidation instead of blind
// merge") — its real compiled source via .toString(), not a hand-retyped
// copy. It can no longer drift apart.
${landingExecuteConfirmMessage.toString()}
// landingExecuteTip is generated FROM web/landing-panel.ts below (app-wide
// interactivity audit v2, web-msm66jlc-gm4oom) — its real compiled source
// via .toString(), not a hand-retyped copy. It can no longer drift apart.
${landingExecuteTip.toString()}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-land-execute]');
  if (!b) return;
  var pid = b.getAttribute('data-land-execute');
  var overlapBranchesAttr = b.getAttribute('data-land-overlap-branches');
  var overlapBranches = overlapBranchesAttr ? JSON.parse(overlapBranchesAttr) : [];
  if (!window.confirm(landingExecuteConfirmMessage(overlapBranches))) return;
  b.disabled = true;
  // Start following the job IMMEDIATELY — before the POST even resolves — so
  // the operator sees the gate's real progress within a poll tick instead of a
  // silent, minutes-long "Landing…". The poller owns every paint from here.
  landingJobs[pid] = { phase: 'gate', startedAt: Date.now(), steps: [] };
  landingPaintJob(pid);
  landingPollJob(pid);
  fetch('/api/landing/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var ok = r.data && r.data.ok;
      var restarting = !!(ok && r.data.restarting);
      if (restarting) {
        // Self-hosted land: a rebuild+restart is now in flight server-side
        // (fire-and-forget). renderFleet skips its rebuild when the polled data
        // is unchanged (see the phase/firing drill-down handlers below for the
        // same forced-rebuild pattern) — a land alone doesn't change
        // firings/cost, so without forcing it the panel would never actually
        // repaint into the restarting state. That forced re-render replaces
        // this button/result pair with the LANDING panel's own affordance, so
        // there is nothing further to paint here.
        landingRestarting[pid] = true;
        if (lastFleetState) { lastFleetSig = null; renderFleet(lastFleetState); }
        setTimeout(function () {
          delete landingRestarting[pid];
          if (lastFleetState) { lastFleetSig = null; renderFleet(lastFleetState); }
        }, LANDING_RESTART_GRACE_MS);
        return;
      }
      // A rejected request (rate limit, unavailable) carries no job to follow —
      // paint it directly. Every other outcome, including a flight-running
      // refusal that the server is now self-healing in the background, is the
      // poller's story to tell.
      if (r.status >= 400 && !ok) {
        landingJobs[pid] = { phase: 'finished', startedAt: Date.now(), result: r.data };
        landingPaintJob(pid);
      }
    })
    .catch(function () {
      // The request itself failed (dropped connection, mid-restart). The job may
      // still be running server-side, so let the poller resolve the truth rather
      // than asserting a failure the operator can't act on.
      landingPollJob(pid);
    });
});
// Shared roving-tabindex wiring (APG pattern) — wireRoving/seedRoving are
// hoisted function declarations from fleetJs()'s text in the same
// concatenated bundle, the exact top-level call shape flight-summary.ts and
// coordination.ts already rely on. One registration covers every roving
// group this panel renders: commit rows (top-level and nested alike),
// the branch line, the overlap alert list, the diffstat chip line, and the
// flight debrief's chip/notable lines. The debrief best/worst spans stay
// plain tabindex=0 — each is already its line's only stop, so no group
// selector names them and the delegated handlers leave them alone.
wireRoving(
  '.landing-panel [tabindex]',
  '.landing-commit, .landing-branch, .landing-overlaps, .landing-diffstat, .flight-debrief-chips, .flight-debrief-notable',
);
`.trim();
}
