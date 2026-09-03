// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { ResilienceConfig } from './resilience.js';
import type { RoutingConfig } from './routing.js';

/**
 * Engine configuration — the ported v2.4 constants, made project-overridable
 * (a project's SOUL can tune these later). Model names default to the proven
 * fable→opus chain but are configurable per project/account.
 */
export interface EngineConfig {
  readonly primaryModel: string;
  readonly fallbackModel: string;
  readonly effort: string;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly retroEvery: number;
  readonly baseSleepMin: number;
  readonly hourlyCapUsd: number;
  readonly weeklyCapUsd: number;
  readonly allowedTools: readonly string[];
  readonly disallowedTools: readonly string[];
  readonly resilience: ResilienceConfig;
  /**
   * Which model string each cost-aware routing tier (`routing.ts`, M6,
   * ENGINE-RESEARCH I2) resolves to. Configured here so a project's SOUL can
   * tune it, same as `resilience`. `localModel` is read by the dashboard's
   * mechanical board-TRIAGE substep (`fly.ts`'s `runBoardTriage`): when
   * `AUTOPILOT_MECHANICAL_MODEL` matches it, that substep runs on the local
   * `OllamaModel` adapter instead of the cloud CLI. `firing.ts`'s primary
   * work-unit call still never reads this field — it needs full agentic tool
   * use no single-turn local completion can provide. `topModel` defaults to
   * `fallbackModel` (the strongest configured tier) so an unwired router
   * would still fail toward the safest model if it were ever consulted.
   */
  readonly routing: RoutingConfig;
  /**
   * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — the flat
   * subscription's real fixed monthly price. Operator-supplied, never
   * hardcoded (plan tiers/prices are not this repo's business to track or
   * assume). `null` (default) means unconfigured: every firing's
   * `realCostUsd` stays `null` and the dashboard falls back to the existing
   * list-price `costUsd`.
   */
  readonly subscriptionPriceUsd: number | null;
  /**
   * Cost semantics v3 — which local session-transcript directories share
   * this subscription's usage pool (the epic's "MACHINE-WIDE" scope; a
   * `~/.claude`-style projects root, or any tree of `*.jsonl` transcripts).
   * Operator-supplied, never hardcoded. Empty (default) means unconfigured:
   * no scan runs, the pool denominator stays `null`.
   */
  readonly usagePoolDirs: readonly string[];
}

/** Tools a flying autopilot may use (ported from the proven v2.4 args). */
export const DEFAULT_ALLOWED_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Agent',
  'Task',
  'Workflow',
  'Skill',
  'ToolSearch',
  'TodoWrite',
] as const;

/** Tools an unattended firing must never use (interactive / scheduling / control). */
export const DEFAULT_DISALLOWED_TOOLS = [
  'AskUserQuestion',
  'CronCreate',
  'CronDelete',
  'CronList',
  'ScheduleWakeup',
  'SendMessage',
  'TaskStop',
  'NotebookEdit',
  'EnterWorktree',
  'ExitWorktree',
] as const;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  primaryModel: 'fable',
  fallbackModel: 'opus',
  effort: 'xhigh',
  maxTurns: 120,
  maxBudgetUsd: 30,
  retroEvery: 10,
  baseSleepMin: 5,
  hourlyCapUsd: 45,
  weeklyCapUsd: 900,
  allowedTools: DEFAULT_ALLOWED_TOOLS,
  disallowedTools: DEFAULT_DISALLOWED_TOOLS,
  resilience: {
    primaryModel: 'fable',
    fallbackModel: 'opus',
    promoteAfter: 3,
    reprobeCooldownSec: 45 * 60,
    hibernateBaseMin: 60,
    hibernateMaxMin: 360,
  },
  routing: {
    // Sentinel `AUTOPILOT_MECHANICAL_MODEL` is set to for local offload — see
    // this field's docstring above and `fly.ts`'s `runBoardTriage`.
    localModel: 'ollama-local',
    cheapModel: 'haiku',
    topModel: 'opus',
  },
  subscriptionPriceUsd: null,
  usagePoolDirs: [],
};
