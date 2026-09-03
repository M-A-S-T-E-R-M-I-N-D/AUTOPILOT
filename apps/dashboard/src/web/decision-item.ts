// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure decision-item head text math shared by the two KEEPER decision
 * panels — `issue-triage-panel.ts` and `pr-review-panel.ts` each render one
 * list item per plan with an identical two-piece head (a "#N" number chip
 * whose data-tip/aria-label name the item, plus a decision badge whose
 * tip/aria-label state the reasoning) that `renderIssueTriageBody`/
 * `renderPrReviewPanel` each hand-retyped as an identical block before this
 * cut (epic 0002 "shell decomposition", slice 2). Neither panel module
 * imports the other's domain-specific decision-label function or plan
 * shape, so this shared head math lives in its own sibling module rather
 * than either panel's, the same "no panel conceptually owns the other's
 * domain" reasoning the shared/ modules use for server/client splits.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One decision item's number-chip + decision-badge text set. */
export interface DecisionItemHeadMeta {
  readonly numberTip: string;
  readonly numberAriaLabel: string;
  readonly badgeText: string;
  readonly badgeTip: string;
  readonly badgeAriaLabel: string;
  readonly badgeClass: string;
}

/** The number-chip + decision-badge text math for one KEEPER decision item
 *  — `tipNoun`/`ariaNoun` name the item kind for the "#N" chip's data-tip/
 *  aria-label pair ("GitHub issue"/"issue" vs "GitHub PR"/"pull request"),
 *  `classPrefix` namespaces the badge's CSS classes ("issue-triage" vs
 *  "pr-review"), and `label`/`reasoning` come from the caller's own
 *  already-resolved decision label (`issueTriageDecisionLabel`/
 *  `prReviewDecisionLabel`) and `plan.decision.reasoning` — this function
 *  takes them via injection rather than importing either panel's
 *  decision-label function, the same `heatmapDays(..., verdictOf)`
 *  injection pattern used elsewhere in this epic. */
export function decisionItemHeadMeta(
  tipNoun: string,
  ariaNoun: string,
  classPrefix: string,
  item: { readonly number: number; readonly title: string },
  decision: string,
  label: string,
  reasoning: string,
): DecisionItemHeadMeta {
  return {
    numberTip: tipNoun + ' #' + item.number + ': ' + item.title,
    numberAriaLabel: ariaNoun + ' #' + item.number + ': ' + item.title,
    badgeText: label,
    badgeTip: reasoning,
    badgeAriaLabel: 'decision: ' + label + ' — ' + reasoning,
    badgeClass: classPrefix + '-badge ' + classPrefix + '-badge-' + decision,
  };
}
