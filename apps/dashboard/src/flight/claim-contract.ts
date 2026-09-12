// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE CLAIM CONTRACT (operator directive, 2026-09-12): when a person claims
 * an issue from the pool, their own AUTOPILOT takes it as a FOCUSED board
 * task and keeps shipping slices against it until the person closes the
 * issue — the fleet never declares it done on its own.
 *
 * The contract rides the task's `body`, not `assignee`: on the board,
 * `assignee` is the LANE LEASE (`fly.ts` filters `assignee === null ||
 * assignee === instanceKey`), so a human name there would make every lane
 * skip the very task the human wanted worked. A marker line in the body is
 * inert to leases, survives every read path that returns the row, and needs
 * no schema migration.
 *
 * Three readers agree on it:
 * - the firing's done-hook (`firing-hooks.ts`) never closes such a task —
 *   a "complete" tag is demoted to a slice with the reason in the next prompt;
 * - the mirror pass (`mirror-pass.ts`) settles it when GitHub says the
 *   issue is closed — that is the human's word, and the only one that counts;
 * - the flight prompt's board section names the contract on the row, so
 *   the agent slices instead of trying to finish.
 */

/** The marker line every reader looks for. Stable text: it is a contract. */
export const HUMAN_CLOSES_MARKER = 'contract: human-closes';

/** The body a claimed issue's task carries — the marker plus the why, for a
 *  human reading the board. */
export function claimContractBody(issueNumber: number, url?: string): string {
  return (
    `Claimed from the pool: #${issueNumber}${url ? ` ${url}` : ''}\n` +
    `${HUMAN_CLOSES_MARKER} — deliver a slice per firing; this task closes only when its claimant closes the issue.`
  );
}

/** True when a task row carries the claim contract. Accepts any row shape
 *  that exposes a body (every task read path does). */
export function isHumanClosedTask(task: { readonly body?: string | null }): boolean {
  return typeof task.body === 'string' && task.body.includes(HUMAN_CLOSES_MARKER);
}

/** What the flight prompt appends to a claimed task's title, so the agent
 *  ships a slice instead of trying to declare the issue finished. */
export const CLAIMED_TASK_PROMPT_NOTE =
  '[claimed issue — ship ONE slice this firing; only its claimant closes it]';
