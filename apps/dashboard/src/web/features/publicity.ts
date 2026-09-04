// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Publicity affordances panel (epic 0007 "PLATFORM 7/7", slice 7) — the
 * repo/watch/star/discussions links renderer (`renderPublicityPanel`) and its
 * self-init loader (`loadPublicityPanel`), a whole bundle-composing region
 * extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF — see
 * docs/epics/0002-shell-decomposition.md, and `web/features/notifications.ts`
 * for the prior extraction of this self-init shape).
 * `web/shell.ts`'s `clientJs()` calls this module indirectly through
 * `featureModulesJs()`, so its return value — not this file's compiled
 * source — is what lands in the served `/app.js` text; moving the functions
 * (not splicing them) is therefore zero behavior change. Like the KEEPER PR
 * review panel, this one is independent of any flown project — the publicity
 * affordances describe the ONE repo the dashboard process itself runs in —
 * so it initializes itself once at the bottom of this module
 * (`loadPublicityPanel()`) rather than being called from
 * `renderProjectPage()` like a per-project panel; unlike the PR review
 * panel it is a slow-changing fact (flips once, on the public-day) so it
 * loads once instead of riding a poll timer. That self-init now runs after
 * `fleetJs()`'s own `startFleetStream()` call instead of before it — the two
 * are independent fetches to different endpoints, the same ordering
 * `notifications.ts`'s `notifyInit()`/`pr-review.ts`'s `loadPrReviewPanel()`
 * self-inits already established for a fleet-wide panel's init relative to
 * `fleetJs()`'s tail.
 * `discoverFeatureModules('web/features')` finds this file's `publicityJs`
 * export the same way it already finds `pr-review.ts`'s. This file carries a
 * real relative-import splice of its own — `publicityAffordanceTip` (from
 * `web/publicity-panel.ts`) — now resolved relative to this file instead of
 * `shell.ts`; a function's `.toString()` output is unaffected by which local
 * name imports it under, so this remains byte-for-byte the same generated
 * text. Neither function reads `lastFleetState` or any other fleet-wide
 * mutable state `fleetJs()` owns, and neither is called from anywhere else in
 * `shell.ts` — the same "no pure/DOM split needed, and no shared-state
 * entanglement" self-containment `tour.ts`/`flight-console.ts`/`docs-viewer.ts`
 * already proved extractable. `el` stays inline in `fleetJs()` — broadly
 * shared across many panels beyond this one, called from
 * `renderPublicityPanel` as a bare hoisted identifier, the same shape
 * `round-panel.ts`/`release.ts` already rely on.
 */
import { publicityAffordanceTip as sharedPublicityAffordanceTip } from '../publicity-panel.js';

/** The Publicity affordances panel client — vanilla, external (keeps CSP script-src 'self'). */
export function publicityJs(): string {
  return `
// Publicity affordances (epic 0007, "PLATFORM 7/7"): repo/watch/star/
// discussions links, dormant while the repo stays private — a slow-changing
// fact (flips once, on the public-day), so this loads once rather than
// riding a poll timer the way the pool panel above does.
// publicityAffordanceTip is generated FROM web/publicity-panel.ts below —
// its real compiled source via .toString(), not a hand-retyped copy. It can
// no longer drift apart.
${sharedPublicityAffordanceTip.toString()}
function renderPublicityPanel(affordances) {
  var nav = document.getElementById('publicity-panel');
  if (!nav) return;
  affordances = affordances || [];
  nav.replaceChildren();
  nav.hidden = affordances.length === 0;
  for (var i = 0; i < affordances.length; i++) {
    var affordance = affordances[i];
    var tip = publicityAffordanceTip(affordance);
    var link;
    if (affordance.dormant) {
      link = el('span', 'publicity-link publicity-link-dormant', affordance.label);
      link.setAttribute('aria-disabled', 'true');
    } else {
      link = document.createElement('a');
      link.className = 'publicity-link publicity-link-live';
      link.textContent = affordance.label;
      link.href = affordance.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    // The live GitHub count rides in-page as a badge (stars/watchers/forks
    // fetched server-side) — the operator asked for the CONTENT here, not
    // only a link out. Appending after textContent keeps the label as the
    // first text node, so the accessible name stays "Star 3", label first.
    if (typeof affordance.count === 'number') {
      link.appendChild(el('span', 'publicity-count', String(affordance.count)));
    }
    // D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the row
    // used to give every affordance its own unconditional Tab stop — the
    // same anti-pattern already fixed for the fleet-card meta chips and
    // language bar. Only the first link is a Tab stop now; wireRoving()
    // below moves it with Left/Right/Home/End.
    link.setAttribute('tabindex', i === 0 ? '0' : '-1');
    link.setAttribute('data-tip', tip);
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the link's own label text already
    // gives it a concise accessible name, so the tip rides aria-describedby
    // into a visually-hidden sibling span instead of an aria-label that
    // would clobber that name and duplicate data-tip verbatim (same fix as
    // the backlog confirm buttons). The desc is a SIBLING of the link, not
    // a child — nested, its text would bleed into the link's
    // content-computed accessible name.
    var descId = 'publicity-desc-' + affordance.id;
    link.setAttribute('aria-describedby', descId);
    nav.appendChild(link);
    var desc = el('span', 'sr-only', tip);
    desc.id = descId;
    nav.appendChild(desc);
  }
}
wireRoving('.publicity-link', '#publicity-panel');
function loadPublicityPanel() {
  fetch('/api/publicity', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { affordances: [] }; })
    .then(function (data) { renderPublicityPanel(data && data.affordances); })
    .catch(function () {});
}
loadPublicityPanel();
`.trim();
}
