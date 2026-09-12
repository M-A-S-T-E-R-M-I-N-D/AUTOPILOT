// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's KEEPER DISCUSSIONS panel (epic 0007 S8, board
 * web-mtlsiac0-v8rksh) — the operator panel the epic's own STATUS note
 * flagged as the last deferred slice after the decision core, the GraphQL
 * read/write wiring, and the identity-gated `GET /api/discussions-triage` +
 * `POST /api/discussions-triage/execute` pair all shipped with zero
 * dashboard consumer (UX-expression doctrine: a capability with no panel is
 * a slice, not complete). Fetches the preview on mount, renders every open
 * discussion's planned decision (`accept`/`skip`) via
 * `discussions-triage-panel.ts`'s `discussionsTriageItems`, and shows a "Run
 * KEEPER Discussions triage" execute button whenever
 * `discussionsTriageCanExecute` allows it — a confirmed maintainer (or an
 * unresolved identity, not a known guest) AND at least one `'accept'`ed plan.
 *
 * Repo-scoped like `pr-review.ts`, NOT project-scoped like `issue-triage.ts`/
 * `mirror-pass.ts`: both API endpoints take no `?project=`/body parameter at
 * all (`flight/discussions-triage-execute.ts`'s `DiscussionsTriagePreviewApi`/
 * `DiscussionsTriageExecuteApi` are both zero-argument), since `gh` resolves
 * `{owner}`/`{repo}` from the dashboard process's own cwd. `pid` is still
 * threaded through `discussionsTriageSection(pid)` purely for call-site
 * uniformity with the other KEEPER panels `renderProjectPage()` builds —
 * never read inside this module.
 *
 * `web/shell.ts`'s `clientJs()` calls this indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; `discoverFeatureModules('web/
 * features')` finds this file's `discussionsTriageJs` export the same way it
 * already finds `mirror-pass.ts`'s. `discussionsTriageSection(pid)` (declared
 * below) is called from `fleetJs()`'s `renderProjectPage()` — a bare,
 * unimported identifier reference in `fleetJs()`'s own served text, hoisted
 * the same way `mirrorPassSection`'s call site already relies on.
 * `socialIdentity()` is `web/shell.ts`'s own hoisted core helper — ONE
 * identity read per page load, shared with every other role-gated panel.
 *
 * i18n: the title, loading placeholder, and the empty/unavailable/execute
 * states carry their English default AND a `data-i18n` tag, then are swept
 * by `translateDom()` — same split `mirror-pass.ts` already follows: the
 * title rides the page-level sweep, the async states call `translateDom()`
 * themselves since they land after that tick's sweep already ran. The
 * confirm dialog, the in-flight "Running…" label, and the click handler's
 * own request-failed line call `tr()` directly at paint time instead, the
 * same shape `mirror-pass.ts`'s own EXECUTE handler follows.
 * `discussionsTriageExecuteResultMessage`'s server-outcome lines (skip
 * reasons, reply counts) are spliced pure helpers with no `tr` in scope and
 * stay English for now, same deferred-i18n stance `mirror-pass.ts`'s own
 * result formatter takes.
 */
import {
  discussionsTriageDecisionLabel,
  discussionsTriageItems,
  discussionsTriageCanExecute,
  discussionsTriageConfirmMessage,
  discussionsTriageExecuteResultMessage,
} from '../discussions-triage-panel.js';

