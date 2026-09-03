// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MODEL ROUTING v1 (web-msvz7n8o-nynbbs, RESEARCH-LIBRARY "Model economics —
 * the sonnet monoculture and when Fable pays"): `fly.ts` hardcoded
 * `primaryModel: 'sonnet'` for all 686 lifetime firings — the founder's own
 * routing doctrine (mechanical → Haiku, build/test slices → Sonnet,
 * architecture/EPIC-SPEC/stuck-task escalation → Fable/Opus) stayed
 * unimplemented; `AUTOPILOT_MODEL` was the only lever, and it's flight-wide,
 * not per-task. This classifies the board task a firing is ABOUT to work
 * into a tier from signals already on hand at prompt-build time (its title's
 * `EPIC-SPEC:` marker, its measured slice-streak, keyword cues) and resolves
 * that tier to a concrete model string, honoring the existing env overrides
 * (`AUTOPILOT_MODEL` flight-wide, `AUTOPILOT_MECHANICAL_MODEL` per
 * `triage.ts`'s precedent) so an operator can still pin a model without
 * editing source.
 */

import { extractEpicSpec } from './epic-spec.js';
import { resolveMechanicalModel } from './triage.js';

export type ModelTier = 'mechanical' | 'default' | 'escalated';

/** Title prefixes the autopilot's own self-mined maintenance rituals use
 *  (fly.ts's DOC-FRESHNESS and CLOSED-TASK AUDIT sweeps) — cheap
 *  re-verification work, not net-new feature reasoning. */
const MECHANICAL_TITLE_PREFIXES = ['DOC-FRESHNESS:', 'CLOSED-TASK AUDIT:'];

/** Decision-heavy cues the routing doctrine calls out by name — architecture
 *  calls and security review, the UNLOCK B saga's lesson (38 Sonnet firings/
 *  $104 circling tool-layers before one ARCHITECTURE call unblocked it). */
const ESCALATION_KEYWORD_RE = /\b(architecture|security review)\b/i;

/** A task still advancing by SLICE after this many trailing slices, never
 *  reaching complete, is the "stuck" pattern worth escalating early — the
 *  same evidence `triage-factors.ts`'s `factorSuffix` starts surfacing to
 *  the triage model at, well before the much stricter `isRunaway` demotion
 *  threshold (spend > $50 AND firings > 10) fires. */
// Raised 3 -> 6 after the first 5-agent run: with a mature board (most
// tasks carry long slice histories and half carry EPIC-SPEC markers) the
// old thresholds escalated 93% of firings to fable — draining the
// subscription's premium-model window mid-run and DROPPING the ship rate
// to 47%. Escalation must be the exception (target: 10-20% of firings).
export const SLICE_STREAK_ESCALATION_THRESHOLD = 6;
/** EPIC-SPEC alone no longer escalates — only an epic task that is ALSO
 *  measurably grinding (this many trailing slices) gets the big model. */
export const EPIC_SPEC_ESCALATION_MIN_STREAK = 3;

export interface ModelRoutingSignals {
  readonly title: string;
  /** The task's trailing run of 'slice' completions (0 for a fresh/unworked task). */
  readonly sliceStreak: number;
}

/** Classify the task a firing is about to work into a routing tier. Order
 *  matters: an EPIC-SPEC'd or already-stuck task escalates even if its title
 *  also happens to carry a mechanical-ritual prefix. */
export function classifyTaskModelTier(signals: ModelRoutingSignals): ModelTier {
  if (
    extractEpicSpec(signals.title) !== null &&
    signals.sliceStreak >= EPIC_SPEC_ESCALATION_MIN_STREAK
  ) {
    return 'escalated';
  }
  if (signals.sliceStreak >= SLICE_STREAK_ESCALATION_THRESHOLD) return 'escalated';
  if (ESCALATION_KEYWORD_RE.test(signals.title)) return 'escalated';
  if (MECHANICAL_TITLE_PREFIXES.some((prefix) => signals.title.startsWith(prefix))) {
    return 'mechanical';
  }
  return 'default';
}

/** Resolve a tier to a concrete model string. `AUTOPILOT_MODEL` (the
 *  existing flight-wide operator lever) always wins outright — routing is a
 *  DEFAULT, not a lock-out. `AUTOPILOT_MECHANICAL_MODEL` reuses `triage.ts`'s
 *  own env var so an operator tunes the cheap tier in exactly one place. */
export function resolvePrimaryModelForTier(tier: ModelTier, env: NodeJS.ProcessEnv): string {
  const override = env['AUTOPILOT_MODEL'];
  if (override) return override;
  switch (tier) {
    case 'mechanical':
      return resolveMechanicalModel(env);
    case 'escalated':
      return env['AUTOPILOT_ESCALATED_MODEL'] ?? 'fable';
    case 'default':
      return 'sonnet';
  }
}

/**
 * Per-firing budget multiplier for a routed model — the run-3 lesson: MODEL
 * ROUTING escalated a task to fable while the per-firing budget stayed
 * sonnet-sized ($5), so every escalated firing burned its whole cap
 * mid-ORIENT and died ("2 consecutive failed/truncated"). Escalation must
 * scale the budget with the model's price or it is a death sentence, not an
 * upgrade. Ratios follow the published per-MTok prices (RESEARCH-LIBRARY
 * "model economics"): fable $10/$50 vs sonnet $3/$15 ~= 3.3x; opus $5/$25
 * ~= 1.7x; haiku $1/$5 ~= 0.4x (floored at 0.5 so a mechanical firing can
 * still finish). Unknown models run unscaled.
 */
export function budgetMultiplierForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('fable')) return 3.5;
  if (m.includes('opus')) return 1.7;
  if (m.includes('haiku')) return 0.5;
  return 1;
}

/**
 * The model FAMILY a concrete model id belongs to — `claude-fable-5` and
 * `fable` are one family, `claude-opus-4-8` and `opus` another. Used to
 * compare what routing REQUESTED against what the CLI actually SERVED.
 */
export function modelFamily(model: string): string {
  const m = model.toLowerCase();
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (m.includes(family)) return family;
  }
  return m;
}

/**
 * True when the served model is NOT the family that was requested — a SILENT
 * DOWNGRADE (2026-08-17 evidence: routing asked for fable, the subscription's
 * premium window was drained, and every "escalated" firing was actually
 * served by opus-4.8 at 57% ship vs sonnet's 71%). Industry practice for
 * agent runtimes is to log requested vs served as separate attributes and
 * alert on mismatch instead of letting a fallback pass transparently
 * (RESEARCH-LIBRARY "silent model downgrade"): escalation that is not
 * actually being served must stop paying the escalated budget.
 */
export function isModelSubstitution(requested: string, served: string): boolean {
  if (served === '') return false; // no served id (death before the envelope) — not evidence
  return modelFamily(requested) !== modelFamily(served);
}
