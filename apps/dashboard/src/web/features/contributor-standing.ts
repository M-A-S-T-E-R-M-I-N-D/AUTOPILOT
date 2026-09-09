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
 */
import {
  CONTRIBUTOR_STANDING_TIERS,
  contributorStandingTierSummary as sharedContributorStandingTierSummary,
} from '../contributor-standing-panel.js';

/** The Contributor standing explainer panel client — vanilla, external (keeps CSP script-src 'self'). */
export function contributorStandingJs(): string {
  return `
// Contributor standing explainer (CONTRIBUTOR JOURNEY, board web-mtt3hery-
// l8v0lf): a static read-only render of .github/CONTRIBUTOR-STANDING.md's
// tiers table — the smallest of that task's four named pieces, since its
// content needs no GitHub API call. Fixed doctrine, not a live fact, so
// (like the tour's TOUR_STEPS) it renders once at load instead of riding a
// fetch or poll timer.
// CONTRIBUTOR_STANDING_TIERS/contributorStandingTierSummary are generated
// FROM web/contributor-standing-panel.ts below — their real value/compiled
// source via JSON.stringify()/.toString(), not a hand-retyped copy. They can
// no longer drift apart.
var CONTRIBUTOR_STANDING_TIERS = ${JSON.stringify(CONTRIBUTOR_STANDING_TIERS)};
${sharedContributorStandingTierSummary.toString()}
function renderContributorStandingPanel() {
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
  section.hidden = false;
  translateDom(document.documentElement.lang || 'en');
}
renderContributorStandingPanel();
`.trim();
}
