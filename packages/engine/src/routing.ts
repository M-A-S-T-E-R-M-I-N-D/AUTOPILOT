// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cost-aware model routing (M6, ENGINE-RESEARCH §5 lever I2/§6 I1-I2): the
 * pure decision of which tier — **local** (mechanical, confidential),
 * **cheap** cloud, or **top** tier (hard reasoning/security/architecture) —
 * a unit of work should run on, and which configured model string that tier
 * resolves to. Faithful to `resilience.ts`'s precedent (v2.4 port commit
 * 7b3cafe): land the pure logic first, fully unit-tested, before the impure
 * firing/loop orchestrator or a local-model adapter exist to consume it.
 * Two real call sites exist today: `fly.ts`'s board-TRIAGE step resolves its
 * local-tier model through `tierForSubstepKind('triage')`/`modelForTier`
 * (see `docs/FEATURE-COVERAGE.md`'s M6 row), and the dashboard's
 * ask-your-project endpoints (`server/main.ts`) resolve their cheap-tier
 * model the same way. The other `SubstepKind`s —
 * `commit-draft`/`remediation-formatting`/`summary`/`docs-fix`/`code-review`/
 * the `top`-tier kinds — have no call sites yet; routing them means
 * inventing new LLM call sites for work that is currently either
 * model-free or inline, not a safe wiring change on its own.
 */

/**
 * A known, safely-routable substep kind — ENGINE-RESEARCH §5's own
 * "mechanical" examples (remediation formatting, commit drafts, summaries),
 * board TRIAGE (also tool-less and single-turn), plus the cheap and top
 * rungs above them. Deliberately a closed set rather than free-text
 * classification: the router looks a kind up in an exhaustive table instead
 * of guessing about arbitrary text, so nothing slips into a tier it was
 * never vetted for.
 */
export type SubstepKind =
  | 'remediation-formatting'
  | 'commit-draft'
  | 'summary'
  | 'triage'
  | 'docs-fix'
  | 'code-review'
  | 'ask'
  | 'bug-fix'
  | 'feature-implementation'
  | 'security-review'
  | 'architecture-decision';

export type RoutingTier = 'local' | 'cheap' | 'top';

export interface RoutingConfig {
  readonly localModel: string;
  readonly cheapModel: string;
  readonly topModel: string;
}

const SUBSTEP_TIER: Readonly<Record<SubstepKind, RoutingTier>> = {
  'remediation-formatting': 'local',
  'commit-draft': 'local',
  summary: 'local',
  triage: 'local',
  'docs-fix': 'cheap',
  'code-review': 'cheap',
  // Ask-your-project: tool-less single-turn Q&A over retrieved sources —
  // routine comprehension, not deep reasoning; the cloud cheap tier (its
  // pre-routing hardcoded model) keeps answer quality user-facing-grade.
  ask: 'cheap',
  'bug-fix': 'top',
  'feature-implementation': 'top',
  'security-review': 'top',
  'architecture-decision': 'top',
};

/**
 * Which tier a known substep kind routes to. Every {@link SubstepKind} has an
 * entry in the table (enforced by the type), so a typed caller can never hit
 * an "unknown kind" case.
 */
export function tierForSubstepKind(kind: SubstepKind): RoutingTier {
  return SUBSTEP_TIER[kind];
}

/** Resolves a tier to the model string `config` has configured for it. */
export function modelForTier(tier: RoutingTier, config: RoutingConfig): string {
  if (tier === 'local') return config.localModel;
  if (tier === 'cheap') return config.cheapModel;
  return config.topModel;
}

function isSubstepKind(label: string): label is SubstepKind {
  return Object.prototype.hasOwnProperty.call(SUBSTEP_TIER, label);
}

/**
 * Routes an untrusted substep-kind LABEL — not yet known to be a valid
 * {@link SubstepKind}, e.g. a future triage classifier's string output — to a
 * model. ENGINE-RESEARCH §7's own caution: "misroute must fail *safe*
 * (escalate to top tier + verify), never ship unverified local output" — an
 * unrecognized label always escalates to `config.topModel`, it never
 * defaults to the local or cheap tier.
 */
export function selectModelForSubstepLabel(label: string, config: RoutingConfig): string {
  // Stryker disable next-line ConditionalExpression: forcing this guard to
  // `false` is unobservable — for ANY label, `tierForSubstepKind` (a plain
  // object lookup) yields something that is never `'local'` or `'cheap'`
  // when `label` isn't a real `SubstepKind`, so `modelForTier`'s own final
  // branch already returns `config.topModel` on the fallthrough path. Two
  // independent layers agreeing on the same fail-safe default is
  // intentional belt-and-suspenders per ENGINE-RESEARCH §7 above, not a gap
  // — provably equivalent, not killable.
  if (!isSubstepKind(label)) return config.topModel;
  return modelForTier(tierForSubstepKind(label), config);
}
