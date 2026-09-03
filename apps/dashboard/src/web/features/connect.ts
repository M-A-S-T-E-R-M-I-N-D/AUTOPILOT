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
} from '../connect-panel.js';

/** The CONNECT popover client — vanilla, external (keeps CSP script-src 'self'). */
export function connectJs(): string {
  return `
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
  var ghLtsEl = document.getElementById('gh-lts');
  var ghLtsCheckBtn = document.getElementById('gh-lts-check');
  var ghIssueForm = document.getElementById('gh-issue-form');
  var ghIssueTitle = document.getElementById('gh-issue-title');
  var ghIssueBody = document.getElementById('gh-issue-body');
  var ghIssueResult = document.getElementById('gh-issue-result');

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
  var ghIssueBtn = ghIssueForm ? ghIssueForm.querySelector('button[type="submit"]') : null;
  setTip(ghIssueBtn, 'ghIssueTip');

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
  function loadGh() {
    fetch('/api/connection/gh', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        var m = ghStatusMeta(s, tr);
        if (ghStatusEl) ghStatusEl.textContent = m.statusText;
        if (ghHintEl) ghHintEl.textContent = m.hint;
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
  if (ghIssueForm) ghIssueForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = ghIssueTitle ? ghIssueTitle.value.trim() : '';
    if (!title) return;
    if (!window.confirm(githubIssueConfirmMessage(title, tr))) return;
    var body = ghIssueBody ? ghIssueBody.value : '';
    if (ghIssueResult) { ghIssueResult.className = 'gh-issue-result'; ghIssueResult.textContent = tr('ghIssueOpening'); }
    fetch('/api/github-issue/execute', {
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
