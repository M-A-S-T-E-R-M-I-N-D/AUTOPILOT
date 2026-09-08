// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLEET'S ONE `gh` EXEC — `realCliExec` with the anti-flood guard
 * already on it.
 *
 * Every flight module that talks to GitHub takes an injectable `CliExec`
 * and defaults it, so the default IS the policy: whatever this module
 * exports is what every posting path uses in production while tests keep
 * injecting their own doubles unchanged. Defaulting to the raw
 * `realCliExec` is what let PR #33 receive the same approval twice — the
 * guard existed nowhere, so nothing could stop it.
 *
 * `flight/anti-flood.ts` passes through everything that is not a
 * `gh issue|pr comment` argv untouched, so this is a safe drop-in for the
 * raw exec everywhere, including the git and label calls these modules
 * also make.
 *
 * `test/flight/gh-exec-census.test.ts` diffs the flight DIRECTORY against
 * this rule so a future module cannot quietly default back to the
 * unguarded exec — the census-diffs-the-disk pattern, not the discoverer.
 */

import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import { withAntiFlood } from './anti-flood.js';

/** The guarded exec every flight module defaults to. */
export const ghExec: CliExec = withAntiFlood(realCliExec, {
  onVerdict: (note) => {
    // Visible in the server log so a run always says why a post did not
    // appear — a silently-swallowed message would be its own failure.
    process.stdout.write(`${note}\n`);
  },
});
