// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Collision-proof seed-task id source: `<prefix>-<time36>-<nonce36×6>-<seq>`.
 * One source per run — the creation-time stamp + a single random nonce make
 * the run unique against every other run that ever wrote to the shared store,
 * and the sequence makes ids unique (and readable, and ordered) within it.
 *
 * Callers used to inject bare per-run counters here (`task-1`, `task-2`, …).
 * Those restart at 1 on every run while the `tasks` table they insert into is
 * shared and permanent — so the first board ever seeded claimed `task-1`
 * forever, and the SECOND project a user onboarded crashed the whole flight
 * with `UNIQUE constraint failed: tasks.id` before its first firing.
 */
export function taskIdSource(
  prefix: string,
  now: () => number = Date.now,
  random: () => number = Math.random,
): () => string {
  const runStamp = now().toString(36);
  const runNonce = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');
  let seq = 0;
  return () => `${prefix}-${runStamp}-${runNonce}-${(seq += 1)}`;
}
