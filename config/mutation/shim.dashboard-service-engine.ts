// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `@autopilot/engine` alias target for stryker.dashboard-service.config.mjs
 * ONLY (see vitest.dashboard-service.config.ts). Between service.ts and its
 * relative-import dependents (config.ts, verify.ts), three symbols cross the
 * bare `@autopilot/engine` specifier — `describeAuth` and `DEFAULT_AUTH`
 * (both defined in auth.ts) directly, and `parseModelEnvelope` (defined in
 * adapters/claude-cli.ts) transitively via verify.ts's `verifyClaudeAuth`.
 * A single-file alias (the pattern every other mutation config here uses)
 * can't satisfy symbols split across two leaf modules — so this re-exports
 * all three from their real sources instead of duplicating logic.
 */
export { describeAuth, DEFAULT_AUTH } from '../../packages/engine/src/auth.ts';
export { parseModelEnvelope } from '../../packages/engine/src/adapters/claude-cli.ts';
