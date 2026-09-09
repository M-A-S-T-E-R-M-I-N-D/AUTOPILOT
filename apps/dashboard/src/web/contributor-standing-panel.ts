// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure data for the Contributor standing explainer panel — client-only (no
 * server counterpart, the same reason `web/tour.ts` lives here rather than
 * `shared/`). One slice of the CONTRIBUTOR JOURNEY board task (web-mtt3hery-
 * l8v0lf: "guided visitor-to-partner flow ... STANDING explainer"), which a
 * prior firing (92dfd1a1) correctly filed as a multi-firing epic needing its
 * own slice breakdown — this ships the smallest of its four named pieces: a
 * read-only STANDING tiers explainer, since its content already exists
 * verbatim in `.github/CONTRIBUTOR-STANDING.md` and needs no GitHub API call
 * (unlike the live good-first/help-wanted list, the /claim walkthrough, or
 * the prefilled partner-application deep-link, which all need real `gh` data
 * wiring a future slice still owes).
 *
 * `web/features/contributor-standing.ts` embeds this module's real compiled
 * source into the generated `/app.js` text via `.toString()`/`JSON.stringify()`
 * — see `contributorStandingJs()` — instead of hand-retyping it, so the two
 * copies can no longer drift apart.
 *
 * The four tiers below are ported verbatim from `.github/CONTRIBUTOR-
 * STANDING.md`'s "Standing tiers" table — that file, not this one, is the
 * source of truth; `contributor-standing-panel.test.ts` pins the two in sync.
 *
 * `CONTRIBUTOR_STANDING_APPLY_URL` imports `info.ts`'s `UPSTREAM_REPO` (a
 * plain string constant, no Node built-ins, safe from any module) so the
 * real "prefilled partner-application deep-link" URL is itself a top-level
 * binding — `generate-splice-manifest.mjs` only recognizes `JSON.stringify(
 * <relative-import binding>)` as a splice, not a same-file local const built
 * from a function call, so the URL is computed HERE, once, instead of at the
 * `features/contributor-standing.ts` call site.
 */
import { UPSTREAM_REPO } from '../info.js';

/**
 * What the standing panel should OFFER, given who is looking at it.
 *
 * The panel used to render "Apply for Active partner standing" to
 * everyone, unconditionally — including the repo's own maintainer, who
 * was being invited to apply for a rank below the one he already holds
 * (operator, 2026-09-09: "it looks like the system doesn't recognise
 * that I'm MASTERMIND"). The identity was never the problem:
 * `GET /api/social-identity` already resolved `role: 'maintainer'`
 * correctly. The panel simply never asked.
 *
 * This is the role-honesty law (EPIC 0019 law 1) pointed the other way.
 * The law is usually read as "a non-owner must not see a maintainer
 * verb"; its mirror is just as true — **an owner must not be shown a
 * visitor's verb**. A control offered to someone it cannot apply to is
 * the same defect in either direction.
 *
 * `'unknown'` (identity not resolved yet, or the lookup failed) keeps the
 * apply link: a visitor whose role we could not determine is far more
 * likely to be a newcomer than the maintainer, and withholding the one
 * onboarding affordance from a real newcomer is the worse mistake.
 */
export type StandingViewerRole = 'maintainer' | 'user' | 'unknown';

export interface StandingPanelOffer {
  /** Render the "Apply for Active partner standing" link. */
  readonly showApply: boolean;
  /** The viewer's own place on the ladder, when we know it — rendered as
   *  a "you are here" marker rather than an invitation. */
  readonly youAreHere: string | null;
  /** What to offer a maintainer instead of an application: their actual
   *  job, which is reviewing the applications other people file. */
  readonly showReviewApplications: boolean;
}

export function standingPanelOffer(role: StandingViewerRole): StandingPanelOffer {
  if (role === 'maintainer') {
    return { showApply: false, youAreHere: 'Maintainer', showReviewApplications: true };
  }
  return { showApply: true, youAreHere: null, showReviewApplications: false };
}

/** Where a maintainer goes to see who has applied — the standing
 *  applications are `partner-application`-labeled issues on the upstream
 *  repo, the same ones `flight/contributor-dossier.ts` builds evidence
 *  dossiers for. */
