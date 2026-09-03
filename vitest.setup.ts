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
