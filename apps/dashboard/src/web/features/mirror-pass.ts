// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's MIRROR PASS panel (EPIC 0019 S3, board
 * web-mtrh1hlh-62l41b) — VERDICT `ap-mtsg3nc0-3` split this into four
 * independently-shippable slices; (a) the four preview APIs and (b) the
 * mutating execute path are covered elsewhere, but slice (c) — a dashboard
 * consumer — never shipped, so `GET /api/mirror-pass`,
 * `/mirror-pass/landing-note`, `/mirror-pass/drift`, and
 * `/mirror-pass/stale-claims` existed with zero UI reader: four real,
 * working reconciliation checks an operator had no way to see. This panel
 * fetches all four on mount, folds them into one combined finding list via
 * `mirror-pass-panel.ts`'s `mirrorPassItems`, and renders it.
 *
 * It also closes a second UX-expression gap slice (c) left preview-only:
 * `POST /api/mirror-pass/execute` (derivation 1/4, the reconcile ritual —
 * "close the issue with the landing SHA") has been live since commit
 * `3d3a6aaf` with zero dashboard trigger. `renderMirrorPassBody` now shows a
 * "Run mirror pass" button whenever `mirror-pass-panel.ts`'s
 * `mirrorPassCanExecute` allows it — a confirmed maintainer (or an
 * unresolved identity, not a known guest) AND at least one actionable
 * reconcile finding. The remaining wired execute path (stale-claim) stays
 * its own follow-up slice, same per-derivation split already used
 * throughout this epic. A clean run reloads the panel so the
 * applied finding(s) vanish from the refreshed list, the same "success
 * re-fetches, no separate message" convention `pr-review.ts`'s Apply button
 * uses; a role-gate skip or a failed request shows `mirror-pass-panel.ts`'s
 * `mirrorPassExecuteResultMessage` instead.
 *
 * A second, independent "Fix doc drift" button closes derivation 3/4's own
 * unwritten execute path the same way, gated on `mirrorPassCanExecuteDrift`
 * (at least one drift finding rather than a reconcile one) and posting to
 * `POST /api/mirror-pass/drift/execute`. It shares the reconcile button's
 * `.mirror-pass-actions` row and `.mirror-pass-result` line — the two never
 * fire at once since each is its own click — but is otherwise fully
 * independent: its own data attribute, confirm text, and in-flight/failure
 * labels, formatted by `mirror-pass-panel.ts`'s
 * `mirrorPassDriftExecuteResultMessage`.
 *
 * A third, independent "Post landing note(s)" button closes derivation 2/4's
 * own unwritten execute path the same way, gated on
 * `mirrorPassCanExecuteLandingNote` (at least one landing-note finding) and
 * posting to `POST /api/mirror-pass/landing-note/execute`. Its report shares
 * reconcile's exact shape, so it reuses `mirrorPassExecuteResultMessage`
 * rather than a third near-identical formatter.
 *
 * `web/shell.ts`'s `clientJs()` calls this indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; `discoverFeatureModules('web/
 * features')` finds this file's `mirrorPassJs` export the same way it
 * already finds `issue-triage.ts`'s. `mirrorPassSection(pid)` (declared
 * below) is called from `fleetJs()`'s `renderProjectPage()` — a bare,
 * unimported identifier reference in `fleetJs()`'s own served text, hoisted
 * the same way `issueTriageSection`'s call site already relies on.
 * `socialIdentity()` is `web/shell.ts`'s own hoisted core helper — ONE
 * identity read per page load, shared with every other role-gated panel.
 *
 * i18n: the title, loading placeholder, empty/unavailable states, and the
 * execute button's idle label carry their English default AND a `data-i18n`
 * tag, then are swept by `translateDom()` — the title/loading placeholder
 * ride the page-level sweep that follows every `renderProjectPage()` tick,
 * while the async empty/unavailable/execute states call `translateDom()`
 * themselves since they land after that tick's sweep already ran, the same
 * split `issue-triage.ts`/`flight-console.ts` already follow. Each finding's
 * own text is built from live GitHub/tree facts, never static chrome, so it
 * is never a translation target — the same stance `issue-triage.ts`'s
 * `plan.issue.title` render takes on dynamic text. The execute button's
 * hover tip IS its accessible name, so one key (`mirrorPassExecuteTip`)
 * rides both the `[data-i18n-tip]` and `[data-i18n-aria]` sweeps — the
 * shape `shell.ts`'s "No open findings" gauge takes. The confirm dialog, the
 * in-flight "Running…" label, and the click handler's own request-failed
 * line are never DOM attributes a sweep can reach, so they call `tr()`
 * directly at the moment they're set, the same shape `issue-triage.ts`'s
 * and `release.ts`'s EXECUTE handlers already follow (board
 * web-msnsndki-dz3vn1). `mirrorPassExecuteResultMessage`'s server-outcome
 * lines (skip reasons, applied count) are spliced pure helpers with no
 * `tr` in scope and stay English for now — a later tr-injection slice.
 */
