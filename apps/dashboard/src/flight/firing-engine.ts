// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHICH CLI A LANE'S FIRINGS FLY ON (epic 0036, provider parity). Every lane
 * flew the Claude Code CLI: `CodexCliModel` was built, guarded and audited,
 * but nothing routed a firing to it. `AUTOPILOT_ENGINE=codex` now does, for
 * the flight it is set on, with `AUTOPILOT_ENGINE_MODEL` naming the model
 * Codex runs.
 *
 * The model has a variable of its own because every other model lever names
 * a Claude model: `AUTOPILOT_MODEL`, the routing tiers and the SOUL pin all
 * resolve to aliases the Codex CLI cannot run, and the flight's other Claude
 * calls (the commit reviewer, the merge-escalation agent) keep using them.
 * Unset, or `claude`, nothing changes. A setting this cannot honour refuses
 * the flight instead of flying Claude unasked.
 *
 * Gemini's adapter exists too, but its guard rides a settings file
 * (`buildGeminiFlightSettings`) the launcher does not write yet, so it is not
 * offered here.
 */

import { resolveModelVendor, type EngineConfig } from '@autopilot/engine';

/** Where a lane's firings go, once the env has been read. */
export type FiringEngineRoute =
  { readonly engine: 'claude' } | { readonly engine: 'codex'; readonly model: string };

export type FiringEngineChoice =
  | { readonly ok: true; readonly route: FiringEngineRoute }
  | { readonly ok: false; readonly reason: string };

/** Reverted firings in a row that demote a lane flown on a non-Claude engine:
 *  the "quality gate that demotes a lane that fails twice" epic 0036 names
 *  (`runLoop`'s `demoteAfterGateFailures`). */
export const NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES = 2;

/** Reads `AUTOPILOT_ENGINE` and `AUTOPILOT_ENGINE_MODEL`. */
export function firingEngineFromEnv(env: NodeJS.ProcessEnv): FiringEngineChoice {
  const engine = (env['AUTOPILOT_ENGINE'] ?? '').trim().toLowerCase();
  if (engine === '' || engine === 'claude') return { ok: true, route: { engine: 'claude' } };
  if (engine !== 'codex') {
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE=${engine} names no engine a lane can fly on (claude or codex).`,
    };
  }
  const model = (env['AUTOPILOT_ENGINE_MODEL'] ?? '').trim();
  if (model === '') {
    return {
      ok: false,
      reason:
        'AUTOPILOT_ENGINE=codex needs AUTOPILOT_ENGINE_MODEL to name the model Codex runs (e.g. gpt-5-codex).',
    };
  }
  if (resolveModelVendor(model).vendor.id === 'anthropic') {
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE_MODEL=${model} names a Claude model, which the Codex CLI cannot run.`,
    };
  }
  return { ok: true, route: { engine: 'codex', model } };
}

/** The config a lane's firings run under: Claude's untouched, or every model
 *  slot (the primary, the quota fallback and resilience's pair) on the
 *  engine's model, so no firing hands Codex a Claude alias. */
export function firingConfigForEngine(
  config: EngineConfig,
  route: FiringEngineRoute,
): EngineConfig {
  if (route.engine === 'claude') return config;
  return {
    ...config,
    primaryModel: route.model,
    fallbackModel: route.model,
    resilience: { ...config.resilience, primaryModel: route.model, fallbackModel: route.model },
  };
}

/** The flight-log line naming a non-Claude lane's engine and what changes
 *  with it; `null` for Claude, whose flight log stays as it was. */
export function firingEngineLine(route: FiringEngineRoute): string | null {
  if (route.engine === 'claude') return null;
  return (
    `Engine: Codex CLI on ${route.model} (AUTOPILOT_ENGINE). Model routing is off; ` +
    `the containment guard runs as its PreToolUse hook; no cost is recorded, since ` +
    `Codex reports no price; ${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings ` +
    `in a row demote the lane.`
  );
}
