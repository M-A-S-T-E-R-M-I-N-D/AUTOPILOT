// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). Same treatment as
 * `shared/callsign.ts`: `web/shell.ts` embeds this module's real compiled
 * source into the generated `/app.js` text via `countTurns.toString()` —
 * see `fleetJs()` — instead of hand-retyping the collapsing loop, so the
 * two copies can no longer drift apart.
 */

/** The message-level telemetry fields {@link countTurns} keys a turn on. */
export interface TurnKeyedActivity {
  readonly model?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly reasoning?: string | null;
}

/**
 * Approximate the number of assistant turns behind a run of activity rows.
 * `activitiesFromEvent` (packages/engine/src/stream.ts) emits ONE Activity per
 * `tool_use` block in an assistant message, so parallel tool calls in the same
 * turn share the same `model`/`tokensIn`/`tokensOut`/`reasoning` (message-level
 * fields) and land as consecutive rows — there's no turn id to key on directly.
 * Collapsing consecutive rows with an identical tuple into one turn is the best
 * available proxy; the rare case of two truly distinct turns both carrying no
 * captured telemetry (all four fields null) undercounts rather than overcounts,
 * the safer direction for an honestly-labeled approximation.
 */
export function countTurns(activity: readonly TurnKeyedActivity[]): number {
  let turns = 0;
  let lastKey: string | null = null;
  for (const a of activity) {
    const model = a.model ?? '';
    // Stryker disable next-line StringLiteral: tokensIn is a number (or
    // nullish) — its stringified real values are always plain digits, which
    // can never coincide with an arbitrary fallback string. Swapping the
    // fallback text (e.g. to "Stryker was here!") changes no comparison
    // outcome: a nullish tokensIn only ever needs to compare equal to
    // another nullish one (any consistent placeholder does that) and never
    // to a real numeric value — unobservable by any black-box test. The `??`
    // vs a wrong operator IS observable (two distinct truthy values must stay
    // distinct) and stays a live mutant.
    const tokensIn = a.tokensIn ?? '';
    // Stryker disable next-line StringLiteral: same reasoning as tokensIn above.
    const tokensOut = a.tokensOut ?? '';
    const reasoning = a.reasoning ?? '';
    const key = `${model}|${tokensIn}|${tokensOut}|${reasoning}`;
    if (key !== lastKey) turns++;
    lastKey = key;
  }
  return turns;
}
