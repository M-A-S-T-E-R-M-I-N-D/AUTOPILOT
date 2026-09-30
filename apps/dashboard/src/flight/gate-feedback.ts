// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * What the next firing is told about this firing's gate (the failure-feedback
 * loop in fly.ts). A red gate reverts the commit; a CRASHED gate (a timeout,
 * workers that never came up) judged nothing, and firing.ts leaves the commit
 * in place, unverified (docs/FAILURE-DOCTRINE.md rows 55 and 63). Both used to
 * read "the commit was reverted" (2026-09-30: firing 583's test:impacted timed
 * out, and firing 584 was told its predecessor's commit was gone while it
 * still sat at HEAD — an invitation to build the same fix twice).
 */

import type { GateResult } from '@autopilot/engine';

/** The feedback for the next firing's prompt, or `undefined` after a green gate. */
export function gateFailureFeedback(
  result: Pick<GateResult, 'ok' | 'crashed' | 'details'>,
): string | undefined {
  if (result.ok) return undefined;
  const details = result.details ?? '';
  if (result.crashed === true) {
    return (
      'THE GATE CRASHED before it could judge the commit — it was NOT reverted: the\n' +
      'commit is still at HEAD, unverified, and a later gate judges it; do not redo it.\n' +
      'A crash is load or tooling, not a verdict on the work; keep this unit small.\n' +
      details
    );
  }
  return (
    'THE GATE FAILED — the commit was reverted. Run every gate command yourself\n' +
    '(including lint and format checks) before committing; correct work dies to\n' +
    `mechanical checks too.\n${details}`
  );
}
