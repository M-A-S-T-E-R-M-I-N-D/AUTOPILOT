// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's client — the second of `web/shell.ts`'s bundle-
 * composing assembler functions extracted into its own file under
 * `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK B's real
 * extraction — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/switcher.ts` for the first). `web/shell.ts`'s `clientJs()`
 * imports and calls it directly, so its return value — not its compiled
 * source — is what lands in the served `/app.js` text; moving the function
 * itself (not splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `connectJs`
 * export the same way it already finds `switcher.ts`'s. Unlike
 * `switcherJs()`, this one still carries real relative-import splices of its
 * own — `connectModeMeta`/`connectStatusMeta`/`connectTestResultMeta`,
 * embedded via `.toString()` — now resolved relative to this file instead of
 * `shell.ts`; a function's `.toString()` output is unaffected by which local
 * name imports it under, so this remains byte-for-byte the same generated
 * text.
 */
import {
  connectModeMeta,
  connectStatusMeta,
  connectTestResultMeta,
  ghStatusMeta,
  ghLtsMeta,
  githubIssueConfirmMessage,
  githubIssueExecuteResult,
  reportComposeStatusMeta,
} from '../connect-panel.js';

/** The CONNECT popover client — vanilla, external (keeps CSP script-src 'self'). */
export function connectJs(): string {
  return `
// Whether gh is signed in, as last resolved by loadGh() below. Read by the
// onboarding ladder (features/onboarding.ts) rather than re-fetched there:
// one request for one fact, which is also what the boot smoke test counts.
var apGhAuthenticated = false;
function connectInit() {
  var panel = document.getElementById('connect');
  if (!panel) return;
  var statusEl = document.getElementById('connect-status');
  var modeEl = document.getElementById('connect-mode');
  var secretEl = document.getElementById('connect-secret');
  var secretLabel = document.getElementById('connect-secret-label');
  var hintEl = document.getElementById('connect-hint');
  var form = document.getElementById('connect-form');
  var loginBtn = document.getElementById('connect-login');
  var testBtn = document.getElementById('connect-test');
  var dotEl = document.getElementById('conn-dot');
  var labelEl = document.getElementById('connect-label');
  var ghStatusEl = document.getElementById('gh-status');
  var ghHintEl = document.getElementById('gh-hint');
  var ghAuthEl = document.getElementById('gh-auth');
  var ghLoginBtn = document.getElementById('gh-login');
  var ghSwitchBtn = document.getElementById('gh-switch');
  var ghLogoutBtn = document.getElementById('gh-logout');
  var ghLtsEl = document.getElementById('gh-lts');
  var ghLtsCheckBtn = document.getElementById('gh-lts-check');
  var ghIssueForm = document.getElementById('gh-issue-form');
  var ghIssueAction = document.getElementById('gh-issue-action');
  var ghIssueTitle = document.getElementById('gh-issue-title');
  var ghIssueBody = document.getElementById('gh-issue-body');
  var ghIssueResult = document.getElementById('gh-issue-result');
  var ghIssueNote = document.getElementById('gh-issue-note');
  var ghIssueComposeBtn = document.getElementById('gh-issue-compose');
  var ghIssueComposeStatus = document.getElementById('gh-issue-compose-status');

  // App-wide interactivity audit v2 (web-msm66jlc-gm4oom): each button's
  // click has real consequences (opens a terminal, spends a billed claude
  // call, stores a credential, files a real upstream issue) — say so on
  // hover/focus BEFORE the click, like the connection dot already does.
  // i18n (board web-msnsndki-dz3vn1): each tip is a STRINGS key — setTip
  // writes tr(key) now AND tags data-i18n-tip so translateDom()'s sweep
  // retranslates it, the same two-part contract fly.ts's setTip uses. The
  // tag matters here for a different reason than fly.ts's TDZ: this module
  // rides the deferred /panels.js chunk (chunks.ts), which executes AFTER
  // core's tr() exists but BEFORE locale-data.ts (last in that same chunk)
  // widens STRINGS with the non-English tables — so a saved Hebrew locale
  // reads English here at init and settles into Hebrew on locale-data's own
  // re-sweep. Every status line below is written later still (a click or a
  // fetch callback), so its tr() reads the fully-widened table directly.
  function setTip(target, key) {
    if (!target) return;
    target.dataset.i18nTip = key;
    target.setAttribute('data-tip', tr(key));
  }
  setTip(loginBtn, 'connectLoginTip');
  setTip(testBtn, 'connectTestTip');
  var saveBtn = form ? form.querySelector('button[type="submit"]') : null;
  setTip(saveBtn, 'connectSaveTip');
  setTip(ghLtsCheckBtn, 'ghLtsCheckTip');
  setTip(ghLoginBtn, 'ghLoginTip');
  setTip(ghSwitchBtn, 'ghSwitchTip');
  setTip(ghLogoutBtn, 'ghLogoutTip');
  var ghIssueBtn = ghIssueForm ? ghIssueForm.querySelector('button[type="submit"]') : null;
  setTip(ghIssueBtn, 'ghIssueTip');
  setTip(ghIssueComposeBtn, 'reportComposeTip');

  // connectModeMeta/connectStatusMeta/connectTestResultMeta/ghStatusMeta/
  // ghLtsMeta/githubIssueConfirmMessage/githubIssueExecuteResult are
  // generated FROM web/connect-panel.ts below (epic 0002 "shell
  // decomposition", slice 2, forty-fourth/fifty-second/eighty-first cuts;
  // epic 0006 "GitHub connected mode", slices 4 "LTS chip" and 5 "contribute
  // upstream") — their real compiled source via .toString(), not a
  // hand-retyped copy. They can no longer drift apart. Every one of them
  // composes a sentence, so each takes the bundle's tr as its last argument
  // at its call site below (i18n, board web-msnsndki-dz3vn1) — the
  // injection route fly.ts's flightProgressOf takes — since a spliced
  // function cannot import a translator.
  ${connectModeMeta.toString()}
  ${connectStatusMeta.toString()}
  ${connectTestResultMeta.toString()}
  ${ghStatusMeta.toString()}
  ${ghLtsMeta.toString()}
  ${githubIssueConfirmMessage.toString()}
  ${githubIssueExecuteResult.toString()}
  ${reportComposeStatusMeta.toString()}
  // CONNECT/report-menu composer parity (board web-mtq70akb-rhsy6s): the
  // right-click "Report from here" dialog offers all four REPORT_ACTIONS
  // (flight/report-from-here.ts); this popover's form used to hardwire
  // 'issue'. This select gives it the same four targets, built with JS (not
  // static HTML) so 'quick-fix-pr'/'local-task' can be disabled here exactly
  // the way report-menu.ts's own dialog disables them — a page with no
  // project (document.body.dataset.project blank on the fleet index page)
  // cannot carry a task-shaped action. reportActionLabel/reportConfirmMessage/
  // reportExecuteResult below are called as BARE hoisted identifiers, not
  // re-spliced — 'report-menu' (web/features/report-menu.ts) already splices
  // report-panel.ts's real source into the same /panels.js concatenation
  // (chunks.ts's DEFERRED_OPERATOR_FEATURES), and a second copy here would be
  // bundle bytes on a budgeted chunk for no behavior, the same cross-module
  // hoisting pr-review.ts's decisionItemHeadMeta split already relies on.
  // Function declarations hoist for the WHOLE concatenated script, so this
  // holds regardless of module order or whether the call is immediate
  // (connectInit() populating the select below) or later (an event handler).
  var GH_ISSUE_ACTION_VALUES = ['issue', 'quick-fix-pr', 'local-task', 'pool-offer'];
  var GH_ISSUE_PROJECTLESS_ACTIONS = ['quick-fix-pr', 'local-task'];
  function updateGhIssueSubmitLabel() {
    if (!ghIssueBtn) return;
    var action = ghIssueAction ? ghIssueAction.value : 'issue';
    ghIssueBtn.textContent = action === 'issue' ? tr('openGithubIssue') : tr('reportExecute');
  }
  if (ghIssueAction) {
    var ghIssueProjectId = document.body.dataset.project || '';
    for (var apI = 0; apI < GH_ISSUE_ACTION_VALUES.length; apI++) {
      var apAction = GH_ISSUE_ACTION_VALUES[apI];
      var apOpt = document.createElement('option');
      apOpt.value = apAction;
      apOpt.textContent = reportActionLabel(apAction);
      if (!ghIssueProjectId && GH_ISSUE_PROJECTLESS_ACTIONS.indexOf(apAction) !== -1) {
        apOpt.disabled = true;
        apOpt.textContent += ' — ' + tr('reportActionNeedsProject');
      }
      ghIssueAction.appendChild(apOpt);
    }
    ghIssueAction.addEventListener('change', updateGhIssueSubmitLabel);
  }
  // The non-'issue' targets reuse the SAME report-from-here ritual
  // report-menu.ts's dialog runs — preview first (its own "always previewed"
  // law: a rejected capture reports its reasoning rather than a bare error),
  // confirm the real resolved plan, then execute — never a direct write with
  // no plan behind it. There is no captured page element behind this
  // popover, so the capture is synthetic: the CONNECT popover's own form is
  // the "region", and title+body (what the operator typed, or what Compose
  // wrote) is the description.
  function reportFromHereSubmit(action, title, body) {
    var reqBody = JSON.stringify({
      regionId: 'connect-panel',
      regionLabel: 'the CONNECT popover',
      description: body.trim() ? title + '\\n\\n' + body.trim() : title,
      moduleSources: ['web/features/connect.ts'],
      hasScreenshot: false,
      action: action,
      projectId: document.body.dataset.project || '',
    });
    function fail(key) {
      if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result gh-issue-result-fail'; ghIssueResult.textContent = tr(key); }
    }
    fetch('/api/report-from-here', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: reqBody,
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var plan = data && data.plan;
        if (!plan) { fail('reportPreviewUnavailable'); return; }
        if (!plan.ok) {
          var reasonText = plan.reasonKey ? tr(plan.reasonKey, plan.reasonArgs || {}) : plan.reasoning;
          if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result gh-issue-result-fail'; ghIssueResult.textContent = '\\u2717 ' + tr('reportNothingToFile', { reasoning: reasonText }); }
          return;
        }
        if (!window.confirm(reportConfirmMessage(plan, tr))) return;
        if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result'; ghIssueResult.textContent = tr('ghIssueOpening'); }
        ritualFetch('report', '/api/report-from-here/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: reqBody,
        })
          .then(function (r) { return r.json(); })
          .then(function (execData) {
            var result = reportExecuteResult(execData);
            if (ghIssueResult) { ghIssueResult.className = result.className; ghIssueResult.textContent = result.text; }
            if (result.className.indexOf('report-result-ok') !== -1) {
              if (ghIssueTitle) ghIssueTitle.value = '';
              if (ghIssueBody) ghIssueBody.value = '';
            }
          })
          .catch(function () { fail('ghIssueRequestFailed'); });
      })
      .catch(function () { fail('reportPreviewUnavailable'); });
  }
  function applyMode(mode) {
    var m = connectModeMeta(mode, tr);
    if (secretEl) { secretEl.hidden = !m.show; secretEl.placeholder = m.ph; if (!m.show) secretEl.value = ''; }
    if (secretLabel) { secretLabel.hidden = !m.show; secretLabel.textContent = m.label; }
    if (hintEl) hintEl.textContent = m.hint;
  }
  function paintDot(dotClass, dotTip, dotAriaLabel) {
    if (!dotEl) return;
    dotEl.className = dotClass;
    dotEl.removeAttribute('aria-hidden');
    dotEl.setAttribute('tabindex', '0');
    dotEl.setAttribute('data-tip', dotTip);
    dotEl.setAttribute('aria-label', dotAriaLabel);
  }
  function render(s) {
    var m = connectStatusMeta(s, tr);
    if (statusEl) {
      statusEl.textContent = m.statusText;
      if (m.statusClass) statusEl.className = m.statusClass;
    }
    paintDot(m.dotClass, m.dotTip, m.dotAriaLabel);
    if (labelEl) labelEl.textContent = m.labelText;
    if (!s || typeof s.mode !== 'string') return;
    if (modeEl) modeEl.value = s.mode;
    applyMode(s.mode);
  }
  function load() {
    fetch('/api/connection', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(render)
      .catch(function () { if (statusEl) statusEl.textContent = tr('connectionUnavailable'); });
  }
  // GitHub connection management (epic 0029 slice 2): the three verbs show
  // only when gh is installed; switch/log out only once someone is logged
  // in. Each POST opens a terminal running a fixed 'gh auth …' literal — the
  // Claude button's own pattern — so nothing is done on the operator's
  // behalf; the identity line re-reads itself once the flow has plausibly
  // finished there.
  function paintGhAuth(s) {
    var present = !!(s && s.present);
    var authed = present && !!s.authenticated;
    if (ghAuthEl) ghAuthEl.hidden = !present;
    // Logged in already? Then "log in" is noise beside Switch — three verbs in
    // a narrow popover wrapped four lines deep (operator, 2026-09-14).
    if (ghLoginBtn) ghLoginBtn.hidden = authed;
    if (ghSwitchBtn) ghSwitchBtn.hidden = !authed;
    if (ghLogoutBtn) ghLogoutBtn.hidden = !authed;
  }
  function ghAuth(kind) {
    var openedKey = kind === 'login' ? 'ghLoginOpened' : (kind === 'switch' ? 'ghSwitchOpened' : 'ghLogoutOpened');
    if (ghStatusEl) ghStatusEl.textContent = tr('ghAuthLaunching');
    fetch('/api/connection/gh/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function () {
        if (ghStatusEl) ghStatusEl.textContent = tr(openedKey);
        setTimeout(loadGh, 30000);
      })
      .catch(function () { if (ghStatusEl) ghStatusEl.textContent = tr('ghAuthLaunchFailed'); });
  }
  if (ghLoginBtn) ghLoginBtn.addEventListener('click', function () { ghAuth('login'); });
  if (ghSwitchBtn) ghSwitchBtn.addEventListener('click', function () { ghAuth('switch'); });
  if (ghLogoutBtn) ghLogoutBtn.addEventListener('click', function () { ghAuth('logout'); });
  function loadGh() {
    fetch('/api/connection/gh', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        var m = ghStatusMeta(s, tr);
        if (ghStatusEl) ghStatusEl.textContent = m.statusText;
        if (ghHintEl) ghHintEl.textContent = m.hint;
        paintGhAuth(s);
        // ONE fetch for this fact, not two (e2e boot smoke, 2026-09-15): the
        // onboarding ladder needs the same answer to tick its GitHub step,
        // and the boot smoke test pins the exact set of requests the shell
        // makes. Publishing it here means the ladder reads rather than asks,
        // and a later login/logout re-runs loadGh, so the tick follows.
        apGhAuthenticated = !!(s && s.authenticated === true);
        if (typeof syncOnboarding === 'function') syncOnboarding(null);
      })
      .catch(function () { if (ghStatusEl) ghStatusEl.textContent = tr('ghUnavailable'); });
  }
  function paintLts(m) {
    if (!ghLtsEl) return;
    ghLtsEl.textContent = m.statusText;
    ghLtsEl.setAttribute('tabindex', '0');
    ghLtsEl.setAttribute('data-tip', m.statusTip);
  }
  function loadLts() {
    fetch('/api/connection/gh-lts', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { paintLts(ghLtsMeta(s, tr)); })
      .catch(function () { if (ghLtsEl) ghLtsEl.textContent = tr('ltsUnavailable'); });
  }
  if (ghLtsCheckBtn) ghLtsCheckBtn.addEventListener('click', function () {
    if (ghLtsEl) ghLtsEl.textContent = tr('ltsChecking');
    fetch('/api/connection/gh-lts', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { paintLts(ghLtsMeta(s, tr)); })
      .catch(function () { if (ghLtsEl) ghLtsEl.textContent = tr('ltsUnavailable'); });
  });
  // LLM ISSUE COMPOSER 2/3 (board web-mtpzdruu-vf25ry): the note never rides
  // anywhere but this one POST — /api/report/compose runs a local, tool-less
  // model call (flight/report-compose.ts) and hands back a polished English
  // title/body, which this fills straight into the form's own #gh-issue-
  // title/#gh-issue-body fields (the rendered PREVIEW — visible and still
  // editable) so the existing submit handler below stays a one-click,
  // unmodified path to the real GithubIssueExecuteApi. The raw note itself
  // is never part of that submit's request body.
  if (ghIssueComposeBtn) ghIssueComposeBtn.addEventListener('click', function () {
    var note = ghIssueNote ? ghIssueNote.value.trim() : '';
    if (!note) return;
    ghIssueComposeBtn.disabled = true;
    if (ghIssueComposeStatus) { ghIssueComposeStatus.className = 'gh-issue-compose-status'; ghIssueComposeStatus.textContent = tr('reportComposing'); }
    ritualFetch('compose', '/api/report/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: note }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        ghIssueComposeBtn.disabled = false;
        var m = reportComposeStatusMeta(j, tr);
        if (ghIssueComposeStatus) { ghIssueComposeStatus.className = m.className; ghIssueComposeStatus.textContent = m.text; }
        if (m.title && ghIssueTitle) ghIssueTitle.value = m.title;
        if (m.body && ghIssueBody) ghIssueBody.value = m.body;
        // Composer parity (board web-mtq70akb-rhsy6s): the raw response
        // already carries a suggested action — report-menu.ts's dialog
        // pre-selects it the same way, guarded by the same known-values check.
        if (j && typeof j.action === 'string' && GH_ISSUE_ACTION_VALUES.indexOf(j.action) !== -1 && ghIssueAction) {
          ghIssueAction.value = j.action;
          updateGhIssueSubmitLabel();
        }
      })
      .catch(function () {
        ghIssueComposeBtn.disabled = false;
        if (ghIssueComposeStatus) { ghIssueComposeStatus.className = 'gh-issue-compose-status gh-issue-compose-fail'; ghIssueComposeStatus.textContent = tr('reportComposeRequestFailed'); }
      });
  });
  if (ghIssueForm) ghIssueForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = ghIssueTitle ? ghIssueTitle.value.trim() : '';
    if (!title) return;
    var body = ghIssueBody ? ghIssueBody.value : '';
    var chosenAction = ghIssueAction ? ghIssueAction.value : 'issue';
    if (chosenAction !== 'issue') { reportFromHereSubmit(chosenAction, title, body); return; }
    if (!window.confirm(githubIssueConfirmMessage(title, tr))) return;
    if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result'; ghIssueResult.textContent = tr('ghIssueOpening'); }
    ritualFetch('github-issue', '/api/github-issue/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: title, body: body }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var m = githubIssueExecuteResult(res.j, tr);
        if (ghIssueResult) { ghIssueResult.className = m.className; ghIssueResult.textContent = m.text; }
        if (res.ok && ghIssueTitle) ghIssueTitle.value = '';
        if (res.ok && ghIssueBody) ghIssueBody.value = '';
      })
      .catch(function () { if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result gh-issue-result-fail'; ghIssueResult.textContent = tr('ghIssueRequestFailed'); } });
  });
  if (modeEl) modeEl.addEventListener('change', function () { applyMode(modeEl.value); });
  if (testBtn) testBtn.addEventListener('click', function () {
    if (statusEl) statusEl.textContent = tr('connectTesting');
    fetch('/api/connection/test', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (p) {
        var m = connectTestResultMeta(p, tr);
        if (statusEl) { statusEl.textContent = m.statusText; statusEl.className = m.statusClass; }
        paintDot(m.dotClass, m.dotTip, m.dotAriaLabel);
        if (labelEl) labelEl.textContent = m.labelText;
      })
      .catch(function () { if (statusEl) statusEl.textContent = tr('connectTestFailed'); });
  });
  if (loginBtn) loginBtn.addEventListener('click', function () {
    if (statusEl) statusEl.textContent = tr('connectLaunchingLogin');
    fetch('/api/connection/login', { method: 'POST', headers: { 'content-type': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        // setup-token prints a token to paste — switch to token mode + focus the field.
        if (modeEl) { modeEl.value = 'oauth-token'; applyMode('oauth-token'); }
        if (secretEl) secretEl.focus();
        if (statusEl) statusEl.textContent = (res && res.message) ? res.message : tr('connectTerminalOpened');
      })
      .catch(function () { if (statusEl) statusEl.textContent = tr('connectLoginLaunchFailed'); });
  });
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var mode = modeEl ? modeEl.value : 'subscription';
    var body = { mode: mode };
    if (mode === 'api-key') body.apiKey = secretEl ? secretEl.value : '';
    if (mode === 'oauth-token') body.oauthToken = secretEl ? secretEl.value : '';
    if (statusEl) statusEl.textContent = tr('connectSaving');
    fetch('/api/connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { if (secretEl) secretEl.value = ''; render(res.j); }
        else if (statusEl) { statusEl.textContent = tr('connectSaveError', { error: (res.j && res.j.error) ? res.j.error : tr('connectSaveErrorGeneric') }); statusEl.className = 'connect-status connect-bad'; }
      })
      .catch(function () { if (statusEl) statusEl.textContent = tr('connectSaveFailed'); });
  });
  load();
  loadGh();
  loadLts();
}
connectInit();
`.trim();
}
