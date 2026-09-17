// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The COLLABORATION panel (board web-mtpzqrxl-z7jgbu, "roadmap items,
 * help-wanted issues with claim state, my-claims") — this task's UX
 * expression: `GET /api/collaboration`'s combined roadmap + help-wanted
 * snapshot, each entry's claim state, and a "my-claims" filter over the
 * viewer's own login. Read-only, like the Good-first-issues and Pool
 * panels — no claim ACTION here — so it self-initializes and polls on its
 * own timer independent of any flown project, the same shape
 * `contributor-issue-list.ts` uses. `discoverFeatureModules('web/features')`
 * finds this file's `collaborationJs` export the same way it finds
 * `contributor-issue-list.ts`'s. `collaborationClaimStateLabel`/
 * `isMyCollaborationClaim` are generated FROM `web/collaboration-panel.ts`
 * below — their real compiled source via `.toString()`, not a hand-retyped
 * copy.
 *
 * The viewer's own login rides `socialIdentity()` (shell.ts core, already
 * shared with `contributor-standing.ts`) rather than a second `gh api user`
 * shell-out — `flight/collaboration.ts`'s doc comment named this as the
 * reason "my-claims" was left for this UI layer instead of the server route.
 *
 * i18n: every rendered string carries its English default AND a `data-i18n`
 * tag (`locale.ts`'s `translateDom` treats a missing key as a silent no-op),
 * the same graceful-degradation shape `contributor-standing.ts` uses — this
 * ships without new `packages/tokens/src/strings.ts` entries, since every
 * English key lands in the CORE chunk via `localeJs()` regardless of which
 * chunk the surface itself rides, and `client-bundle-size-budget.test.ts`
 * measured CORE at ~1.6KB raw / ~700B gzip of headroom before this slice — a
 * follow-up slice adds the real translation keys once there's budget room
 * (the same deferral `contributor-standing.ts`'s own doc comment takes).
 */
import { collaborationClaimStateLabel, isMyCollaborationClaim } from '../collaboration-panel.js';

/** The COLLABORATION panel client — vanilla, external (keeps CSP script-src 'self'). */
export function collaborationJs(): string {
  return `
// Collaboration panel (board web-mtpzqrxl-z7jgbu): GET /api/collaboration's
// roadmap + help-wanted snapshot, with claim state and a my-claims filter
// over the viewer's own login (socialIdentity(), shared with
// contributor-standing.ts). Read-only — no claim action here — so it polls
// on its own timer, the same self-init shape contributor-issue-list.ts uses.
// collaborationClaimStateLabel/isMyCollaborationClaim are generated FROM
// web/collaboration-panel.ts below — their real compiled source via
// .toString(), not a hand-retyped copy.
${collaborationClaimStateLabel.toString()}
${isMyCollaborationClaim.toString()}
var COLLABORATION_POLL_MS = 30000;
var collaborationSnapshot = { roadmap: [], helpWanted: [] };
var collaborationViewerLogin = null;
var collaborationMyClaimsOnly = false;
function collaborationItem(entry, kindLabel) {
  var item = el('div', 'collaboration-item');
  var head = el('div', 'collaboration-head');
  var numberEl = el('a', 'collaboration-number', '#' + entry.number);
  numberEl.setAttribute('href', entry.url);
  numberEl.setAttribute('target', '_blank');
  numberEl.setAttribute('rel', 'noopener noreferrer');
  numberEl.setAttribute('aria-label', '#' + entry.number + ': ' + entry.title);
  head.appendChild(numberEl);
  head.appendChild(tipChip(kindLabel, kindLabel, kindLabel, 'collaboration-badge-kind'));
  var state = collaborationClaimStateLabel(entry);
  var stateClass = entry.assignees && entry.assignees.length > 0 ? 'collaboration-badge-claimed' : 'collaboration-badge-open';
  head.appendChild(tipChip(state, state, state, stateClass));
  item.appendChild(head);
  item.appendChild(el('p', 'collaboration-issue-title', entry.title));
  return item;
}
function collaborationGroup(section, entries, kindLabel, headingText, headingKey) {
  if (entries.length === 0) return;
  var heading = el('h4', 'collaboration-group-title', headingText);
  heading.setAttribute('data-i18n', headingKey);
  section.appendChild(heading);
  for (var i = 0; i < entries.length; i++) {
    section.appendChild(collaborationItem(entries[i], kindLabel));
  }
}
function renderCollaborationPanel() {
  var section = document.getElementById('collaboration-panel');
  if (!section) return;
  var roadmap = collaborationSnapshot.roadmap || [];
  var helpWanted = collaborationSnapshot.helpWanted || [];
  section.replaceChildren();
  var empty = roadmap.length === 0 && helpWanted.length === 0;
  if (section.hidden !== empty) section.hidden = empty;
  if (empty) return;
  var title = el('h3', 'collaboration-title', 'Collaboration');
  title.setAttribute('data-i18n', 'collaborationTitle');
  section.appendChild(title);
  var audience = el('p', 'panel-audience', "What the fleet is flying and what's open to claim, and who already holds it.");
  audience.setAttribute('data-i18n', 'collaborationAudience');
  section.appendChild(audience);
  if (collaborationViewerLogin) {
    var toggleLabel = document.createElement('label');
    toggleLabel.className = 'collaboration-my-claims';
    var toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = collaborationMyClaimsOnly;
    toggle.addEventListener('change', function () {
      collaborationMyClaimsOnly = toggle.checked;
      renderCollaborationPanel();
    });
    toggleLabel.appendChild(toggle);
    var toggleText = el('span', '', 'My claims only');
    toggleText.setAttribute('data-i18n', 'collaborationMyClaimsOnly');
    toggleLabel.appendChild(toggleText);
    section.appendChild(toggleLabel);
  }
  var login = collaborationMyClaimsOnly ? collaborationViewerLogin : null;
  var visibleRoadmap = login ? roadmap.filter(function (e) { return isMyCollaborationClaim(e, login); }) : roadmap;
  var visibleHelpWanted = login ? helpWanted.filter(function (e) { return isMyCollaborationClaim(e, login); }) : helpWanted;
  collaborationGroup(section, visibleRoadmap, 'Roadmap', 'Roadmap', 'collaborationRoadmapGroup');
  collaborationGroup(section, visibleHelpWanted, 'Help wanted', 'Help wanted', 'collaborationHelpWantedGroup');
  if (login && visibleRoadmap.length === 0 && visibleHelpWanted.length === 0) {
    var noClaims = el('p', 'panel-audience', 'Nothing claimed by you right now.');
    noClaims.setAttribute('data-i18n', 'collaborationNoMyClaims');
    section.appendChild(noClaims);
  }
  translateDom(document.documentElement.lang || 'en');
}
function loadCollaborationPanel() {
  fetch('/api/collaboration', { headers: { accept: 'application/json' } })
    // A failed poll keeps the last render (2026-09-12) — see ci-status.ts.
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data) collaborationSnapshot = data;
      renderCollaborationPanel();
    })
    .catch(function () {});
}
loadCollaborationPanel();
setInterval(loadCollaborationPanel, COLLABORATION_POLL_MS);
socialIdentity()
  .then(function (data) {
    var login = data && data.identity && data.identity.login;
    if (!login) return;
    collaborationViewerLogin = login;
    renderCollaborationPanel();
  })
  .catch(function () {});
`.trim();
}
