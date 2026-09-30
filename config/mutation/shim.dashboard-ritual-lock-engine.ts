// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `@autopilot/engine` alias target for stryker.dashboard-ritual-lock.config.mjs
 * ONLY (see vitest.dashboard-ritual-lock.config.ts). ritual-lock.ts and its
 * test once needed only `FileInstanceLock` (adapters/instance-lock.ts), so the
 * alias pointed straight at that file. `withCheckoutRitualLock` (board
 * ap-mtnceruy-2) then brought in the sync-back mutex and the primary-flight
 * marker, defined in adapters/worktree.ts — and the single-file alias left
 * them undefined: the 2026-09-30 nightly's dry run died on "syncBackLockPath
 * is not a function" before testing a single mutant. This re-exports every
 * symbol the source and its test take from `@autopilot/engine`, from their
 * real sources, instead of duplicating logic.
 */
export { FileInstanceLock } from '../../packages/engine/src/adapters/instance-lock.ts';
export {
  claimPrimaryFlight,
  primaryFlightHolder,
  primaryFlightLockPath,
  syncBackLock,
  syncBackLockPath,
  syncWorktreeBranch,
  withSyncBackMutex,
  type SyncBackMutexOptions,
} from '../../packages/engine/src/adapters/worktree.ts';
