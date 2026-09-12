// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Test-env hygiene: a gate run INSIDE a flight inherits the flight's own
 * runtime identity vars (spawn-flight.ts rides them on every child, so the
 * agent's `pnpm run test` subprocess carries them too). Suites that assert
 * on env shapes built from `...process.env` — e.g. spawn-flight's "absent
 * when not given" cases — then fail from inside a fleet worktree while
 * passing everywhere else; a scoped fleet member cannot land ANY commit
 * because its own scope var fails the gate (field-verified: firing 1066's
 * queue-forecast commit was reverted by exactly this). Tests that need
 * these vars set them explicitly per-case and none may depend on ambient
 * values, so scrub them once per worker before any test file loads.
 *
 * VITEST_MAX_FORKS / VITEST_MAX_THREADS stay untouched — they are the fleet
 * machine-budget cap, read by Vitest's main process for pool sizing.
 */
const FLIGHT_RUNTIME_VARS = [
  'AUTOPILOT_FLIGHT',
  'AUTOPILOT_FLIGHT_INSTANCE_ID',
  'AUTOPILOT_FLEET_TASK_SCOPE',
];

for (const key of FLIGHT_RUNTIME_VARS) {
  delete process.env[key];
}

// waitFor ceiling (2026-09-13): `vi.waitFor`'s one-second default flaked under
// a loaded 700-file run and turned a landing gate red with no code change
// behind it — a jsdom panel that paints in 0.3 s alone can take longer than a
// second with every worker busy. Every call now waits up to five seconds
// unless it names its own ceiling. Nothing is hidden: a probe that never
// comes true still fails, later.
import { vi } from 'vitest';

const WAIT_FOR_CEILING_MS = 5000;
const waitForDefault = vi.waitFor.bind(vi);
vi.waitFor = ((probe, options) =>
  waitForDefault(probe, { timeout: WAIT_FOR_CEILING_MS, ...(options ?? {}) })) as typeof vi.waitFor;
