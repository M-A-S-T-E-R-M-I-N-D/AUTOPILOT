// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHICH CLI A LANE'S FIRINGS FLY ON (epic 0036, provider parity). Every lane
 * flew the Claude Code CLI: `CodexCliModel` and `GeminiCliModel` were built,
 * guarded and audited, but nothing routed a firing to them.
 * `AUTOPILOT_ENGINE=codex` or `gemini` now does, for the flight it is set on,
 * with `AUTOPILOT_ENGINE_MODEL` naming the model that CLI runs.
 *
 * The model has a variable of its own because every other model lever names
 * a Claude model: `AUTOPILOT_MODEL`, the routing tiers and the SOUL pin all
 * resolve to aliases neither CLI can run, and the flight's other Claude
 * calls (the commit reviewer, the merge-escalation agent) keep using them.
 * Unset, or `claude`, nothing changes. A setting this cannot honour refuses
 * the flight instead of flying Claude unasked.
 */

import {
  isLocallyServed,
  resolveModelVendor,
  type EngineConfig,
  type ModelVendorId,
} from '@autopilot/engine';

/** The CLIs a lane can fly on besides Claude's. */
export type NonClaudeEngine = 'codex' | 'gemini';

/** Where a lane's firings go, once the env has been read. */
export type FiringEngineRoute =
  { readonly engine: 'claude' } | { readonly engine: NonClaudeEngine; readonly model: string };

export type FiringEngineChoice =
  | { readonly ok: true; readonly route: FiringEngineRoute }
  | { readonly ok: false; readonly reason: string };

/** Reverted firings in a row that demote a lane flown on a non-Claude engine:
 *  the "quality gate that demotes a lane that fails twice" epic 0036 names
 *  (`runLoop`'s `demoteAfterGateFailures`). */
export const NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES = 2;

/** How each non-Claude engine is named in the flight log, a model it runs,
 *  and the one publisher whose models it can reach when it has one. Codex
 *  reaches other providers through its own config, so only a Claude model is
 *  refused there; the Gemini CLI calls Google's API alone. */
const ENGINES: Readonly<
  Record<NonClaudeEngine, { cli: string; exampleModel: string; onlyVendor?: ModelVendorId }>
> = {
  codex: { cli: 'Codex', exampleModel: 'gpt-5-codex' },
  gemini: { cli: 'Gemini', exampleModel: 'gemini-2.5-pro', onlyVendor: 'google' },
};

function isNonClaudeEngine(engine: string): engine is NonClaudeEngine {
  return Object.hasOwn(ENGINES, engine);
}

/** The name the flight log and the preflight give an engine's CLI. */
export function firingEngineCli(engine: NonClaudeEngine): string {
  return ENGINES[engine].cli;
}

/** Reads `AUTOPILOT_ENGINE` and `AUTOPILOT_ENGINE_MODEL`. */
export function firingEngineFromEnv(env: NodeJS.ProcessEnv): FiringEngineChoice {
  const engine = (env['AUTOPILOT_ENGINE'] ?? '').trim().toLowerCase();
  if (engine === '' || engine === 'claude') return { ok: true, route: { engine: 'claude' } };
  if (!isNonClaudeEngine(engine)) {
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE=${engine} names no engine a lane can fly on (claude, codex or gemini).`,
    };
  }
  const { cli, exampleModel, onlyVendor } = ENGINES[engine];
  const model = (env['AUTOPILOT_ENGINE_MODEL'] ?? '').trim();
  if (model === '') {
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE=${engine} needs AUTOPILOT_ENGINE_MODEL to name the model ${cli} runs (e.g. ${exampleModel}).`,
    };
  }
  const { vendor } = resolveModelVendor(model);
  if (vendor.id === 'anthropic') {
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE_MODEL=${model} names a Claude model, which the ${cli} CLI cannot run.`,
    };
  }
  // Only a model this build can place elsewhere is refused: an unrecognized
  // name may be the engine's own model, newer than the vendor table. A local
  // runner's prefix counts even on the right publisher's model (`ollama/gemma3`).
  const local = isLocallyServed(model);
  const placedElsewhere = vendor.id !== onlyVendor && vendor.id !== 'unknown';
  if (onlyVendor !== undefined && (local || placedElsewhere)) {
    const named = local ? 'a locally served model' : `a model by ${vendor.name}`;
    return {
      ok: false,
      reason: `AUTOPILOT_ENGINE_MODEL=${model} names ${named}, which the ${cli} CLI cannot run.`,
    };
  }
  return { ok: true, route: { engine, model } };
}

/** The config a lane's firings run under: Claude's untouched, or every model
 *  slot (the primary, the quota fallback and resilience's pair) on the
 *  engine's model, so no firing hands another CLI a Claude alias. */
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

/** Where each engine's containment guard runs: the same `guard-hook.js` the
 *  Claude settings file runs, as that CLI's own pre-tool hook. Gemini loads
 *  hooks only in a trusted folder, so its lane trusts the worktree for each
 *  session (`--skip-trust`), as `claude -p` runs without a trust prompt. */
const GUARD_LINES: Readonly<Record<NonClaudeEngine, string>> = {
  codex: 'the containment guard runs as its PreToolUse hook',
  gemini:
    'the containment guard runs as its BeforeTool hook from a system settings file, ' +
    'with the worktree trusted for this session',
};

/** The flight-log line naming a non-Claude lane's engine and what changes
 *  with it; `null` for Claude, whose flight log stays as it was. */
export function firingEngineLine(route: FiringEngineRoute): string | null {
  if (route.engine === 'claude') return null;
  const cli = firingEngineCli(route.engine);
  return (
    `Engine: ${cli} CLI on ${route.model} (AUTOPILOT_ENGINE). Model routing is off; ` +
    `${GUARD_LINES[route.engine]}; no cost is recorded, since ${cli} reports no price; ` +
    `${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings in a row demote the lane.`
  );
}
