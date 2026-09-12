// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Contributor standing explainer panel — a static, read-only render of
 * `.github/CONTRIBUTOR-STANDING.md`'s tiers table, the same "whole bundle-
 * composing region under web/features/" shape `web/features/publicity.ts`
 * and `web/features/tour.ts` already establish (epic 0002 "shell
 * decomposition"). `web/shell.ts`'s `clientJs()` calls it indirectly through
 * `featureModulesJs()`, so its return value — not this file's compiled
 * source — is what lands in the served `/app.js` text.
 * `discoverFeatureModules('web/features')` finds this file's
 * `contributorStandingJs` export the same way it finds `tour.ts`'s.
 *
 * Unlike `publicity.ts` (a `GET /api/publicity` fetch) this panel has no
 * server counterpart: the tiers are fixed doctrine, not a live GitHub fact,
 * so — like `tour.ts`'s `TOUR_STEPS` — the data rides straight into the
 * bundle via `JSON.stringify()` instead of a round trip. It self-initializes
 * once at module load (same "independent of any flown project, so it
 * doesn't wait for `renderProjectPage()`" reasoning `publicity.ts` uses) —
 * fleet-wide, not per-project, since standing is earned against THIS repo,
 * not any flown one.
 *
 * i18n (board web-msnsndki-dz3vn1): the title/intro and every tier's
 * `<dt>`/`<dd>` text carry their English default AND a `data-i18n` tag, the
 * same graceful-degradation shape `docs-viewer.ts`'s empty/unavailable
 * states use — a missing key in the strings table is a silent no-op
 * (`locale.ts`'s `translateDom`), never a broken render, so this ships
 * without new `packages/tokens/src/strings.ts` entries: that file carries
 * live, uncommitted work on the Hebrew i18n foundation this firing (FLEET
 * claim), and touching it here would collide. A follow-up slice adds the
 * real per-tier translation keys once that work lands. For the same reason,
 * `web/shell.ts`'s `#contributor-standing-panel` section carries a plain
 * `aria-label` with no `data-i18n-aria` — `shell-i18n.test.ts` requires
 * every `data-i18n-aria` key to resolve in every locale, which a
 * `strings.ts`-less key cannot satisfy today.
 *
 * The "prefilled partner-application deep-link" (CONTRIBUTOR JOURNEY's
 * second named piece): a real `<a>` to `.github/ISSUE_TEMPLATE/partner-
 * application.yml`, pre-selected via GitHub's own `?template=` query param —
 * no server round trip, no new API. `CONTRIBUTOR_STANDING_APPLY_URL` (from
 * `web/contributor-standing-panel.ts`) is the real URL, built there against
 * `info.ts`'s `UPSTREAM_REPO`, spliced in via `JSON.stringify()` the same way
 * `CONTRIBUTOR_STANDING_TIERS` is below — a same-file local const built from
 * a function call is a "non-splice slot" `generate-splice-manifest.mjs`
 * cannot resolve, so the URL is computed at its source module instead of
 * here.
 */
import {
  CONTRIBUTOR_STANDING_APPLY_URL,
  CONTRIBUTOR_STANDING_TIERS,
  contributorStandingTierSummary as sharedContributorStandingTierSummary,
  standingPanelOffer,
  CONTRIBUTOR_STANDING_REVIEW_URL,
} from '../contributor-standing-panel.js';

/** The Contributor standing explainer panel client — vanilla, external (keeps CSP script-src 'self'). */
export function contributorStandingJs(): string {
  return `
// Contributor standing explainer (CONTRIBUTOR JOURNEY, board web-mtt3hery-
// l8v0lf): a static read-only render of .github/CONTRIBUTOR-STANDING.md's
// tiers table plus a prefilled "apply" deep-link — two of that task's four
// named pieces, since neither needs a GitHub API call. Fixed doctrine, not a
// live fact, so (like the tour's TOUR_STEPS) it renders once at load instead
// of riding a fetch or poll timer.
// CONTRIBUTOR_STANDING_TIERS/contributorStandingTierSummary are generated
// FROM web/contributor-standing-panel.ts below — their real value/compiled
// source via JSON.stringify()/.toString(), not a hand-retyped copy. They can
// no longer drift apart.
var CONTRIBUTOR_STANDING_TIERS = ${JSON.stringify(CONTRIBUTOR_STANDING_TIERS)};
var CONTRIBUTOR_STANDING_APPLY_URL = ${JSON.stringify(CONTRIBUTOR_STANDING_APPLY_URL)};
var CONTRIBUTOR_STANDING_REVIEW_URL = ${JSON.stringify(CONTRIBUTOR_STANDING_REVIEW_URL)};
${sharedContributorStandingTierSummary.toString()}
// standingPanelOffer decides what this panel may OFFER the viewer — the
// role-honesty law pointed at the owner instead of the visitor.
${standingPanelOffer.toString()}
function renderContributorStandingPanel(role, tier) {
  var section = document.getElementById('contributor-standing-panel');
  if (!section) return;
  section.replaceChildren();
  var head = el('h3', 'contributor-standing-title', 'Contributor standing');
  head.setAttribute('data-i18n', 'contributorStandingTitle');
  section.appendChild(head);
  var intro = el('p', 'contributor-standing-intro', 'Trust widens what you can claim — it never bypasses the gate or review.');
  intro.setAttribute('data-i18n', 'contributorStandingIntro');
  section.appendChild(intro);
  var list = el('dl', 'contributor-standing-list');
  for (var i = 0; i < CONTRIBUTOR_STANDING_TIERS.length; i++) {
    var tier = CONTRIBUTOR_STANDING_TIERS[i];
    var dt = el('dt', 'contributor-standing-tier', tier.tier);
    list.appendChild(dt);
    var dd = el('dd', 'contributor-standing-summary', contributorStandingTierSummary(tier));
    list.appendChild(dd);
  }
  section.appendChild(list);
  // One builder for both links: they differ only in text, href and tip.
  // Duplicating the anchor setup cost real bundle bytes on a budgeted chunk
  // for no behaviour.
  function standingLink(text, href, tip, i18nKey) {
    var a = document.createElement('a');
    a.className = 'contributor-standing-apply';
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('data-tip', tip);
    a.setAttribute('aria-label', tip);
    if (i18nKey) {
      a.setAttribute('data-i18n', i18nKey);
      a.setAttribute('data-i18n-tip', 'contributorStandingApplyTip');
    }
    section.appendChild(a);
  }
  var offer = standingPanelOffer(role || 'unknown', tier || null);
  if (offer.showApply) {
    standingLink(
      'Apply for Active partner standing',
      CONTRIBUTOR_STANDING_APPLY_URL,
      'Opens a prefilled GitHub issue using the Active-partner application template.',
      'contributorStandingApplyLabel'
    );
  }
  if (offer.showReviewApplications) {
    standingLink(
      'Review standing applications',
      CONTRIBUTOR_STANDING_REVIEW_URL,
      'You are the maintainer — the ladder above is what others climb. Opens the open partner-application issues awaiting your decision.',
      ''
    );
  }
  section.hidden = false;
  translateDom(document.documentElement.lang || 'en');
}
// Mark the viewer's own rung, so the ladder reads as "where you stand"
// rather than "what you are missing".
function markStandingTier(youAreHere) {
  if (!youAreHere) return;
  var rows = document.querySelectorAll('#contributor-standing-panel .contributor-standing-tier');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].textContent !== youAreHere) continue;
    rows[i].classList.add('contributor-standing-tier-you');
    rows[i].setAttribute('data-tip', 'This is you.');
    rows[i].textContent = youAreHere + ' - you';
  }
}
// Render immediately with what we know (nothing), then correct once the
// identity resolves. A failed lookup leaves the newcomer-safe default
// standing rather than blanking the panel.
renderContributorStandingPanel('unknown', null);
socialIdentity()
  .then(function (data) {
    var role = data && data.identity && data.identity.role;
    if (!role) return;
    var tier = data.identity.tier || null;
    renderContributorStandingPanel(role, tier);
    markStandingTier(standingPanelOffer(role, tier).youAreHere);
  })
  .catch(function () {});
`.trim();
}