/** The KEEPER DISCUSSIONS panel client — vanilla, external (keeps CSP script-src 'self'). */
export function discussionsTriageJs(): string {
  return `
// The four functions below are generated FROM web/discussions-triage-panel.ts
// (epic 0007 S8, board web-mtlsiac0-v8rksh) — their real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
// discussionsTriageItems calls discussionsTriageDecisionLabel internally, so
// that helper must be spliced in too (mirror-pass.ts's mirrorPassItems
// splices all four of its own callees for the same reason) — a lone
// discussionsTriageItems.toString() throws ReferenceError the moment it
// runs, since discussionsTriageDecisionLabel would not exist in this
// generated scope.
${discussionsTriageDecisionLabel.toString()}
${discussionsTriageItems.toString()}
${discussionsTriageCanExecute.toString()}
${discussionsTriageConfirmMessage.toString()}
${discussionsTriageExecuteResultMessage.toString()}
function renderDiscussionsTriageBody(body, plans, canExecute) {
  body.replaceChildren();
  plans = plans || [];
  var items = discussionsTriageItems(plans);
  if (!items.length) {
    var emptyMsg = el('p', 'muted', 'No open discussions to triage.');
    emptyMsg.setAttribute('data-i18n', 'discussionsTriageEmpty');
    body.appendChild(emptyMsg);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var list = el('ul', 'discussions-triage-list');
  for (var i = 0; i < items.length; i++) {
    list.appendChild(el('li', 'discussions-triage-item', items[i].text));
  }
  body.appendChild(list);
  if (canExecute) {
    var actions = el('div', 'discussions-triage-actions');
    var execBtn = el('button', 'discussions-triage-execute', 'Run KEEPER Discussions triage');
    execBtn.type = 'button';
    execBtn.setAttribute('data-i18n', 'discussionsTriageExecute');
    execBtn.setAttribute('data-discussions-triage-execute', '');
    var execTip =
      'Posts a signed reply and applies the pool label to every accepted discussion above via gh.';
    execBtn.setAttribute('data-tip', execTip);
    execBtn.setAttribute('data-i18n-tip', 'discussionsTriageExecuteTip');
    execBtn.setAttribute('aria-label', execTip);
    execBtn.setAttribute('data-i18n-aria', 'discussionsTriageExecuteTip');
    actions.appendChild(execBtn);
    body.appendChild(actions);
    var resultEl = el('div', 'discussions-triage-result');
    resultEl.setAttribute('role', 'status');
    resultEl.setAttribute('aria-live', 'polite');
    body.appendChild(resultEl);
  }
  translateDom(document.documentElement.lang || 'en');
}
var discussionsTriagePlans = [];
function loadDiscussionsTriageBody(body) {
  Promise.all([
    fetch('/api/discussions-triage').then(function (r) { return r.ok ? r.json() : { triage: null }; }),
    socialIdentity(),
  ])
    .then(function (results) {
      if (!body.isConnected) return;
      var plans = (results[0] && results[0].triage && results[0].triage.plans) || [];
      discussionsTriagePlans = plans;
      var identity = results[1] && results[1].identity;
      renderDiscussionsTriageBody(body, plans, discussionsTriageCanExecute(identity, plans));
    })
    .catch(function () {
      if (!body.isConnected) return;
      var unavailableMsg = el('p', 'muted', 'Discussions triage unavailable.');
      unavailableMsg.setAttribute('data-i18n', 'discussionsTriageUnavailable');
      body.replaceChildren(unavailableMsg);
      translateDom(document.documentElement.lang || 'en');
    });
}
function discussionsTriageSection(pid) {
  var wrap = el('section', 'discussions-triage-panel');
  var title = el('h3', 'discussions-triage-title', '💬 KEEPER Discussions triage');
  title.setAttribute('data-i18n', 'discussionsTriageTitle');
  wrap.appendChild(title);
  var body = el('div', 'discussions-triage-body');
  var loadingMsg = el('p', 'muted', 'Checking open discussions against the board…');
  loadingMsg.setAttribute('data-i18n', 'discussionsTriageLoading');
  body.appendChild(loadingMsg);
  wrap.appendChild(body);
  loadDiscussionsTriageBody(body);
  return wrap;
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-discussions-triage-execute]');
  if (!b || b.disabled) return;
  if (!window.confirm(discussionsTriageConfirmMessage(discussionsTriagePlans))) return;
  var body = b.closest('.discussions-triage-body');
  var resultEl = body && body.querySelector('.discussions-triage-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('discussionsTriageExecuting');
  fetch('/api/discussions-triage/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = discussionsTriageExecuteResultMessage(r.status, r.data);
      if (result.className.indexOf('discussions-triage-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // A clean run posted real replies and applied real labels — reload so
      // the panel reflects reality instead of the stale preview, same
      // "success re-fetches" convention issue-triage.ts/mirror-pass.ts's
      // own EXECUTE buttons use.
      if (body) loadDiscussionsTriageBody(body);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'discussions-triage-result discussions-triage-result-fail';
        resultEl.textContent = tr('discussionsTriageRequestFailed');
      }
    });
});
`.trim();
}
