// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ARCHITECT chat v2 slice 3, service half (`docs/epics/0011-architect-chat-
 * v2.md`, board web-msnqmgge-oijj8x) — the intent-routing seam between the
 * Ask model call and slice 1's confirm-gated execute endpoint
 * (`flight/control-execute.ts`): a prompt addendum teaching the ARCHITECT-
 * mode model how to propose ONE control-tool action, and a parser that lifts
 * that proposal out of the answer text into a structured object the terminal
 * SSE frame carries to the client. Nothing here EXECUTES anything — a parsed
 * proposal is untrusted model output the operator confirms (or ignores) via
 * the future action card; reads auto-run, writes/destructive require a click
 * (the epic's acceptance criteria, keyed off {@link CONTROL_TOOL_SAFETY}).
 */

import type { ControlSafety } from '@autopilot/mcp';
import {
  CONTROL_TOOLS,
  CONTROL_TOOL_SAFETY,
  isControlTool,
  type ControlTool,
} from '../flight/control-execute.js';

/** The Ask personas (`server.ts`'s own ASK_PERSONAS vocabulary, mirrored here
 *  rather than imported so the service layer never imports the HTTP layer). */
export type AskPersona = 'genius' | 'architect';

/** The fence tag the ARCHITECT-mode model labels its proposal block with. */
export const ARCHITECT_PROPOSAL_FENCE = 'control-proposal';

/** One structured control-tool proposal lifted out of an ARCHITECT answer —
 *  `safety` is slice 1's tier for this tool, precomputed so the action-card
 *  client decides auto-run (read) vs. explicit-click (write/destructive)
 *  without shipping the safety table into the browser bundle. */
export interface ArchitectProposal {
  readonly tool: ControlTool;
  readonly args: Record<string, unknown>;
  readonly safety: ControlSafety;
}

/** {@link parseArchitectProposal}'s result: the answer with a valid proposal
 *  block stripped out (`prose`), plus the proposal itself — or the answer
 *  untouched and `null` when there is no block or the block is invalid (an
 *  invalid block stays VISIBLE in the prose so the operator sees exactly
 *  what the model tried, rather than it silently vanishing). */
export interface ArchitectParseResult {
  readonly prose: string;
  readonly proposal: ArchitectProposal | null;
}

/**
 * The ARCHITECT-mode prompt addendum, appended after the grounded Ask prompt
 * (static trusted text — the injection-defended source/question framing is
 * unchanged). One proposal max, and the model must never claim the action
 * already ran: nothing executes until the operator confirms.
 */
export function buildArchitectAddendum(): string {
  return [
    '## ARCHITECT mode — proposing a board action',
    '',
    'The operator switched this chat to ARCHITECT mode. Besides answering, you',
    'MAY propose at most ONE board action for the operator to confirm, by ending',
    'your reply with exactly one fenced block tagged ' +
      ARCHITECT_PROPOSAL_FENCE +
      ' containing a single JSON object:',
    '',
    '```' + ARCHITECT_PROPOSAL_FENCE,
    '{"tool":"<tool name>","args":{}}',
    '```',
    '',
    'Tools (' + CONTROL_TOOLS.join(', ') + ') and their args:',
    '- tasks_list: {"projectId","limit"?} — list board tasks.',
    '- tasks_set_status: {"taskId","status"} — move a task (also approves: needs_approval → queued).',
    '- tasks_create: {"projectId","title","severity"?,"dimension"?} — add a task.',
    '- tasks_reorder: {"projectId","orderedIds"} — reorder the open queue.',
    '- tasks_delete: {"taskId"} — delete a task (destructive).',
    '- project_reset: {"projectId"} — wipe project state (destructive).',
    '',
    'Rules: propose an action only when the operator asked for a change; a',
    'question that needs no action gets NO block. Never claim the action ran —',
    'nothing executes until the operator confirms the proposal card.',
  ].join('\n');
}

const PROPOSAL_BLOCK_RE = new RegExp(
  '```' + ARCHITECT_PROPOSAL_FENCE + '[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n?```',
);

/**
 * Lift the first {@link ARCHITECT_PROPOSAL_FENCE} block out of an ARCHITECT
 * answer. Valid (parseable JSON object, `tool` in slice 1's
 * {@link CONTROL_TOOLS} allowlist, `args` a plain object or absent) → the
 * block is stripped from the prose and returned structured; anything else →
 * prose untouched, `proposal: null`. Args contents are NOT validated here —
 * that stays where it already lives, `control-execute.ts`'s per-tool
 * validation at execute time (one validator, not two drifting ones).
 */
export function parseArchitectProposal(answer: string): ArchitectParseResult {
  const match = PROPOSAL_BLOCK_RE.exec(answer);
  if (!match || match[1] === undefined) return { prose: answer, proposal: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { prose: answer, proposal: null };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { prose: answer, proposal: null };
  }
  const record = parsed as Record<string, unknown>;
  const tool = record['tool'];
  if (typeof tool !== 'string' || !isControlTool(tool)) return { prose: answer, proposal: null };
  const rawArgs = record['args'];
  if (
    rawArgs !== undefined &&
    (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs))
  ) {
    return { prose: answer, proposal: null };
  }
  const args = (rawArgs as Record<string, unknown> | undefined) ?? {};
  const prose = answer.replace(match[0], '').trim();
  return { prose, proposal: { tool, args, safety: CONTROL_TOOL_SAFETY[tool] } };
}
