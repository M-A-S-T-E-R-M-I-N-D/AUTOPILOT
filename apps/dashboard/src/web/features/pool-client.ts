// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The operator-facing POOL CLIENT panel (epic 0007
 * "docs/epics/0007-platform-maintainer-and-pool.md" slice 6, "PLATFORM
 * 6/7") — browses every open pool issue paired with its claim-or-skip
 * decision for the caller's own gh identity (`GET /api/pool-client`) and
 * claims one (`POST /api/pool-client/execute`, confirm-guarded), a whole
 * bundle-composing region extracted out of `shell.ts`'s `fleetJs()` into its
 * own file under `web/features/` (epic 0002 "shell decomposition", SHELL
 * HUB RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/pr-review.ts` for the prior extraction of this exact shape).
 * `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so the return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the region
 * (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `poolClientJs`
 * export the same way it already finds `pr-review.ts`'s `prReviewJs`. Like
 * `pr-review.ts`'s KEEPER panel, this one is independent of any flown
 * project — a co-pilot claims a pool issue for themselves, not on behalf of
 * a stored project — so it initializes itself on its own 30s poll timer at
 * the bottom of this module (`loadPoolClientPanel()`/`setInterval(...)`)
 * rather than being called from `renderProjectPage()` like a per-project
 * panel, and it keeps its own module-level state
 * (`POOL_CLIENT_POLL_MS`/`poolClientEntriesByNumber`, read and written only
 * by the functions below) the same way `pr-review.ts` keeps
 * `PR_REVIEW_POLL_MS`/`prReviewPlansByNumber`. `lastPoolClientProjects` is a
 * second piece of module-level state unique to this panel: the operator's
 * own registered projects, kept in sync from the live fleet state so the
 * "fly locally" project picker can render before the panel's own poll ever
 * fires. `poolClaimDecisionLabel`/`poolClaimConfirmMessage`/
 * `poolClaimExecuteResult`/`poolClaimExecuteTip` are generated FROM
 * `web/pool-client-panel.ts` below — their real compiled source via
 * `.toString()`, not a hand-retyped copy — now resolved relative to this
 * file instead of `shell.ts`. `el`/`tipChip` stay inline in `fleetJs()` —
 * broadly shared DOM primitives, already relied on the same way by
 * `web/features/pr-review.ts` — called by name inside this module, hoisting
 * the same way every whole-region move already depends on for them.
 *
 * `syncPoolClientProjects` (declared below) is called from `fleetJs()`'s
 * `renderFleet()` at both its pinned-project and fleet-wide branches — call
 * sites that stay bare, unimported identifier references in `fleetJs()`'s
 * own served text. That works because the served bundle is one concatenated
 * non-module script (`clientJs()` = `fleetJs()` + `featureModulesJs()`):
 * `syncPoolClientProjects` is a hoisted `function` declaration, and by the
 * time `renderFleet()` actually calls it (only once a live fleet tick
 * arrives, well after the whole script has already run once), every feature
 * module's functions — this one included — are already defined in the same
 * shared top-level scope, the same way `pr-review.ts`'s own self-init
 * already relies on for `el`/`tipChip`.
 *
 * I18N (board web-msnsndki-dz3vn1, `@autopilot/tokens`'s `strings.ts`) —
 * `renderPoolClientPanel()`'s "🧑‍🤝‍🧑 Pool" heading is an `el()`-built
 * `<h3>` the regex `pnpm i18n:untagged` scanner cannot see, the same blind
 * spot `pipelineJs()`'s and `flightSummarySection()`'s titles had; it is
 * tagged `data-i18n="poolTitle"`. Like `pr-review.ts`'s KEEPER panel, this
 * one rebuilds on its own 30s poll timer rather than the fleet stream's
 * tick, so `renderPoolClientPanel()` also calls `translateDom()` itself at
 * the end of every render — otherwise a panel rebuilt after the page's
 * one-time `applyLocale()` call would render its freshly-tagged title in
 * English regardless of the active locale. Every OTHER per-entry string —
 * the "No local task" option, the project `<select>`'s aria-label/tip, the
 * Claim button (idle + "Claiming…"), the Fly button (idle + "Starting…"),
 * and the shared request-failed line — is built fresh on every render or
 * click instead, so those read straight off `tr()` at build time rather
 * than a `data-i18n` tag, the same split `report-menu.ts` uses for its own
 * built-fresh-on-open text.
 */
import {
  poolClaimDecisionLabel,
  poolClaimConfirmMessage,
  poolClaimExecuteResult,
  poolClaimExecuteTip,
  poolClaimFlyTip,
  poolClaimFlyResult,
} from '../pool-client-panel.js';

/** The POOL CLIENT panel client — vanilla, external (keeps CSP script-src 'self'). */
export function poolClientJs(): string {
  return `
// Pool client (epic 0007, "PLATFORM 6/7"): GET /api/pool-client browses
// every open pool issue paired with its claim-or-skip decision for the
// caller's own gh identity, and POST /api/pool-client/execute
// (confirm-guarded below) claims one. This is the operator-facing browse/
// claim panel docs/epics/0007-platform-maintainer-and-pool.md slice 6
// flagged as open. Independent of any flown project — same as KEEPER PR
// review above, a co-pilot claims for themselves, not on behalf of a stored
// project — so it polls on its own timer rather than riding the
// per-project SSE state, and the section stays hidden entirely when there
// is nothing open in the pool. poolClaimDecisionLabel/
// poolClaimConfirmMessage/poolClaimExecuteResult/poolClaimExecuteTip are
// generated FROM web/pool-client-panel.ts below — their real compiled
// source via .toString(), not a hand-retyped copy. They can no longer drift
// apart.
${poolClaimDecisionLabel.toString()}
${poolClaimConfirmMessage.toString()}
${poolClaimExecuteResult.toString()}
${poolClaimExecuteTip.toString()}
${poolClaimFlyTip.toString()}
${poolClaimFlyResult.toString()}
var POOL_CLIENT_POLL_MS = 30000;
var poolClientEntriesByNumber = {};
// The "fly locally" leg's project picker (epic 0007 slice 6): the operator's
// own registered projects, kept in sync from the live fleet state the same
// way syncSearchProjects/syncFlyFolderOptions are — a plain top-level cache
// rather than a live prop, since the panel renders independently on its own
// poll timer, not from renderFleet's state. loadPoolClientPanel() fires
// before startFleetStream() below, so the pool panel routinely renders
// before the first fleet state (and its project list) arrives — syncing the
// cache alone would leave an already-rendered picker permanently empty.
// refreshPoolClientProjectOptions() patches every already-rendered
// <select>'s options in place instead (preserving the current selection and
// any in-flight Claiming…/result text elsewhere in the panel), rather than
// re-rendering the whole panel and losing that state on every fleet tick.
var lastPoolClientProjects = [];
function refreshPoolClientProjectOptions() {
  var selects = document.querySelectorAll('.pool-client-project');
  for (var i = 0; i < selects.length; i++) {
    var sel = selects[i];
    var current = sel.value;
    sel.replaceChildren();
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = tr('poolNoLocalTask');
    sel.appendChild(noneOpt);
    for (var j = 0; j < lastPoolClientProjects.length; j++) {
      var proj = lastPoolClientProjects[j];
      var opt = document.createElement('option');
      opt.value = proj.id;
      opt.textContent = proj.name;
      sel.appendChild(opt);
    }
    sel.value = current;
  }
}
function syncPoolClientProjects(projects) {
  lastPoolClientProjects = projects || [];
  refreshPoolClientProjectOptions();
}
function renderPoolClientPanel(entries) {
  var section = document.getElementById('pool-client-panel');
  if (!section) return;
  entries = entries || [];
  poolClientEntriesByNumber = {};
  section.replaceChildren();
  // Guarded write: assigning the same boolean still queues a MutationObserver
  // record (attribute set, value-equal or not), and this runs every poll tick
  // — an idempotent tick must mutate nothing (cockpit epic 0015, D2 dedup).
  var poolPanelHidden = entries.length === 0;
  if (section.hidden !== poolPanelHidden) section.hidden = poolPanelHidden;
  if (entries.length === 0) return;
  var title = el('h3', 'pool-client-title', '🧑‍🤝‍🧑 Pool');
  title.setAttribute('data-i18n', 'poolTitle');
  section.appendChild(title);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    poolClientEntriesByNumber[entry.issue.number] = entry;
    var item = el('div', 'pool-client-item');
    var head = el('div', 'pool-client-head');
    var issueNumberEl = el('span', 'pool-client-number', '#' + entry.issue.number);
    // D1 TAB-STOP ROVING (epic 0015): one Tab stop for the whole panel — a
    // busy pool round would otherwise cost one Tab press per browsable
    // issue. wireRoving() below moves it.
    issueNumberEl.setAttribute('tabindex', i === 0 ? '0' : '-1');
    var label = poolClaimDecisionLabel(entry.decision.decision);
    issueNumberEl.setAttribute('data-tip', entry.decision.reasoning);
    issueNumberEl.setAttribute('aria-label', '#' + entry.issue.number + ': ' + entry.decision.reasoning);
    head.appendChild(issueNumberEl);
    var badgeClass = 'pool-client-badge-' + entry.decision.decision;
    head.appendChild(tipChip(label, entry.decision.reasoning, entry.decision.reasoning, badgeClass));
    item.appendChild(head);
    item.appendChild(el('p', 'pool-client-issue-title', entry.issue.title));
    var actions = el('div', 'pool-client-actions');
    if (entry.decision.decision === 'claim') {
      var projectSelect = document.createElement('select');
      projectSelect.className = 'pool-client-project';
      projectSelect.setAttribute('aria-label', tr('poolProjectSelectAria'));
      projectSelect.setAttribute('data-tip', tr('poolProjectSelectTip'));
      actions.appendChild(projectSelect);
      var claimBtn = document.createElement('button');
      claimBtn.type = 'button';
      claimBtn.className = 'pool-client-execute';
      claimBtn.textContent = tr('poolClaim');
      claimBtn.setAttribute('data-pool-client-execute', String(entry.issue.number));
      var claimTip = poolClaimExecuteTip(entry.issue, entry.decision);
      claimBtn.setAttribute('data-tip', claimTip);
      claimBtn.setAttribute('aria-label', claimTip);
      actions.appendChild(claimBtn);
    }
    item.appendChild(actions);
    item.appendChild(el('div', 'pool-client-result'));
    section.appendChild(item);
  }
  refreshPoolClientProjectOptions();
  // This panel rebuilds on its own 30s poll (POOL_CLIENT_POLL_MS below), not
  // the fleet stream's tick, so it needs the same fix renderFleet()/
  // renderPrReviewPanel() apply: a data-i18n element built after the page's
  // one-time applyLocale() call would otherwise render in English regardless
  // of the active locale (board web-msnsndki-dz3vn1).
  translateDom(document.documentElement.lang || 'en');
}
function loadPoolClientPanel() {
  fetch('/api/pool-client', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
    .then(function (data) { renderPoolClientPanel(data && data.entries); })
    .catch(function () {});
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-pool-client-execute]');
  if (!b) return;
  var number = parseInt(b.getAttribute('data-pool-client-execute'), 10);
  var entry = poolClientEntriesByNumber[number];
  if (!entry) return;
  var item = b.closest('.pool-client-item');
  var projectSelect = item && item.querySelector('.pool-client-project');
  var projectId = projectSelect ? projectSelect.value : '';
  var projectName = projectId && projectSelect.options[projectSelect.selectedIndex]
    ? projectSelect.options[projectSelect.selectedIndex].textContent
    : '';
  if (!window.confirm(poolClaimConfirmMessage(entry.issue, entry.decision, projectName))) return;
  var resultEl = item && item.querySelector('.pool-client-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('poolClaiming');
  var body = { number: number };
  if (projectId) body.project = projectId;
  fetch('/api/pool-client/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = poolClaimExecuteResult(r.data);
      if (result.className.indexOf('pool-client-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // A queued local board task (epic 0007 slice 6's last-noted open item)
      // can be flown right from here — find the picked project's rootPath
      // (the same field the fly bar's folder datalist reads) and offer a
      // "Fly" button instead of silently reloading, so the success message
      // and the affordance both stay on screen for the operator to act on.
      var flyProject = null;
      if (result.offerFly) {
        for (var pi = 0; pi < lastPoolClientProjects.length; pi++) {
          if (lastPoolClientProjects[pi].id === projectId) { flyProject = lastPoolClientProjects[pi]; break; }
        }
      }
      if (!flyProject || !flyProject.rootPath) {
        // A clean claim changed the issue's state (assignee + comment
        // posted) — reload the panel so it reflects reality instead of the
        // stale entry, same "success re-fetches" convention pr-review
        // execute uses.
        loadPoolClientPanel();
        return;
      }
      var actionsEl = item && item.querySelector('.pool-client-actions');
      if (actionsEl) actionsEl.remove();
      if (resultEl) {
        resultEl.className = result.className;
        resultEl.textContent = result.text;
      }
      var flyBtn = document.createElement('button');
      flyBtn.type = 'button';
      flyBtn.className = 'pool-client-fly';
      flyBtn.textContent = tr('poolFly');
      var flyTip = poolClaimFlyTip(flyProject.name);
      flyBtn.setAttribute('data-tip', flyTip);
      flyBtn.setAttribute('aria-label', flyTip);
      flyBtn.addEventListener('click', function () {
        flyBtn.disabled = true;
        var flyOriginalText = flyBtn.textContent;
        flyBtn.textContent = tr('poolStarting');
        fetch('/api/fly', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ folder: flyProject.rootPath }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var flyResult = poolClaimFlyResult(data);
            var failed = flyResult.className.indexOf('pool-client-result-fail') !== -1;
            flyBtn.disabled = !failed;
            flyBtn.textContent = flyOriginalText;
            if (resultEl) {
              resultEl.className = flyResult.className;
              resultEl.textContent = flyResult.text;
            }
          })
          .catch(function () {
            flyBtn.disabled = false;
            flyBtn.textContent = flyOriginalText;
            if (resultEl) {
              resultEl.className = 'pool-client-result pool-client-result-fail';
              resultEl.textContent = tr('poolRequestFailed');
            }
          });
      });
      if (item) item.appendChild(flyBtn);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'pool-client-result pool-client-result-fail';
        resultEl.textContent = tr('poolRequestFailed');
      }
    });
});
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the same top-level call shape coordination.ts already relies on.
// Delegated on document, so renderPoolClientPanel's wholesale poll
// re-renders keep working without re-wiring.
wireRoving('.pool-client-number', '.pool-client-panel');
loadPoolClientPanel();
setInterval(loadPoolClientPanel, POOL_CLIENT_POLL_MS);
`.trim();
}
