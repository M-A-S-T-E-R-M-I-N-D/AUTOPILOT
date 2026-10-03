// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `@autopilot/engine` alias target for stryker.dashboard-service.config.mjs
 * ONLY (see vitest.dashboard-service.config.ts). Between service.ts and its
 * relative-import dependents (config.ts, verify.ts), four symbols cross the
 * bare `@autopilot/engine` specifier — `describeAuth`, `isAuthReady` and
 * `DEFAULT_AUTH` (all defined in auth.ts) directly, and `parseModelEnvelope`
 * (defined in adapters/claude-cli.ts) transitively via verify.ts's
 * `verifyClaudeAuth`. A single-file alias (the pattern every other mutation
 * config here uses) can't satisfy symbols split across two leaf modules — so
 * this re-exports all four from their real sources instead of duplicating
 * logic. A symbol service.ts starts importing must be added here too: one
 * missing re-export (`isAuthReady`, 2bea3407) failed the dry run on
 * "isAuthReady is not a function" and ran zero mutants (2026-10-03 nightly).
 */
export { describeAuth, DEFAULT_AUTH, isAuthReady } from '../../packages/engine/src/auth.ts';
export { parseModelEnvelope } from '../../packages/engine/src/adapters/claude-cli.ts';
