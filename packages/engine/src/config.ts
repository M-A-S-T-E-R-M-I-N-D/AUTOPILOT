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
  /**
   * PARALLEL UNLOCK C's same-folder fleet instance identity
   * (`spawn-flight.ts`'s `AUTOPILOT_FLIGHT_INSTANCE_ID`, read by `fly.ts`),
   * threaded through so every firing's record can be attributed to its
   * originating lane instead of only being recoverable by parsing
   * `firingIdOf`'s `<project>--<instanceId>:firing-<n>` id. `null` for every
   * solo (unnamed) flight — the overwhelming majority of firings today.
   */
  readonly instanceId: string | null;
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

/** The granted tools a firing delegates work through: Agent (and its older
 *  name, Task) spawns one subagent, Workflow fans out many. */
export const SUBAGENT_TOOLS = ['Agent', 'Task', 'Workflow'] as const;

/** The SOUL line an operator writes to keep ONE project's firings from
 *  delegating to subagents — the per-project override of the fleet-wide
 *  grant (MASTER-PLAN §5.4, board ap-muo35gzl-2). It travels with the SOUL,
 *  so it is locked and ratified like every other SOUL edit. */
export const SUBAGENTS_OPT_OUT_LINE = 'Subagents: off';

/** The opt-out on a line of its own — a plain line or a `-`/`*` bullet, any
 *  case, stray spaces allowed. A mention mid-sentence is not an opt-out. */
const SUBAGENTS_OPT_OUT = /^[ \t]*(?:[-*][ \t]+)?subagents:[ \t]*off[ \t\r]*$/im;

/** True when this project's SOUL carries {@link SUBAGENTS_OPT_OUT_LINE}. */
export function soulOptsOutOfSubagents(soul: string): boolean {
  return SUBAGENTS_OPT_OUT.test(soul);
}

/** The granted tools a firing reaches the open internet through. */
export const WEB_TOOLS = ['WebSearch', 'WebFetch'] as const;

/** The SOUL line an operator writes to keep ONE project's firings off the
 *  open internet — a private repo whose contents must not leave the machine
 *  in a search query or a fetched URL (docs/THREAT-MODEL.md T6). The fourth
 *  per-project override (MASTER-PLAN §5.4, board ap-muo35gzl-2); it travels
 *  with the SOUL, so it is locked and ratified like every other SOUL edit. */
export const INTERNET_OPT_OUT_LINE = 'Internet: off';

/** The opt-out on a line of its own — same shape as {@link SUBAGENTS_OPT_OUT}. */
const INTERNET_OPT_OUT = /^[ \t]*(?:[-*][ \t]+)?internet:[ \t]*off[ \t\r]*$/im;

/** True when this project's SOUL carries {@link INTERNET_OPT_OUT_LINE}. */
export function soulOptsOutOfInternet(soul: string): boolean {
  return INTERNET_OPT_OUT.test(soul);
}

/** The `--allowedTools`/`--disallowedTools` pair one firing runs with. */
export interface FiringToolGrant {
  readonly allowedTools: readonly string[];
  readonly disallowedTools: readonly string[];
}

/** The per-project opt-outs a firing's grant honors — each false only when
 *  the project's own SOUL carries the matching line; undefined means on. */
export interface FiringToolOverrides {
  /** False on {@link soulOptsOutOfSubagents}: denies {@link SUBAGENT_TOOLS}. */
  readonly subagentsEnabled?: boolean;
  /** False on {@link soulOptsOutOfInternet}: denies {@link WEB_TOOLS}. */
  readonly internetEnabled?: boolean;
}

/** The default grant, or — for a project whose SOUL opts out of subagents,
 *  the internet, or both — the default with those tools moved from allowed
 *  to disallowed, so the CLI refuses what the prompt no longer asks for.
 *  With nothing opted out the default lists come back as the same objects. */
export function firingToolGrant(overrides: FiringToolOverrides = {}): FiringToolGrant {
  const denied: readonly string[] = [
    ...(overrides.subagentsEnabled === false ? SUBAGENT_TOOLS : []),
    ...(overrides.internetEnabled === false ? WEB_TOOLS : []),
  ];
  if (denied.length === 0) {
    return { allowedTools: DEFAULT_ALLOWED_TOOLS, disallowedTools: DEFAULT_DISALLOWED_TOOLS };
  }
  return {
    allowedTools: DEFAULT_ALLOWED_TOOLS.filter((tool) => !denied.includes(tool)),
    disallowedTools: [...DEFAULT_DISALLOWED_TOOLS, ...denied],
  };
}

/**
 * Tool grant shared by every tool-less single-turn substep — the model
 * answers from its prompt/context alone, never calling a tool. Named and
 * exported (rather than each call site repeating the literal) so the
 * threat-model generator (`scripts/threat-model/generate-table.mjs`,
 * `docs/THREAT-MODEL.md` §3) can render an agent's real grant from the same
 * source its CLI invocation reads, not a hand-copied guess. Currently reused
 * by post-flight triage (`apps/dashboard/src/flight/board-triage.ts`) and
 * "Ask your project" tier 1 (`apps/dashboard/src/server/main.ts`).
 */
export const TOOL_LESS_ALLOWED_TOOLS = [] as const;
export const TOOL_LESS_DISALLOWED_TOOLS = ['*'] as const;

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
  instanceId: null,
};
