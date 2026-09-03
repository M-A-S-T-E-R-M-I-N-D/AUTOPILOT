// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's KEEPER issue-triage panel — a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/round-panel.ts` for the prior extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; moving the function itself (not
 * splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's
 * `issueTriageJs` export the same way it already finds `round-panel.ts`'s.
 * Like `tour.ts`/`flight-console.ts`/`docs-viewer.ts`, this panel keeps its
 * own module-level state — `issueTriagePlansByProject`, a pid-keyed map
 * surviving between the preview render and the execute click handler — the
 * same self-contained-state shape those cuts already proved extractable: no
 * read of `lastFleetState` or any other fleet-wide mutable state `fleetJs()`
 * owns.
 *
 * `issueTriageSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is one concatenated non-module script (`clientJs()` =
 * `fleetJs()` + `featureModulesJs()`): `issueTriageSection` is a hoisted
 * `function` declaration, and by the time `renderProjectPage()` actually
 * calls it (only once a project page is opened, well after the whole script
 * has already run once), every feature module's functions — this one
 * included — are already defined in the same shared top-level scope, the
 * same way `round-panel.ts`'s `roundSection` call site already relies on.
 * `el`/`tipChip`, called by name inside this module, hoist the same way
 * from `fleetJs()`'s own top-level declarations. `decisionItemHeadMeta` —
 * shared with the KEEPER PR review panel, which stays inline in `fleetJs()`
 * — hoists the same way from `shell.ts`'s own splice of
 * `web/decision-item.ts`, rather than being re-spliced here.
 */
import {
  issueTriageDecisionLabel,
  issueTriageConfirmMessage,
  issueTriageExecuteResult,
  issueTriageExecuteTip,
} from '../issue-triage-panel.js';

/** The KEEPER issue-triage panel client — vanilla, external (keeps CSP script-src 'self'). */
export function issueTriageJs(): string {
  return `
// KEEPER ISSUE TRIAGE (BOARD web-mss50i9u-ldv513, "PLATFORM 3/7"): GET
// /api/issue-triage?project= previews every open GitHub issue's planned
// decision — accept (label + comment + new board task) or duplicate (comment
// only) — and POST /api/issue-triage/execute (confirm-guarded below) re-runs
// the whole ritual fresh against gh. This is the operator-facing surface
// flight/issue-triage-execute.ts's header comment flagged as a deferred
// follow-up slice. Project-scoped (unlike KEEPER PR review, which acts on
// the one canonical repo regardless of project) — fetched on demand once per
// project page load, same not-worth-polling-every-tick reasoning as the
// backlog/release panels above, and hidden entirely when there are no open
// issues to triage. issueTriageDecisionLabel/issueTriageConfirmMessage/
// issueTriageExecuteResult are generated FROM web/issue-triage-panel.ts
// below — their real compiled source via .toString(), not a hand-retyped
// copy. They can no longer drift apart.
${issueTriageDecisionLabel.toString()}
${issueTriageConfirmMessage.toString()}
${issueTriageExecuteResult.toString()}
// issueTriageExecuteTip is generated FROM web/issue-triage-panel.ts below
// (app-wide interactivity audit v2, web-msm66jlc-gm4oom) — its real compiled
// source via .toString(), not a hand-retyped copy. It can no longer drift
// apart.
${issueTriageExecuteTip.toString()}
var issueTriagePlansByProject = {};
function renderIssueTriageBody(body, plans, pid) {
  body.replaceChildren();
  plans = plans || [];
  if (!plans.length) {
    body.appendChild(el('p', 'muted', 'No open issues to triage.'));
    return;
  }
  var list = el('div', 'issue-triage-list');
  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i];
    var item = el('div', 'issue-triage-item');
    var head = el('div', 'issue-triage-head');
    var issueNumberEl = el('span', 'issue-triage-number', '#' + plan.issue.number);
    // D1 TAB-STOP ROVING (epic 0015): one Tab stop for the whole list — a
    // busy triage round would otherwise cost one Tab press per open issue.
    // wireRoving() below moves it.
    issueNumberEl.setAttribute('tabindex', i === 0 ? '0' : '-1');
    var label = issueTriageDecisionLabel(plan.decision.decision);
    var headMeta = decisionItemHeadMeta(
      'GitHub issue',
      'issue',
      'issue-triage',
      plan.issue,
      plan.decision.decision,
      label,
      plan.decision.reasoning
    );
    issueNumberEl.setAttribute('data-tip', headMeta.numberTip);
    issueNumberEl.setAttribute('aria-label', headMeta.numberAriaLabel);
    head.appendChild(issueNumberEl);
    head.appendChild(tipChip(headMeta.badgeText, headMeta.badgeTip, headMeta.badgeAriaLabel, headMeta.badgeClass));
    item.appendChild(head);
    item.appendChild(el('p', 'issue-triage-issue-title', plan.issue.title));
    list.appendChild(item);
  }
  body.appendChild(list);
  var actions = el('div', 'issue-triage-actions');
  var execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'issue-triage-execute';
  execBtn.textContent = '🗝️ Run KEEPER triage';
  execBtn.setAttribute('data-issue-triage-execute', pid);
  var triageExecTip = issueTriageExecuteTip(plans);
  execBtn.setAttribute('data-tip', triageExecTip);
  execBtn.setAttribute('aria-label', triageExecTip);
  actions.appendChild(execBtn);
  body.appendChild(actions);
  body.appendChild(el('div', 'issue-triage-result'));
}
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the same top-level call shape coordination.ts already relies on.
// Delegated on document, so renderIssueTriageBody's wholesale re-renders
// keep working without re-wiring.
wireRoving('.issue-triage-number', '.issue-triage-list');
function loadIssueTriageBody(body, pid) {
  fetch('/api/issue-triage?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { triage: null }; })
    .then(function (data) {
      if (!body.isConnected) return;
      var plans = (data && data.triage) || [];
      issueTriagePlansByProject[pid] = plans;
      renderIssueTriageBody(body, plans, pid);
    })
    .catch(function () {
      if (!body.isConnected) return;
      body.replaceChildren(el('p', 'muted', 'Issue triage unavailable.'));
    });
}
function issueTriageSection(pid) {
  var wrap = el('section', 'issue-triage-panel');
  wrap.appendChild(el('h3', 'issue-triage-title', '🗝️ KEEPER issue triage'));
  var body = el('div', 'issue-triage-body');
  body.appendChild(el('p', 'muted', 'Checking open issues against the board…'));
  wrap.appendChild(body);
  loadIssueTriageBody(body, pid);
  return wrap;
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-issue-triage-execute]');
  if (!b) return;
  var pid = b.getAttribute('data-issue-triage-execute');
  var plans = issueTriagePlansByProject[pid] || [];
  if (!window.confirm(issueTriageConfirmMessage(plans))) return;
  var body = b.closest('.issue-triage-body');
  var resultEl = body && body.querySelector('.issue-triage-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = 'Triaging…';
  fetch('/api/issue-triage/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = issueTriageExecuteResult(r.data);
      if (result.className.indexOf('issue-triage-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // A clean apply changed real issues' state (labels/comments posted,
      // board tasks created) — reload so the panel reflects reality (an
      // accepted issue now matches its own new board task and reads as a
      // duplicate on the next preview) instead of the stale plan, same
      // "success re-fetches" convention release/landing/pr-review execute use.
      if (body) loadIssueTriageBody(body, pid);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'issue-triage-result issue-triage-result-fail';
        resultEl.textContent = '✗ Request failed — try again shortly.';
      }
    });
});
`.trim();
}
