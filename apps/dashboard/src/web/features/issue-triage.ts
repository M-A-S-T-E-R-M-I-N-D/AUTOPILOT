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
 *
 * i18n (board web-msnsndki-dz3vn1): the title and the loading placeholder
 * (built once, synchronously, when a project's panel first mounts) and the
 * empty/fetch-failure states (rebuilt inside the async `/api/issue-triage`
 * handlers) carry their English default AND a `data-i18n` tag, then are
 * swept by `translateDom()` (a bare hoisted identifier from
 * `web/features/locale.ts`'s splice, same as `fleetJs()`'s call sites) — the
 * title and the loading placeholder ride the page-level sweep that follows
 * every `renderProjectPage()` tick, while the two async states call
 * `translateDom()` themselves since they can land well after that tick's
 * sweep already ran, the exact split `web/features/flight-console.ts` and
 * `coordination.ts` already follow. The execute button (`issueTriageExecute`)
 * is built inside that same async path, so it gets the same `data-i18n` tag
 * plus its own `translateDom()` call at the end of the non-empty branch. Its
 * two transient states — the in-flight `Triaging…` label and the click
 * handler's own request-failed message — are never left standing long enough
 * for a page-level or language-switch sweep to matter, so they call `tr()`
 * directly at paint time instead of carrying a `data-i18n` tag, the same
 * shape `shell.ts`'s `githubSyncing`/`githubRequestFailed` and
 * `pool-client.ts`'s `poolClaiming` already use.
 */
import {
  issueTriageDecisionLabel,
  issueTriageConfirmMessage,
  issueTriageExecuteResult,
  issueTriageExecuteTip,
  issueTriageHasWork,
  issueTriageNothingToRunTip,
  issueTriageGuestNote,
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
${issueTriageHasWork.toString()}
${issueTriageNothingToRunTip.toString()}
// issueTriageGuestNote is generated FROM web/issue-triage-panel.ts below
// (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899) — its real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart.
${issueTriageGuestNote.toString()}
var issueTriagePlansByProject = {};
function renderIssueTriageBody(body, plans, pid, identity) {
  body.replaceChildren();
  plans = plans || [];
  if (!plans.length) {
    var emptyMsg = el('p', 'muted', 'No open issues to triage.');
    emptyMsg.setAttribute('data-i18n', 'issueTriageEmpty');
    body.appendChild(emptyMsg);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var list = el('div', 'issue-triage-list');
  for (var i = 0; i < plans.length; i++) {
    var plan = plans[i];
    var item = el('div', 'issue-triage-item');
    var head = el('div', 'issue-triage-head');
    // The number is a real link when gh reported the issue's own url (epic
    // 0020 "the legible surface" slice 3 — operator, 2026-09-09: "אם אנחנו
    // מביאים מידע מהGITHUB למה אנחנו לא יכולים לקשר באופן ישיר"). An <a>
    // only when there IS a url: a link element that goes nowhere is worse
    // than plain text. rel=noreferrer on a _blank target is the standard
    // reverse-tabnabbing guard — same pattern as pr-review.ts's own
    // PR-number link and pool-client.ts's issue-number link.
    var issueNumberEl = plan.issue.url
      ? el('a', 'issue-triage-number issue-triage-number-link', '#' + plan.issue.number)
      : el('span', 'issue-triage-number', '#' + plan.issue.number);
    if (plan.issue.url) {
      issueNumberEl.setAttribute('href', plan.issue.url);
      issueNumberEl.setAttribute('target', '_blank');
      issueNumberEl.setAttribute('rel', 'noopener noreferrer');
    }
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
    // Real GitHub labels, rendered as chips (epic 0020 "the legible surface"
    // slice 3, board web-mtt8loci-8hnte4, "labels render as real chips") — gh
    // already reports each open issue's label names (flight/issue-triage.ts's
    // IncomingIssue.labels) and they reached this far only to be discarded;
    // the same "if we fetched it, we can show it" principle the issue-number
    // link above already applies. No color data comes back from gh's labels
    // field, so every chip renders in the shared neutral chip style rather
    // than fabricating a color the API never reported.
    if (plan.issue.labels && plan.issue.labels.length) {
      var labelsRow = el('div', 'issue-triage-labels');
      for (var li = 0; li < plan.issue.labels.length; li++) {
        var labelName = plan.issue.labels[li];
        var labelTip = 'GitHub label: ' + labelName;
        labelsRow.appendChild(tipChip(labelName, labelTip, labelTip, 'issue-triage-label-chip'));
      }
      item.appendChild(labelsRow);
    }
    list.appendChild(item);
  }
  body.appendChild(list);
  // Role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899):
  // a confirmed non-owner of this repo is a guest — it sees the preview
  // above but never the KEEPER execute button. An unresolved identity (no
  // gh, no GitHub remote at all — the common fully-local project) is NOT a
  // known guest, so it falls through and the button renders exactly as
  // before.
  if (identity && identity.role === 'user') {
    var guestNote = el('p', 'muted issue-triage-guest-note', issueTriageGuestNote(identity));
    // i18n (epic 0019 law 1's role gate, board web-mtt3f7j6-3bj899): the
    // English literal above stays as the byte-identical default; this
    // two-slot template + args map let the translateDom() call below (and
    // every later locale switch) repaint it in the active locale.
    guestNote.setAttribute('data-i18n-template', 'issueTriageGuestNote');
    guestNote.setAttribute(
      'data-i18n-args',
      JSON.stringify({ owner: identity.nameWithOwner.split('/')[0], login: identity.login }),
    );
    body.appendChild(guestNote);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var actions = el('div', 'issue-triage-actions');
  var execBtn = document.createElement('button');
  execBtn.type = 'button';
  execBtn.className = 'issue-triage-execute';
  execBtn.textContent = '🗝️ Run KEEPER triage';
  execBtn.setAttribute('data-i18n', 'issueTriageExecute');
  execBtn.setAttribute('data-issue-triage-execute', pid);
  // Disabled-with-reason law: an all-skip round has nothing to execute, so
  // the button says exactly that instead of inviting a no-op confirm.
  var triageExecTip = issueTriageHasWork(plans)
    ? issueTriageExecuteTip(plans)
    : issueTriageNothingToRunTip(plans.length);
  if (!issueTriageHasWork(plans)) {
    execBtn.disabled = true;
    execBtn.setAttribute('aria-disabled', 'true');
  }
  execBtn.setAttribute('data-tip', triageExecTip);
  execBtn.setAttribute('aria-label', triageExecTip);
  actions.appendChild(execBtn);
  body.appendChild(actions);
  body.appendChild(el('div', 'issue-triage-result'));
  translateDom(document.documentElement.lang || 'en');
}
// Shared roving-tabindex wiring (APG pattern) — wireRoving is a hoisted
// function declaration from fleetJs()'s text in the same concatenated
// bundle, the same top-level call shape coordination.ts already relies on.
// Delegated on document, so renderIssueTriageBody's wholesale re-renders
// keep working without re-wiring.
wireRoving('.issue-triage-number', '.issue-triage-list');
function loadIssueTriageBody(body, pid) {
  // Role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899):
  // fetched alongside the triage preview, never blocking it — a failed
  // identity read (own .catch()) still lets the panel render, since an
  // unresolved identity means "not a known guest", not "unavailable".
  // socialIdentity() is a hoisted core helper — one read per page load,
  // shared with every other role-gated panel.
  var identityFetch = socialIdentity();
  var plansFetch = fetch('/api/issue-triage?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { triage: null }; });
  Promise.all([plansFetch, identityFetch])
    .then(function (results) {
      if (!body.isConnected) return;
      var data = results[0];
      var identityData = results[1];
      var plans = (data && data.triage) || [];
      issueTriagePlansByProject[pid] = plans;
      renderIssueTriageBody(body, plans, pid, identityData && identityData.identity);
    })
    .catch(function () {
      if (!body.isConnected) return;
      var unavailableMsg = el('p', 'muted', 'Issue triage unavailable.');
      unavailableMsg.setAttribute('data-i18n', 'issueTriageUnavailable');
      body.replaceChildren(unavailableMsg);
      translateDom(document.documentElement.lang || 'en');
    });
}
function issueTriageSection(pid) {
  var wrap = el('section', 'issue-triage-panel');
  var title = el('h3', 'issue-triage-title', '🗝️ KEEPER issue triage');
  title.setAttribute('data-i18n', 'issueTriageTitle');
  wrap.appendChild(title);
  var body = el('div', 'issue-triage-body');
  var loadingMsg = el('p', 'muted', 'Checking open issues against the board…');
  loadingMsg.setAttribute('data-i18n', 'issueTriageLoading');
  body.appendChild(loadingMsg);
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
  b.textContent = tr('issueTriageExecuting');
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
        resultEl.textContent = tr('issueTriageRequestFailed');
      }
    });
});
`.trim();
}
