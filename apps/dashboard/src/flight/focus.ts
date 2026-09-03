// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLEET-AWARE FOCUS (web-mswpsozf-oxf17b): run 3's WIP-1 FOCUS starved a
 * 3-instance fleet — prompt.ts renders its FOCUS MODE lock for ANY board task
 * flagged focus, so every instance that could see the focused task locked
 * onto it while only ONE held the claim (15 of 30 firings no-shipped). The
 * fix, in two halves fly.ts wires around its claim step: claim candidates
 * are ordered focused-first so exactly one instance binds to the operator's
 * target, and the focus flag itself is forwarded to the prompt ONLY for the
 * task THIS instance claimed — a sibling sees a normal board and keeps
 * shipping instead of idling behind someone else's lock.
 */

/** The board-row shape focus ordering/binding needs — structural, so fly.ts's store rows fit as-is. */
export interface FocusableTask {
  readonly id: string;
  /** SQLite boolean: 1 when the operator locked this task as the flight's focus. */
  readonly focus: number;
}

/**
 * Claim-candidate ordering: operator-focused tasks jump the board queue so
 * the first free instance CLAIMS the focus target (WIP-1 intent), instead of
 * claiming the topmost task while the prompt tells it to work another.
 * Order is otherwise stable, and the input is never mutated.
 */
export function orderClaimCandidatesFocusFirst<T extends FocusableTask>(tasks: readonly T[]): T[] {
  return [...tasks.filter((t) => t.focus === 1), ...tasks.filter((t) => t.focus !== 1)];
}

/**
 * The FOCUS MODE lock binds to the CLAIMER: true only when this task is
 * focused AND this instance holds its claim. A focused task claimed by a
 * sibling (or benched here, leaving it unclaimed) renders as an ordinary
 * board row — never a lock on work this instance doesn't own.
 */
export function isFocusBoundHere(task: FocusableTask, claimedTaskId: string | null): boolean {
  return task.focus === 1 && task.id === claimedTaskId;
}
