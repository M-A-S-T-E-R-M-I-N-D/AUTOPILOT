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
 */

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
