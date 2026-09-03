// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Ask-your-project (M4 chat/RAG): retrieve the most relevant indexed excerpts,
 * build the injection-defended grounded prompt (engine's buildAskPrompt), run a
 * TOOL-LESS model call, and return the answer with the cited paths. All effects
 * (retrieval, the LLM call) are injected so the flow is deterministically
 * testable; the composition root wires the real store + Claude CLI.
 */

import {
  buildAskPrompt,
  buildAskEscalationPrompt,
  ASK_PROMPT_VERSION,
  ASK_ESCALATION_PROMPT_VERSION,
  LIVE_STATE_LABEL,
  VIEW_CONTEXT_LABEL,
  type AskSource,
  type AskTurn,
  type Activity,
} from '@autopilot/engine';
import {
  buildArchitectAddendum,
  parseArchitectProposal,
  type AskPersona,
  type ArchitectProposal,
} from './architect-proposal.js';

/** Max sources fed to the model — grounding beats volume (and caps cost). */
const MAX_SOURCES = 3;
/** Max prior turns fed to the model — enough for pronoun/follow-up context
 *  without letting a long-running chat balloon prompt size (and cost). */
const MAX_HISTORY_TURNS = 6;

export const NO_SOURCES_ANSWER =
  'Nothing in the indexed code matches that question — try different words, or re-onboard the folder to refresh the index.';

export interface AskRetrievalDeps {
  /** Retrieve the most relevant excerpts for a question (already truncated). */
  readonly sources: (projectId: string, question: string) => readonly AskSource[];
  /** A compact structure map of the project — ALWAYS included so the model is
   *  fully aware of what it is being asked about, content match or not. */
  readonly projectMap: (projectId: string) => string | null;
  /** A live-telemetry snapshot (current flight, recent firings, board counts) —
   *  ALWAYS included so "what's happening now" questions are grounded in truth
   *  rather than the (necessarily stale) indexed content. */
  readonly liveState: (projectId: string) => string | null;
}

export interface AskDeps extends AskRetrievalDeps {
  /** Run the grounded prompt on a model with NO tools; null on quota/error. */
  readonly invoke: (prompt: string) => Promise<string | null>;
  /**
   * Epic 0012 slice 2's automatic trigger: when retrieval finds zero sources,
   * escalate to the read-only agentic tier ({@link askProjectEscalated})
   * instead of returning the static {@link NO_SOURCES_ANSWER}. Optional —
   * omitting it keeps today's short-circuit behavior (e.g. tests, or a
   * composition root that hasn't wired the escalation tier yet).
   */
  readonly escalation?: AskEscalationDeps;
}

export interface AskStreamDeps extends AskRetrievalDeps {
  /**
   * Run the grounded prompt on a model with NO tools, calling `onChunk` with
   * each incremental answer-text chunk as it streams in; resolves the full
   * answer (null on quota/error), same contract as {@link AskDeps.invoke}.
   */
  readonly invokeStream: (
    prompt: string,
    onChunk: (text: string) => void,
  ) => Promise<string | null>;
  /** Same automatic-trigger escalation as {@link AskDeps.escalation} —
   *  the escalated answer still resolves in full (no incremental answer-text
   *  chunks), but {@link askProjectStream}'s own `onActivity` param (epic
   *  0012 slice 3) relays the escalation session's live Read/Grep/Glob tool
   *  activity through this same dep's {@link AskEscalationDeps.invoke}. */
  readonly escalation?: AskEscalationDeps;
}

export interface AskResult {
  readonly ok: boolean;
  readonly answer: string;
  readonly sources: readonly string[];
  readonly promptVersion: string;
  /** ARCHITECT persona only (epic 0011 slice 3): the control-tool action the
   *  model proposed, lifted out of the answer — present ONLY when the persona
   *  was 'architect' AND the answer carried a valid proposal block. Untrusted
   *  model output: nothing executes until the operator confirms it via the
   *  action card against the confirm-gated execute endpoint. */
  readonly proposal?: ArchitectProposal;
}

/** Append the ARCHITECT-mode addendum (static trusted text) after the grounded
 *  prompt when the operator switched personas; the default persona's prompt is
 *  byte-identical to before the persona existed. */
function withPersona(prompt: string, persona?: AskPersona): string {
  return persona === 'architect' ? `${prompt}\n\n${buildArchitectAddendum()}` : prompt;
}

/** Build the success result for the tier-1 grounded flows: under the ARCHITECT
 *  persona a valid proposal block is lifted out of the answer into `proposal`
 *  (the prose keeps an invalid block visible); any other persona returns the
 *  answer untouched. */
function groundedSuccess(
  answer: string,
  sources: readonly AskSource[],
  persona?: AskPersona,
): AskResult {
  const paths = sources.map((s) => s.path);
  const base = {
    ok: true,
    answer: answer.trim(),
    sources: paths,
    promptVersion: ASK_PROMPT_VERSION,
  };
  if (persona !== 'architect') return base;
  const { prose, proposal } = parseArchitectProposal(answer.trim());
  return { ...base, answer: prose, ...(proposal ? { proposal } : {}) };
}

/**
 * Retrieve the grounded sources for one question. The current view (when the
 * caller supplies one), live state, and the project map are ALWAYS the first
 * sources — the model answers with full awareness of where the operator is
 * looking, what's happening right now, and the project's structure. Only when
 * none of view, live state, map, or content match is there truly nothing to
 * ground on.
 */
function gatherGroundedSources(
  deps: AskRetrievalDeps,
  projectId: string,
  question: string,
  view?: string,
): AskSource[] {
  const contentSources = deps.sources(projectId, question).slice(0, MAX_SOURCES);
  const live = deps.liveState(projectId);
  const map = deps.projectMap(projectId);
  const viewText = view?.trim();
  return [
    ...(viewText ? [{ path: VIEW_CONTEXT_LABEL, excerpt: viewText }] : []),
    ...(live !== null ? [{ path: LIVE_STATE_LABEL, excerpt: live }] : []),
    ...(map !== null ? [{ path: '(project structure)', excerpt: map }] : []),
    ...contentSources,
  ];
}

function askFailure(answer: string): AskResult {
  return { ok: false, answer, sources: [], promptVersion: ASK_PROMPT_VERSION };
}

/** Answer one question about one project, grounded in its indexed code.
 *  `view` is the operator's current dashboard page (e.g. "project page:
 *  acme-web"), client-supplied and optional — see {@link VIEW_CONTEXT_LABEL}.
 *  `deep` is epic 0012 slice 3's manual Deep-toggle trigger: when true (and
 *  an escalation dep is wired), the question ALWAYS escalates to the
 *  read-only agentic tier, regardless of whether tier-1 retrieval would have
 *  found sources — matching the board title's "insufficient OR toggle".
 *  `persona` (epic 0011 slice 3): 'architect' appends the control-proposal
 *  addendum and lifts a proposed action into {@link AskResult.proposal} —
 *  tier-1 grounded flow only; an escalated answer never carries a proposal. */
export async function askProject(
  deps: AskDeps,
  projectId: string,
  question: string,
  history?: readonly AskTurn[],
  view?: string,
  deep?: boolean,
  persona?: AskPersona,
): Promise<AskResult> {
  const q = question.trim();
  if (q.length === 0) return askFailure('A question is required.');

  if (deep && deps.escalation) return askProjectEscalated(deps.escalation, q, history);

  const sources = gatherGroundedSources(deps, projectId, q, view);
  if (sources.length === 0) {
    if (deps.escalation) return askProjectEscalated(deps.escalation, q, history);
    return { ok: true, answer: NO_SOURCES_ANSWER, sources: [], promptVersion: ASK_PROMPT_VERSION };
  }

  const answer = await deps.invoke(
    withPersona(
      buildAskPrompt({ question: q, sources, history: history?.slice(-MAX_HISTORY_TURNS) }),
      persona,
    ),
  );
  if (answer === null || answer.trim().length === 0) {
    return askFailure(
      'The model is unavailable right now (quota or connection) — try again shortly.',
    );
  }

  return groundedSuccess(answer, sources, persona);
}

/**
 * Streaming twin of {@link askProject}: identical retrieval + grounding, but the
 * model call streams its answer live via `onChunk` (the `/api/ask/stream` SSE
 * relay) instead of resolving all at once. Resolves the same `AskResult` the
 * non-streaming flow does, once the full answer is in. `deep` is the same
 * manual Deep-toggle trigger as {@link askProject}'s; `onActivity` (epic 0012
 * slice 3) relays the escalation session's live Read/Grep/Glob tool activity
 * when either trigger escalates — unused otherwise.
 */
export async function askProjectStream(
  deps: AskStreamDeps,
  projectId: string,
  question: string,
  onChunk: (text: string) => void,
  history?: readonly AskTurn[],
  view?: string,
  deep?: boolean,
  onActivity?: (activity: Activity) => void,
  persona?: AskPersona,
): Promise<AskResult> {
  const q = question.trim();
  if (q.length === 0) return askFailure('A question is required.');

  if (deep && deps.escalation) {
    return askProjectEscalated(deps.escalation, q, history, onActivity);
  }

  const sources = gatherGroundedSources(deps, projectId, q, view);
  if (sources.length === 0) {
    if (deps.escalation) return askProjectEscalated(deps.escalation, q, history, onActivity);
    return { ok: true, answer: NO_SOURCES_ANSWER, sources: [], promptVersion: ASK_PROMPT_VERSION };
  }

  const answer = await deps.invokeStream(
    withPersona(
      buildAskPrompt({ question: q, sources, history: history?.slice(-MAX_HISTORY_TURNS) }),
      persona,
    ),
    onChunk,
  );
  if (answer === null || answer.trim().length === 0) {
    return askFailure(
      'The model is unavailable right now (quota or connection) — try again shortly.',
    );
  }

  return groundedSuccess(answer, sources, persona);
}

export interface AskEscalationDeps {
  /**
   * Run the read-only agentic escalation session (Read/Grep/Glob only,
   * jailed to the project folder by the engine config + guard settings —
   * `packages/engine/src/ask-escalation.ts`) on the question; resolves the
   * final answer text (null on quota/error), same contract as
   * {@link AskDeps.invoke}. `onActivity` (epic 0012 slice 3) is called for
   * each tool the escalation session uses, in real time — optional, and only
   * ever supplied by the streaming (`askStream`) call site; the non-streaming
   * `ask` endpoint has no live transport to relay it over.
   */
  readonly invoke: (
    prompt: string,
    onActivity?: (activity: Activity) => void,
  ) => Promise<string | null>;
}

/**
 * Escalated twin of {@link askProject} (epic 0012 `docs/epics/0012-agentic-
 * ask-escalation.md`): no source retrieval — the model finds its own
 * grounding via Read/Grep/Glob instead of the FTS index, so there is no
 * "no sources" short-circuit to fall into. Reachable two ways: directly (the
 * manual Deep-toggle trigger, slice 3) and as {@link askProject}/
 * {@link askProjectStream}'s automatic fallthrough when `deps.escalation` is
 * set and retrieval finds zero sources (slice 2).
 */
export async function askProjectEscalated(
  deps: AskEscalationDeps,
  question: string,
  history?: readonly AskTurn[],
  onActivity?: (activity: Activity) => void,
): Promise<AskResult> {
  const q = question.trim();
  if (q.length === 0) return askFailure('A question is required.');

  const answer = await deps.invoke(
    buildAskEscalationPrompt({ question: q, history: history?.slice(-MAX_HISTORY_TURNS) }),
    onActivity,
  );
  if (answer === null || answer.trim().length === 0) {
    return askFailure(
      'The model is unavailable right now (quota or connection) — try again shortly.',
    );
  }

  return {
    ok: true,
    answer: answer.trim(),
    sources: [],
    promptVersion: ASK_ESCALATION_PROMPT_VERSION,
  };
}