import {
  mirrorPassReconcileItems,
  mirrorPassLandingNoteItems,
  mirrorPassStaleClaimItems,
  mirrorPassDriftItems,
  mirrorPassItems,
  mirrorPassCanExecute,
  mirrorPassExecuteResultMessage,
  mirrorPassCanExecuteDrift,
  mirrorPassDriftExecuteResultMessage,
  mirrorPassCanExecuteLandingNote,
} from '../mirror-pass-panel.js';

/** The Mirror pass panel client — vanilla, external (keeps CSP script-src 'self'). */
export function mirrorPassJs(): string {
  return `
// The ten functions below are generated FROM web/mirror-pass-panel.ts
// (EPIC 0019 S3, VERDICT ap-mtsg3nc0-3 slices (c) and (c) v2) — their real
// compiled source via .toString(), not a hand-retyped copy. It can no
// longer drift apart. mirrorPassItems calls all four of the finding
// formatters, so every one of them must be spliced in too (issue-triage.ts's
// mirrorPassJs-equivalent splices all six of its own helpers for the same
// reason) — a lone mirrorPassItems.toString() throws ReferenceError the
// moment it runs, since its callees would not exist in this generated scope.
${mirrorPassReconcileItems.toString()}
${mirrorPassLandingNoteItems.toString()}
${mirrorPassStaleClaimItems.toString()}
${mirrorPassDriftItems.toString()}
${mirrorPassItems.toString()}
${mirrorPassCanExecute.toString()}
${mirrorPassExecuteResultMessage.toString()}
${mirrorPassCanExecuteDrift.toString()}
${mirrorPassDriftExecuteResultMessage.toString()}
${mirrorPassCanExecuteLandingNote.toString()}
function renderMirrorPassBody(body, items, canExecute, canExecuteDrift, canExecuteLandingNote, pid) {
  body.replaceChildren();
  items = items || [];
  if (!items.length) {
    var emptyMsg = el('p', 'muted', 'Board and GitHub agree — nothing to reconcile.');
    emptyMsg.setAttribute('data-i18n', 'mirrorPassEmpty');
    body.appendChild(emptyMsg);
    translateDom(document.documentElement.lang || 'en');
    return;
  }
  var list = el('ul', 'mirror-pass-list');
  for (var i = 0; i < items.length; i++) {
    list.appendChild(el('li', 'mirror-pass-item', items[i].text));
  }
  body.appendChild(list);
  if (canExecute || canExecuteDrift || canExecuteLandingNote) {
    var actions = el('div', 'mirror-pass-actions');
    if (canExecute) {
      var runBtn = el('button', 'mirror-pass-execute', 'Run mirror pass');
      runBtn.type = 'button';
      runBtn.setAttribute('data-i18n', 'mirrorPassExecute');
      runBtn.setAttribute('data-mirror-pass-execute', pid);
      // i18n (board web-msnsndki-dz3vn1): the tip IS the accessible name, so
      // one key rides both sweeps; the English literal stays as the
      // byte-identical default and the translateDom() below repaints both.
      var runTip =
        'Applies every reconcile finding above — closes or reopens issues and posts comments via gh.';
      runBtn.setAttribute('data-tip', runTip);
      runBtn.setAttribute('data-i18n-tip', 'mirrorPassExecuteTip');
      runBtn.setAttribute('aria-label', runTip);
      runBtn.setAttribute('data-i18n-aria', 'mirrorPassExecuteTip');
      actions.appendChild(runBtn);
    }
    if (canExecuteDrift) {
      var driftBtn = el('button', 'mirror-pass-execute', 'Fix doc drift');
      driftBtn.type = 'button';
      driftBtn.setAttribute('data-i18n', 'mirrorPassDriftExecute');
      driftBtn.setAttribute('data-mirror-pass-drift-execute', pid);
      var driftTip =
        'Files a new GitHub issue for every doc-vs-tree drift finding above, skipping any that already have one open.';
      driftBtn.setAttribute('data-tip', driftTip);
      driftBtn.setAttribute('data-i18n-tip', 'mirrorPassDriftExecuteTip');
      driftBtn.setAttribute('aria-label', driftTip);
      driftBtn.setAttribute('data-i18n-aria', 'mirrorPassDriftExecuteTip');
      actions.appendChild(driftBtn);
    }
    if (canExecuteLandingNote) {
      var landingNoteBtn = el('button', 'mirror-pass-execute', 'Post landing note(s)');
      landingNoteBtn.type = 'button';
      landingNoteBtn.setAttribute('data-i18n', 'mirrorPassLandingNoteExecute');
      landingNoteBtn.setAttribute('data-mirror-pass-landing-note-execute', pid);
      var landingNoteTip =
        'Posts a landing-note comment on every already-closed issue above that is missing one.';
      landingNoteBtn.setAttribute('data-tip', landingNoteTip);
      landingNoteBtn.setAttribute('data-i18n-tip', 'mirrorPassLandingNoteExecuteTip');
      landingNoteBtn.setAttribute('aria-label', landingNoteTip);
      landingNoteBtn.setAttribute('data-i18n-aria', 'mirrorPassLandingNoteExecuteTip');
      actions.appendChild(landingNoteBtn);
    }
    body.appendChild(actions);
    var resultEl = el('div', 'mirror-pass-result');
    resultEl.setAttribute('role', 'status');
    resultEl.setAttribute('aria-live', 'polite');
    body.appendChild(resultEl);
  }
  translateDom(document.documentElement.lang || 'en');
}
function loadMirrorPassBody(body, pid) {
  var base = '/api/mirror-pass';
  var qs = '?project=' + encodeURIComponent(pid);
  Promise.all([
    fetch(base + qs).then(function (r) { return r.ok ? r.json() : { mirrorPass: null }; }),
    fetch(base + '/landing-note' + qs).then(function (r) { return r.ok ? r.json() : { landingNote: null }; }),
    fetch(base + '/drift' + qs).then(function (r) { return r.ok ? r.json() : { drift: null }; }),
    fetch(base + '/stale-claims' + qs).then(function (r) { return r.ok ? r.json() : { staleClaims: null }; }),
    socialIdentity(),
  ])
    .then(function (results) {
      if (!body.isConnected) return;
      var reconcile = results[0] && results[0].mirrorPass;
      var landingNote = results[1] && results[1].landingNote;
      var drift = results[2] && results[2].drift;
      var items = mirrorPassItems({
        reconcile: reconcile,
        landingNote: landingNote,
        drift: drift,
        staleClaims: results[3] && results[3].staleClaims,
      });
      var identity = results[4] && results[4].identity;
      renderMirrorPassBody(
        body,
        items,
        mirrorPassCanExecute(identity, reconcile),
        mirrorPassCanExecuteDrift(identity, drift),
        mirrorPassCanExecuteLandingNote(identity, landingNote),
        pid,
      );
    })
    .catch(function () {
      if (!body.isConnected) return;
      var unavailableMsg = el('p', 'muted', 'Mirror pass unavailable.');
      unavailableMsg.setAttribute('data-i18n', 'mirrorPassUnavailable');
      body.replaceChildren(unavailableMsg);
      translateDom(document.documentElement.lang || 'en');
    });
}
function mirrorPassSection(pid) {
  var wrap = el('section', 'mirror-pass-panel');
  var title = el('h3', 'mirror-pass-title', '🔁 Mirror pass');
  title.setAttribute('data-i18n', 'mirrorPassTitle');
  wrap.appendChild(title);
  var body = el('div', 'mirror-pass-body');
  var loadingMsg = el('p', 'muted', 'Checking the board against GitHub…');
  loadingMsg.setAttribute('data-i18n', 'mirrorPassLoading');
  body.appendChild(loadingMsg);
  wrap.appendChild(body);
  loadMirrorPassBody(body, pid);
  return wrap;
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-mirror-pass-execute]');
  if (!b || b.disabled) return;
  var pid = b.getAttribute('data-mirror-pass-execute');
  // i18n (board web-msnsndki-dz3vn1): a confirm's text is a call argument
  // evaluated at click time, never an element a sweep visits — tr() reads
  // the active locale itself, like release.ts's own confirm.
  if (!window.confirm(tr('mirrorPassExecuteConfirm'))) return;
  var body = b.closest('.mirror-pass-body');
  var resultEl = body && body.querySelector('.mirror-pass-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('mirrorPassExecuting');
  fetch('/api/mirror-pass/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = mirrorPassExecuteResultMessage(r.status, r.data);
      if (result.className.indexOf('mirror-pass-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // A clean apply changed real issue state (closed/reopened/commented) —
      // reload the panel so it reflects reality instead of the stale
      // findings, same "success re-fetches" convention pr-review.ts's Apply
      // button and release/landing execute already use.
      loadMirrorPassBody(body, pid);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'mirror-pass-result mirror-pass-result-fail';
        resultEl.textContent = tr('mirrorPassRequestFailed');
      }
    });
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-mirror-pass-drift-execute]');
  if (!b || b.disabled) return;
  var pid = b.getAttribute('data-mirror-pass-drift-execute');
  if (!window.confirm(tr('mirrorPassDriftExecuteConfirm'))) return;
  var body = b.closest('.mirror-pass-body');
  var resultEl = body && body.querySelector('.mirror-pass-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('mirrorPassDriftExecuting');
  fetch('/api/mirror-pass/drift/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = mirrorPassDriftExecuteResultMessage(r.status, r.data);
      if (result.className.indexOf('mirror-pass-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // Same "success re-fetches" convention the reconcile button above
      // uses — a clean run filed real GitHub issues, so reload the panel
      // rather than leave the stale drift findings on screen.
      loadMirrorPassBody(body, pid);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'mirror-pass-result mirror-pass-result-fail';
        resultEl.textContent = tr('mirrorPassDriftRequestFailed');
      }
    });
});
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('[data-mirror-pass-landing-note-execute]');
  if (!b || b.disabled) return;
  var pid = b.getAttribute('data-mirror-pass-landing-note-execute');
  if (!window.confirm(tr('mirrorPassLandingNoteExecuteConfirm'))) return;
  var body = b.closest('.mirror-pass-body');
  var resultEl = body && body.querySelector('.mirror-pass-result');
  b.disabled = true;
  var originalText = b.textContent;
  b.textContent = tr('mirrorPassLandingNoteExecuting');
  fetch('/api/mirror-pass/landing-note/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: pid }),
  })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (r) {
      var result = mirrorPassExecuteResultMessage(r.status, r.data);
      if (result.className.indexOf('mirror-pass-result-fail') !== -1) {
        b.disabled = false;
        b.textContent = originalText;
        if (resultEl) {
          resultEl.className = result.className;
          resultEl.textContent = result.text;
        }
        return;
      }
      // Same "success re-fetches" convention the reconcile/drift buttons
      // above use — a clean run posted real GitHub comments, so reload the
      // panel rather than leave the stale landing-note findings on screen.
      loadMirrorPassBody(body, pid);
    })
    .catch(function () {
      b.disabled = false;
      b.textContent = originalText;
      if (resultEl) {
        resultEl.className = 'mirror-pass-result mirror-pass-result-fail';
        resultEl.textContent = tr('mirrorPassLandingNoteRequestFailed');
      }
    });
});
`.trim();
}
