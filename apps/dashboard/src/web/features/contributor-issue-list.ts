// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The visitor-facing CONTRIBUTOR ISSUE LIST panel (board web-mtt3hery-l8v0lf,
 * CONTRIBUTOR JOURNEY slice 1 of 4) — browses every open good-first-issue/
 * help-wanted issue (`GET /api/contributor-issues`), this slice's dashboard
 * UX expression: `flight/contributor-issue-list.ts`'s doc comment used to
 * flag the panel as "still a separate, later slice" — this file is that
 * slice. `discoverFeatureModules('web/features')` finds this file's
 * `contributorIssueListJs` export the same way it finds `pool-client.ts`'s
 * `poolClientJs`. Read-only, like the KEEPER PR review and Pool panels — no
 * claim ACTION here (no `gh` write, no comment post) — so it polls on its
 * own timer independent of any flown project, the same self-init shape
 * `pool-client.ts` uses. `contributorIssueTierBadge` is generated FROM
 * `web/contributor-issue-list-panel.ts` below — its real compiled source via
 * `.toString()`, not a hand-retyped copy.
 *
 * Also renders slice 2 of 4, the "/claim walkthrough (fork-first
 * etiquette)": `CLAIM_WALKTHROUGH_STEPS` (below, spliced via
 * `JSON.stringify()` the same way `contributor-standing-panel.ts`'s
 * `CONTRIBUTOR_STANDING_TIERS` is) renders as a collapsed-by-default
 * `<details>` under the list — native disclosure semantics need no hand-
 * rolled ARIA state, and it only ever appears alongside issues worth
 * claiming, never on its own (same `section.hidden` gate as the list
 * itself, since a visitor with nothing open to claim has nothing to walk
 * through). Still a guide, not an action: it names the `/claim` comment a
 * visitor should type, it never posts one on their behalf.
 */
import {
  contributorIssueTierBadge,
  CLAIM_WALKTHROUGH_STEPS,
} from '../contributor-issue-list-panel.js';

/** The CONTRIBUTOR ISSUE LIST panel client — vanilla, external (keeps CSP script-src 'self'). */
export function contributorIssueListJs(): string {
  return `
// Contributor issue list (board web-mtt3hery-l8v0lf, CONTRIBUTOR JOURNEY
// slice 1/4): GET /api/contributor-issues browses every open
// good-first-issue/help-wanted issue for a visiting contributor. Read-only —
// no claim action here — so the section stays hidden entirely when there is
// nothing open to show, the same "hide rather than show an empty panel"
// convention the Pool panel uses. contributorIssueTierBadge is generated
// FROM web/contributor-issue-list-panel.ts below — its real compiled source
// via .toString(), not a hand-retyped copy.
${contributorIssueTierBadge.toString()}
// CONTRIBUTOR JOURNEY slice 2/4 — the "/claim walkthrough (fork-first
// etiquette)" the board task names, condensed from .github/CONTRIBUTING.md.
// CLAIM_WALKTHROUGH_STEPS is generated FROM
// web/contributor-issue-list-panel.ts below — its real value via
// JSON.stringify(), not a hand-retyped copy.
var CLAIM_WALKTHROUGH_STEPS = ${JSON.stringify(CLAIM_WALKTHROUGH_STEPS)};
var CONTRIBUTOR_ISSUE_LIST_POLL_MS = 30000;
function renderClaimWalkthrough(section) {
  var details = document.createElement('details');
  details.className = 'contributor-claim-walkthrough';
  details.appendChild(el('summary', '', 'How to claim'));
  var steps = document.createElement('ol');
  for (var i = 0; i < CLAIM_WALKTHROUGH_STEPS.length; i++) {
    steps.appendChild(el('li', '', CLAIM_WALKTHROUGH_STEPS[i]));
  }
  details.appendChild(steps);
  section.appendChild(details);
}
function renderContributorIssueListPanel(entries) {
  var section = document.getElementById('contributor-issue-list-panel');
  if (!section) return;
  entries = entries || [];
  section.replaceChildren();
  // Guarded write: assigning the same boolean still queues a MutationObserver
  // record (attribute set, value-equal or not), and this runs every poll tick
  // — an idempotent tick must mutate nothing (cockpit epic 0015, D2 dedup).
  var listHidden = entries.length === 0;
  if (section.hidden !== listHidden) section.hidden = listHidden;
  if (entries.length === 0) return;
  var title = el('h3', 'contributor-issue-list-title', '🌱 Good first issues');
  section.appendChild(title);
  // #43: this list is the humans' welcome mat — the fleet steps around it.
  var audience = el('p', 'panel-audience', 'For people: reserved for humans, the fleet steps around these. Claim one on GitHub with /claim; the walkthrough is below.');
  audience.setAttribute('data-i18n', 'contributorIssueListAudience');
  section.appendChild(audience);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var item = el('div', 'contributor-issue-list-item');
    var head = el('div', 'contributor-issue-list-head');
    var numberEl = el('a', 'contributor-issue-list-number', '#' + entry.number);
    numberEl.setAttribute('href', entry.url);
    numberEl.setAttribute('target', '_blank');
    numberEl.setAttribute('rel', 'noopener noreferrer');
    numberEl.setAttribute('aria-label', '#' + entry.number + ': ' + entry.title);
    head.appendChild(numberEl);
    var badge = contributorIssueTierBadge(entry.tier);
    head.appendChild(tipChip(badge, badge, badge, 'contributor-issue-list-badge'));
    item.appendChild(head);
    item.appendChild(el('p', 'contributor-issue-list-issue-title', entry.title));
    section.appendChild(item);
  }
  renderClaimWalkthrough(section);
}
function loadContributorIssueListPanel() {
  fetch('/api/contributor-issues', { headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
    .then(function (data) { renderContributorIssueListPanel(data && data.entries); })
    .catch(function () {});
}
loadContributorIssueListPanel();
setInterval(loadContributorIssueListPanel, CONTRIBUTOR_ISSUE_LIST_POLL_MS);
`.trim();
}
