// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PROVENANCE ON A PUBLIC ARTIFACT (operator, 2026-09-14: "tag the pilot,
 * tag the model and who made it, and let everyone see it").
 *
 * What an issue, a PR or a comment carries about how it was made. This is
 * `docs/ATTRIBUTION.md`'s channel 2 grown a machine-readable half, and it
 * answers a real obligation rather than a preference:
 *
 *  - **EU AI Act Article 50** has applied since 2026-08-02, and Article
 *    2(12)'s open-source exemption expressly does NOT cover Article 50.
 *    The Commission's guidelines put source code and its integral comments
 *    outside Article 50(2) — but say nothing about issue bodies, PR
 *    descriptions or comments, which on the face of the text are ordinary
 *    synthetic text. Article 50(4)'s carve-out is the exit: text a human
 *    reviewed before publication, with a person holding editorial
 *    responsibility, needs no label. Hence {@link ReviewState}: the review
 *    field is the legally load-bearing one, not the model name.
 *  - **Anthropic's usage policy** treats "automatically generate content
 *    and publish it for external consumption" as a high-risk use case
 *    requiring both human-in-the-loop and disclosure. That is a contract,
 *    and it binds more clearly than any statute here.
 *
 * Three things this module deliberately does NOT do, each for a reason
 * found in the record rather than invented:
 *
 *  1. **No cost, no tokens, on a public artifact.** The figure we hold is
 *     API list price with cache reads making up most of it, self-reported
 *     by the agent it describes (`docs/MODEL-CARD.md`, `docs/RESEARCH-LIBRARY.md`).
 *     A maintainer reads "$2.40" as what their project cost someone. It
 *     is not. The cross-pilot cost table belongs on AUTOPILOT's own
 *     dashboard, where the caveats travel with the number.
 *  2. **No fixed format everywhere.** Projects now actively contradict each
 *     other: the Linux kernel requires `Assisted-by: LLM` and in August
 *     2026 deliberately REMOVED the model name from it ("provides free
 *     advertising to proprietary software companies while adding little or
 *     no useful information"); Kubernetes and Homebrew forbid an AI commit
 *     trailer outright. One format imposed on every repo violates
 *     somebody's policy by construction. Hence {@link ProvenanceProfile},
 *     which fails toward LESS output when the target is unrecognized.
 *  3. **No `Co-authored-by` naming a model.** Several major projects ban
 *     that form, and GitHub matches the co-author email to a real account,
 *     so it either dangles or misattributes.
 *
 * The human stays `Author` and `Signed-off-by` everywhere, unchanged: only
 * a human can certify the DCO, which the Linux kernel's own merged policy
 * states in as many words.
 */

/** Whether a human stood behind this text before it was published. The one
 *  field with legal weight: EU 50(4) exempts text a human reviewed and took
 *  editorial responsibility for, and Anthropic's policy requires that
 *  review independently. */
export type ReviewState =
  /** A human read it before it went out and takes responsibility. */
  | 'human-reviewed'
  /** Posted with no human in between — must therefore carry the label. */
  | 'unreviewed'
  /** A human wrote it; the tool only delivered it. */
  | 'human-authored';

/**
 * How much provenance a given target repository wants. Chosen per target,
 * never globally, and an unknown target gets `minimal` — failing toward
 * less output is the safe direction when the local policy is unread.
 */
export type ProvenanceProfile =
  /** Our own repos and projects with no contrary policy: the visible line,
   *  the machine-readable block, and the model named. */
  | 'default'
  /** Kernel-style: an `Assisted-by: LLM` commit trailer with NO model name,
   *  and the artifact block without model ids. */
  | 'kernel'
  /** Projects that forbid an AI commit trailer and want prose in the body
   *  instead (Kubernetes, Homebrew). No trailer at all. */
  | 'prose-only'
  /** Target policy unread: the identity line alone, nothing machine-read. */
  | 'minimal'
  /** Credit suppressed by the operator. The identity line still goes out —
   *  the identity law is not an attribution preference. */
  | 'off';

/** One model that contributed, and how much of it. Cost is absent on
 *  purpose; see the module note. */
export interface ProvenanceModel {
  /** The publisher, resolved by `model-vendor.ts` — omitted when unknown,
   *  never guessed. */
  readonly vendor?: string;
  /** The model string as the CLI received it. */
  readonly id: string;
  /** Firings this model ran toward the artifact. Omitted when not known,
   *  rather than defaulted to a number nobody measured. */
  readonly firings?: number;
}

export interface ProvenanceFacts {
  readonly toolVersion: string;
  readonly toolUrl: string;
  /** The human this instance acts for — the identity law's subject. */
  readonly operatorHandle: string;
  readonly review: ReviewState;
  /** Every model that contributed, in the order they did. An artifact two
   *  models touched lists both; one nobody can name lists none. */
  readonly models: readonly ProvenanceModel[];
  /** The firing prompt's version — the field that actually helps someone
   *  reproduce a result. */
  readonly promptVersion?: string;
  /** ISO-8601. Supplied by the caller so this module stays pure. */
  readonly generatedAt: string;
}

/** The block's schema version. Bumped only by ADDING fields; a parser must
 *  ignore what it does not know and must not fail on a higher version it
 *  can still partly read. */
export const PROVENANCE_SCHEMA_VERSION = 1;

/** The marker a parser looks for. Kept as a constant because it is a
 *  contract with every reader downstream, not a formatting choice. */
export const PROVENANCE_MARKER = 'autopilot-provenance';

/** The sentence that closes EU 50(4) when a human reviewed, and the one
 *  that satisfies it honestly when nobody did. */
function reviewSentence(review: ReviewState): string {
  switch (review) {
    case 'human-reviewed':
      return 'AI-assisted, human-reviewed before posting.';
    case 'unreviewed':
      return 'AI-generated and posted without human review.';
    case 'human-authored':
      return 'Written by a human; delivered by the tool.';
  }
}

/**
 * The one visible line. Extends the identity law's "Flown by … on behalf
 * of @operator" with the review state, because that clause is what a
 * reader — and a regulator — actually needs, and it costs one clause.
 */
export function provenanceLine(facts: ProvenanceFacts): string {
  return (
    `🛩️ Flown by [AUTOPILOT](${facts.toolUrl}) v${facts.toolVersion}, on behalf of ` +
    `@${facts.operatorHandle} — ${reviewSentence(facts.review)}`
  );
}

/**
 * The machine-readable half, as an HTML comment: invisible to a reader,
 * fully present in the raw body over the API. A visible table of metadata
 * on every artifact is the thing maintainers call slop; an invisible block
 * is provenance.
 */
export function provenanceBlock(facts: ProvenanceFacts, profile: ProvenanceProfile): string {
  const payload: Record<string, unknown> = {
    v: PROVENANCE_SCHEMA_VERSION,
    tool: { name: 'AUTOPILOT', version: facts.toolVersion, url: facts.toolUrl },
    operator: facts.operatorHandle,
    agent: true,
    review: facts.review,
    generated_at: facts.generatedAt,
  };
  // The kernel profile carries the fact that an LLM was involved without
  // naming it — its maintainers decided the name buys nothing and
  // advertises somebody. We follow the target's rule, not our preference.
  if (profile !== 'kernel' && facts.models.length > 0) payload['models'] = facts.models;
  if (facts.promptVersion !== undefined) payload['prompt_version'] = facts.promptVersion;
  return `<!-- ${PROVENANCE_MARKER}\n${JSON.stringify(payload)}\n-->`;
}

/**
 * The whole footer for one artifact, under one profile.
 *
 * `minimal` and `off` emit the identity line and nothing else: the
 * identity law ("say what you are, and who you act for") is not an
 * attribution preference an operator or a target repo can switch off.
 */
export function provenanceFooter(facts: ProvenanceFacts, profile: ProvenanceProfile): string {
  const line = provenanceLine(facts);
  if (profile === 'minimal' || profile === 'off') return line;
  return `${line}\n\n${provenanceBlock(facts, profile)}`;
}

/**
 * The commit trailer for a profile, or `undefined` where the target forbids
 * one. Never a `Co-authored-by`, and never a `Signed-off-by` — only a human
 * can certify the DCO.
 */
export function provenanceTrailer(
  facts: ProvenanceFacts,
  profile: ProvenanceProfile,
): string | undefined {
  if (profile === 'prose-only' || profile === 'off') return undefined;
  if (profile === 'kernel') return 'Assisted-by: LLM';
  return `Assisted-by: AUTOPILOT v${facts.toolVersion} <${facts.toolUrl}>`;
}

/** Files a target repository's own policy names, most specific first. */
export const POLICY_FILES: readonly string[] = [
  'docs/process/coding-assistants.rst',
  'AI_POLICY.md',
  '.github/AI_POLICY.md',
  'CONTRIBUTING.md',
];

/**
 * Reads a profile off a target repository's own policy text.
 *
 * Deliberately conservative: it only recognizes wordings projects actually
 * publish, and everything else becomes `minimal`. A wrong guess that emits
 * MORE than a project allows is the expensive mistake; a wrong guess that
 * emits less is merely quiet.
 */
export function profileFromPolicyText(text: string | undefined): ProvenanceProfile {
  if (text === undefined || text.trim() === '') return 'minimal';
  const t = text.toLowerCase();
  // Projects that forbid the trailer say so plainly, and they are the ones
  // it costs most to get wrong — checked first.
  const forbidsTrailer =
    /do not (?:add|use|include)[^.]{0,80}(?:assisted-by|co-developed|co-authored)/.test(t) ||
    /(?:assisted-by|co-authored-by)[^.]{0,80}(?:is |are )?(?:not permitted|forbidden|prohibited)/.test(
      t,
    ) ||
    /no llm bots in [`']?co-authored-by/.test(t);
  if (forbidsTrailer) return 'prose-only';
  // The kernel's merged wording, and the reason it changed: the tag records
  // that an LLM was used without tracking which one.
  if (/assisted-by:\s*llm/.test(t)) return 'kernel';
  if (/assisted-by:/.test(t) || /generated-by:/.test(t)) return 'default';
  return 'minimal';
}
