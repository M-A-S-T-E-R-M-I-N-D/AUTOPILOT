// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's DETECTED BACKLOG panel — a whole bundle-composing
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF — see docs/epics/0002-shell-decomposition.md, and
 * `web/features/round-panel.ts` for the prior extraction of this shape).
 * `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not its compiled source — is
 * what lands in the served `/app.js` text; moving the function itself (not
 * splicing it) is therefore zero behavior change.
 * `discoverFeatureModules('web/features')` finds this file's `backlogJs`
 * export the same way it already finds `round-panel.ts`'s. Like
 * `round-panel.ts`, this panel keeps no module-level state at all: every
 * render fetches fresh and paints from the response, with no `pid`-keyed map
 * surviving between renders, and it has no execute click handler of its own
 * — confirming a candidate reuses the task board's own `data-task-done`
 * action, which stays inline in `fleetJs()` — the same "no read of
 * `lastFleetState` or any other fleet-wide mutable state `fleetJs()` owns"
 * self-containment those cuts already proved extractable.
 *
 * `backlogSection(pid)` (declared below) is called from `fleetJs()`'s
 * `renderProjectPage()` — a call site that stays a bare, unimported
 * identifier reference in `fleetJs()`'s own served text. That works because
 * the served bundle is one concatenated non-module script (`clientJs()` =
 * `fleetJs()` + `featureModulesJs()`): `backlogSection` is a hoisted
 * `function` declaration, and by the time `renderProjectPage()` actually
 * calls it (only once a project page is opened, well after the whole script
 * has already run once), every feature module's functions — this one
 * included — are already defined in the same shared top-level scope, the
 * same way `round-panel.ts`'s `roundSection` call site already relies on.
 * `el`/`tipChip`, called by name inside this module, hoist the same way from
 * `fleetJs()`'s own top-level declarations.
 */
import { backlogMatchText } from '../../shared/backlog-match.js';
import { backlogCandidateMeta } from '../backlog-panel.js';

/** The DETECTED BACKLOG panel client — vanilla, external (keeps CSP script-src 'self'). */
export function backlogJs(): string {
  return `
