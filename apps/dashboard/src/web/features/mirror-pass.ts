// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's read-only MIRROR PASS panel (EPIC 0019 S3, board
 * web-mtrh1hlh-62l41b) — VERDICT `ap-mtsg3nc0-3` split this into four
 * independently-shippable slices; (a) the four preview APIs and (b) the
 * mutating execute path are covered elsewhere, but slice (c) — a dashboard
 * consumer — never shipped, so `GET /api/mirror-pass`,
 * `/mirror-pass/landing-note`, `/mirror-pass/drift`, and
 * `/mirror-pass/stale-claims` existed with zero UI reader: four real,
 * working reconciliation checks an operator had no way to see. This panel
 * fetches all four on mount, folds them into one combined finding list via
 * `mirror-pass-panel.ts`'s `mirrorPassItems`, and renders it — no execute
 * button, since the mutating path (VERDICT slice (b)) is a separate,
 * unshipped slice; this is preview-only, the same "read the findings,
 * nothing to click yet" stance `process-health.ts`'s stat tiles take.
 *
 * `web/shell.ts`'s `clientJs()` calls this indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; `discoverFeatureModules('web/
 * features')` finds this file's `mirrorPassJs` export the same way it
 * already finds `issue-triage.ts`'s. `mirrorPassSection(pid)` (declared
 * below) is called from `fleetJs()`'s `renderProjectPage()` — a bare,
 * unimported identifier reference in `fleetJs()`'s own served text, hoisted
 * the same way `issueTriageSection`'s call site already relies on.
 *
 * i18n: the title, loading placeholder, and empty/unavailable states carry
 * their English default AND a `data-i18n` tag, then are swept by
 * `translateDom()` — the title/loading placeholder ride the page-level sweep
 * that follows every `renderProjectPage()` tick, while the async empty/
 * unavailable states call `translateDom()` themselves since they land after
 * that tick's sweep already ran, the same split `issue-triage.ts`/
 * `flight-console.ts` already follow. Each finding's own text is built from
 * live GitHub/tree facts, never static chrome, so it is never a translation
 * target — the same stance `issue-triage.ts`'s `plan.issue.title` render
 * takes on dynamic text.
 */
import {
  mirrorPassReconcileItems,
  mirrorPassLandingNoteItems,
  mirrorPassStaleClaimItems,
  mirrorPassDriftItems,
  mirrorPassItems,
} from '../mirror-pass-panel.js';

/** The Mirror pass panel client — vanilla, external (keeps CSP script-src 'self'). */
export function mirrorPassJs(): string {
  return `
// The five functions below are generated FROM web/mirror-pass-panel.ts (EPIC
// 0019 S3, VERDICT ap-mtsg3nc0-3 slice (c)) — their real compiled source via
// .toString(), not a hand-retyped copy. It can no longer drift apart.
// mirrorPassItems calls all four of the others, so every one of them must be
// spliced in too (issue-triage.ts's mirrorPassJs-equivalent splices all six
// of its own helpers for the same reason) — a lone mirrorPassItems.toString()
// throws ReferenceError the moment it runs, since its callees would not
// exist in this generated scope.
${mirrorPassReconcileItems.toString()}
${mirrorPassLandingNoteItems.toString()}
${mirrorPassStaleClaimItems.toString()}
${mirrorPassDriftItems.toString()}
${mirrorPassItems.toString()}
function renderMirrorPassBody(body, items) {
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
}
function loadMirrorPassBody(body, pid) {
  var base = '/api/mirror-pass';
  var qs = '?project=' + encodeURIComponent(pid);
  Promise.all([
    fetch(base + qs).then(function (r) { return r.ok ? r.json() : { mirrorPass: null }; }),
    fetch(base + '/landing-note' + qs).then(function (r) { return r.ok ? r.json() : { landingNote: null }; }),
    fetch(base + '/drift' + qs).then(function (r) { return r.ok ? r.json() : { drift: null }; }),
    fetch(base + '/stale-claims' + qs).then(function (r) { return r.ok ? r.json() : { staleClaims: null }; }),
  ])
    .then(function (results) {
      if (!body.isConnected) return;
      var items = mirrorPassItems({
        reconcile: results[0] && results[0].mirrorPass,
        landingNote: results[1] && results[1].landingNote,
        drift: results[2] && results[2].drift,
        staleClaims: results[3] && results[3].staleClaims,
      });
      renderMirrorPassBody(body, items);
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
`.trim();
}
