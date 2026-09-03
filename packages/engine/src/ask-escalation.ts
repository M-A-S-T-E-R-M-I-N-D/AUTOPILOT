// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The read-only agentic escalation tier for "Ask your project"
 * (docs/epics/0012-agentic-ask-escalation.md, slice 1): when tier 1's cheap
 * indexed answer comes up empty, or the operator opts in via the Deep
 * toggle, this config grants an iterative Read/Grep/Glow session instead of
 * tier 1's single tool-less call.
 *
 * allowedTools/disallowedTools precedence (the epic's Acceptance criteria
 * flagged this as a correctness-of-the-jail question to resolve before
 * shipping, not assert): verified against the Claude Code CLI's documented
 * permission evaluation order (code.claude.com/docs/en/permissions) — rules
 * evaluate deny -> ask -> allow, first match wins, so ANY deny rule beats ANY
 * allow rule for the same tool, regardless of specificity. Tier 1's own
 * `disallowedTools: ['*']` would therefore blank THIS tier's Read/Grep/Glob
 * grant back to nothing if reused here — safe but useless, and exactly the
 * "bricks the feature" outcome the epic warned about. The fix is not to drop
 * disallowedTools to `[]` and lean on headless mode's undocumented
 * fail-closed behavior for unlisted tools either — that is the "silently
 * widens the grant" outcome the epic warned about, if that behavior ever
 * changes upstream. Instead `ASK_ESCALATION_DISALLOWED_TOOLS` explicitly
 * enumerates every OTHER tool this codebase's own config already knows
 * about (`DEFAULT_ALLOWED_TOOLS` ∪ `DEFAULT_DISALLOWED_TOOLS`, minus the
 * three granted here) — an airtight, self-documenting deny-list with no
 * wildcard trap, matching this codebase's existing convention that both
 * DEFAULT_* tool lists are explicit enumerations, never wildcards.
 */

import { DEFAULT_ALLOWED_TOOLS, DEFAULT_DISALLOWED_TOOLS, type EngineConfig } from './config.js';

/** The ONLY tools the escalation tier may ever call — read-only, no
 *  exceptions, at any turn (epic 0012 Constraints). */
export const ASK_ESCALATION_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob'] as const;

/** Every other tool this codebase's config knows about, explicitly denied —
 *  see the file docstring for why this is a named list, not a `'*'`
 *  wildcard. */
export const ASK_ESCALATION_DISALLOWED_TOOLS: readonly string[] = [
  ...new Set<string>([...DEFAULT_ALLOWED_TOOLS, ...DEFAULT_DISALLOWED_TOOLS]),
].filter((tool) => !(ASK_ESCALATION_ALLOWED_TOOLS as readonly string[]).includes(tool));

/** REACTIVITY.md §1's number for this tier (`Ask=Read/Glob/Grep·10`) —
 *  genuinely iterative but bounded. */
export const ASK_ESCALATION_MAX_TURNS = 10;

/** Distinct from and higher than tier 1's `0.5` (one tool-less call) — an
 *  iterative multi-tool-call session costs more per question by design;
 *  still capped well below a flight's full-firing budget. */
export const ASK_ESCALATION_MAX_BUDGET_USD = 2;

/**
 * Overlay the escalation tier's tool/turn/budget posture onto a base engine
 * config (e.g. tier 1's own model/effort choice) — everything else (model,
 * fallback, effort, resilience, routing) passes through unchanged. The
 * guard-settings wiring (`buildFlightSettings`, `packages/engine/src/guard.ts`)
 * is the belt-and-suspenders layer on top of this tool grant, reused as-is —
 * no new guard code, just a second call site with `targetRoot` set to the
 * project folder being asked about.
 */
export function buildAskEscalationConfig(base: EngineConfig): EngineConfig {
  return {
    ...base,
    maxTurns: ASK_ESCALATION_MAX_TURNS,
    maxBudgetUsd: ASK_ESCALATION_MAX_BUDGET_USD,
    allowedTools: ASK_ESCALATION_ALLOWED_TOOLS,
    disallowedTools: ASK_ESCALATION_DISALLOWED_TOOLS,
  };
}
