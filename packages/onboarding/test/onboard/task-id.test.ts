// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { taskIdSource } from '../../src/onboard/task-id.js';

describe('taskIdSource', () => {
  it('mints `<prefix>-<time36>-<nonce36x6>-<seq>` ids', () => {
    const next = taskIdSource(
      'task',
      () => 36,
      () => 0,
    );
    expect(next()).toBe('task-10-000000-1');
    expect(next()).toBe('task-10-000000-2');
  });

  it('a rerun (fresh source, later clock) cannot repeat an earlier run — the second-project seed crash', () => {
    // The regression: per-run counters (`task-1`, `task-2`, …) restarted at 1
    // on every run against a shared, permanent store — so the SECOND project a
    // user ever onboarded collided with the first board's ids and crashed the
    // whole flight (`UNIQUE constraint failed: tasks.id`) before firing once.
    // Time moves between runs, so even an identical random stream cannot
    // reproduce an old id.
    const firstRun = taskIdSource(
      'task',
      () => 1_000,
      () => 0.123,
    );
    const secondRun = taskIdSource(
      'task',
      () => 2_000,
      () => 0.123,
    );
    expect(secondRun()).not.toBe(firstRun());
  });

  it('two sources created in the SAME millisecond stay disjoint via the random nonce', () => {
    let draw = 0;
    const random = () => [0.1, 0.9][(draw += 1) - 1] ?? 0;
    const a = taskIdSource('task', () => 5_000, random);
    const b = taskIdSource('task', () => 5_000, random);
    expect(a()).not.toBe(b());
  });

  it('ids within one seeding pass are unique by construction (sequence, not luck)', () => {
    const next = taskIdSource('task');
    const ids = new Set(Array.from({ length: 500 }, () => next()));
    expect(ids.size).toBe(500);
  });
});