// DETECTED BACKLOG (headless-surfacing sweep, web-msnqqjmd-9bx0wd): fly.ts's
// end-of-flight reconciliation sweep (findReconciliationCandidates, read/
// reconcile.ts) already scores every open task's title against recent commit
// subjects/changed-file paths — catching work shipped in an interactive
// session (no METRICS line, so no board task ever flips to done) — but it only
// ever PRINTED the result to the flight console, telling the operator to
// "review on the dashboard" though no dashboard surface ever read it. This
// panel IS that surface: fetched on demand (GET /api/backlog), same
// not-worth-polling-every-tick reasoning as the LANDING/ROUND panels above.
// Proposal-only, same as the console line it replaces: confirming a candidate
// reuses the task board's own "✓ done" action (data-task-done) — nothing here
// marks anything done without an explicit operator click. A matchedVia:
// 'path' candidate (web-mssrob7o-yhkgbt: 27 false confirm-done proposals in
// one screen, all path-matched to generic mutation/docs commits) gets NO
// confirm button at all — shared file-path tokens are too weak a signal to
// drive a one-click action, so that candidate is annotation-only.
// backlogMatchText is generated FROM shared/backlog-match.ts below (epic 0002
// "shell decomposition") — its real compiled source via .toString(), not a
// hand-retyped copy. It can no longer drift from fly.ts's own reconciliation
// console line.
${backlogMatchText.toString()}
// backlogCandidateMeta is generated FROM web/backlog-panel.ts below (epic
// 0002 "shell decomposition") — its real compiled source via .toString(),
// not a hand-retyped copy. It can no longer drift apart. backlogMatchText is
// injected rather than imported, same reason every shared module in this
// epic stays import-free.
${backlogCandidateMeta.toString()}
function renderBacklogBody(body, candidates) {
  body.replaceChildren();
  candidates = candidates || [];
  if (!candidates.length) {
    body.appendChild(el('p', 'muted', 'No unconfirmed matches — every open task is either done or not yet echoed by a commit.'));
    return;
  }
  var ul = el('ul', 'backlog-list');
  for (var i = 0; i < candidates.length; i++) {
    var cand = candidates[i];
    var li = el('li', 'backlog-item');
    var meta = backlogCandidateMeta(cand, backlogMatchText);
    var titleSpan = el('span', null, cand.taskTitle);
    titleSpan.setAttribute('tabindex', '0');
    titleSpan.setAttribute('data-tip', meta.titleTip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the span's own text already gives it
    // an accessible name, so the tip rides aria-describedby into a
    // visually-hidden span instead of a title-prefixed aria-label that would
    // duplicate data-tip verbatim (same fix as c3c57f5d for the task board's
    // own title span).
    var titleDescId = 'backlog-title-desc-' + cand.taskId;
    titleSpan.setAttribute('aria-describedby', titleDescId);
    li.appendChild(titleSpan);
    var titleDesc = el('span', 'sr-only', meta.titleTip);
    titleDesc.id = titleDescId;
    li.appendChild(titleDesc);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the chip's aria-label states only
    // the essential fact (match + sha) — the tip keeps the full guidance
    // sentence instead of being duplicated verbatim into a second attribute
    // (same split 189137e0 gave the task-row chips).
    li.appendChild(tipChip(meta.matchText, meta.tip, meta.ariaLabel, 'backlog-match'));
    if (meta.confirmTip) {
      var confirmBtn = el('button', 'task-done-btn', '✓ confirm done');
      confirmBtn.setAttribute('type', 'button');
      confirmBtn.setAttribute('data-task-done', cand.taskId);
      confirmBtn.setAttribute('data-tip', meta.confirmTip);
      // D1 ATTRIBUTE PAYLOAD (epic 0015): the button names itself from its
      // own "✓ confirm done" content, so the tip rides aria-describedby into
      // a visually-hidden span instead of an aria-label duplicating data-tip
      // verbatim (same fix as 7ae0105d for the phase-rail segment buttons).
      // The desc is a SIBLING of the button, not a child — nested, its text
      // would bleed into the button's content-computed accessible name.
      var confirmDescId = 'backlog-confirm-desc-' + cand.taskId;
      confirmBtn.setAttribute('aria-describedby', confirmDescId);
      li.appendChild(confirmBtn);
      var confirmDesc = el('span', 'sr-only', meta.confirmTip);
      confirmDesc.id = confirmDescId;
      li.appendChild(confirmDesc);
    }
    // Roving tabindex (D1 TAB-STOP ROVING): the title span and match chip
    // each gave themselves their own Tab stop — the same anti-pattern already
    // fixed for the fleet-card gauge, language bar, contribution heatmap,
    // flight-log rows, task-row chips, flight timeline strip, and office map.
    // A backlog panel with many candidates (web-mssrob7o-yhkgbt measured 27 in
    // one screen) turned into a long keyboard trap. Only the first
    // [tabindex] element in THIS row is now a Tab stop; wireRoving() below
    // (scoped per .backlog-item, same as the per-row flight-log/task-chip
    // groups) moves it. The confirm button stays outside the roving group —
    // it is a real action, not informational, and gets no explicit tabindex.
    seedRoving(li, '[tabindex]');
    ul.appendChild(li);
  }
  body.appendChild(ul);
}
wireRoving('.backlog-item [tabindex]', '.backlog-item');
function backlogSection(pid) {
  var wrap = el('section', 'backlog-panel');
  var title = el('h3', 'backlog-title', '🔍 Detected backlog');
  title.setAttribute('data-i18n', 'backlogTitle');
  wrap.appendChild(title);
  var body = el('div', 'backlog-body');
  body.appendChild(el('p', 'muted', 'Checking recent commits against the open board…'));
  wrap.appendChild(body);
  fetch('/api/backlog?project=' + encodeURIComponent(pid))
    .then(function (r) { return r.ok ? r.json() : { candidates: [] }; })
    .then(function (data) {
      if (!body.isConnected) return;
      renderBacklogBody(body, data && data.candidates);
    })
    .catch(function () {
      if (!body.isConnected) return;
      body.replaceChildren(el('p', 'muted', 'Detected backlog unavailable.'));
    });
  return wrap;
}
`.trim();
}