export function partnerApplicationsReviewUrl(upstreamRepo: string): string {
  // Concatenation, not a template literal — a bare template-literal return
  // is exactly the shape `generate-splice-manifest.mjs` treats as a
  // bundle-composing assembler, which would land this data module in the
  // splice manifest as a phantom. Its sibling `partnerApplicationUrl`
  // below carries the same note for the same reason.
  return (
    'https://github.com/' +
    upstreamRepo +
    '/issues?q=is%3Aissue+is%3Aopen+label%3Apartner-application'
  );
}

/** One contributor standing tier's explainer row. */
export interface ContributorStandingTier {
  readonly tier: string;
  readonly who: string;
  readonly unlocks: string;
  readonly earnedBy: string;
}

/** The standing ladder, in ascending order — `.github/CONTRIBUTOR-
 *  STANDING.md` is the doctrine both sides' fleets read; this restates its
 *  "what/how" for a human visiting the dashboard instead of the repo. */
export const CONTRIBUTOR_STANDING_TIERS: readonly ContributorStandingTier[] = [
  {
    tier: 'Newcomer',
    who: 'anyone',
    unlocks: '/claim on good first issue + help wanted',
    earnedBy: 'showing up',
  },
  {
    tier: 'Contributor',
    who: 'a human with merged work here',
    unlocks: 'claiming larger scoped issues; their voice weighs in triage',
    earnedBy: '≥1 merged PR through the full ritual',
  },
  {
    tier: 'Active partner',
    who: 'a proven contributor who applies',
    unlocks:
      'batch claims; their AUTOPILOT may work agent-ok-labeled upstream tasks (under caps, disclosed); early roadmap input',
    earnedBy: 'application + maintainer approval',
  },
  {
    tier: 'Maintainer-delegate',
    who: 'invitation only',
    unlocks: 'scoped review powers',
    earnedBy: 'sustained partnership',
  },
];

/** One tier's single-line summary — who it's for, what it unlocks, how it's
 *  earned — the `<dd>` text under that tier's `<dt>` name. String
 *  concatenation, not a template literal: a bare `return \`...\`;` body is
 *  exactly the shape `generate-splice-manifest.mjs` treats as an assembler
 *  function (see `publicityAffordanceTip`'s own concatenation, same reason),
 *  and this is a plain data formatter, not a served-bundle assembler. */
export function contributorStandingTierSummary(tier: ContributorStandingTier): string {
  return tier.who + ' — unlocks ' + tier.unlocks + ' — earned by ' + tier.earnedBy;
}

/** The "prefilled partner-application deep-link" the CONTRIBUTOR JOURNEY
 *  board task names — a second slice of that task, alongside the tiers
 *  explainer above. GitHub pre-selects an issue template from a `template=`
 *  query param naming the file under `.github/ISSUE_TEMPLATE/` (here,
 *  `partner-application.yml` — the same 🤝 Active-partner application form
 *  `.github/CONTRIBUTOR-STANDING.md`'s "Applying" section walks through), so
 *  this needs no server round trip: the link is fully determined by which
 *  repo it targets. `upstreamRepo` takes `info.ts`'s `UPSTREAM_REPO` at the
 *  Node-side call in `features/contributor-standing.ts` — this function
 *  itself stays param-only (no closure) so its `.toString()` splices clean
 *  into the served bundle, the same self-containment
 *  `contributorStandingTierSummary` above already keeps. */
export function partnerApplicationUrl(upstreamRepo: string): string {
  return 'https://github.com/' + upstreamRepo + '/issues/new?template=partner-application.yml';
}

/** The real deep-link for THIS repo, spliced into the served bundle via
 *  `JSON.stringify()` the same way {@link CONTRIBUTOR_STANDING_TIERS} is. */
export const CONTRIBUTOR_STANDING_APPLY_URL = partnerApplicationUrl(UPSTREAM_REPO);

/** Where a maintainer reviews the applications others filed — computed
 *  here beside its sibling so the feature module splices a value, never a
 *  call. */
export const CONTRIBUTOR_STANDING_REVIEW_URL = partnerApplicationsReviewUrl(UPSTREAM_REPO);
