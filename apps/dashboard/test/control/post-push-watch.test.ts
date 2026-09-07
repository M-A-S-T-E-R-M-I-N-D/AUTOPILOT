// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 2 (board web-mtpbmay4-94ii65): the polling
 * primitive slice 1's docstring deferred. Exercised with an injected fake
 * clock/sleep so the whole suite runs instantly — no real wall-clock wait,
 * no fake-timer flakiness.
 */

import { describe, it, expect, vi } from 'vitest';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';
import type { PostPushVerdictContext } from '../../src/control/post-push-verdict.js';
import {
  watchPostPushCi,
  DEFAULT_POST_PUSH_WATCH_OPTIONS,
} from '../../src/control/post-push-watch.js';

const NOW = Date.parse('2026-09-07T12:00:00Z');

const CONTEXT: PostPushVerdictContext = {
  projectId: 'proj-1',
  branch: 'main',
  sha: 'abcdef1234567890',
};

function runningStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: null,
    ageLabel: '10s ago',
    createdAtMs: NOW,
    ok: true,
    detail: 'in_progress (10s ago)',
  };
}

function concludedStatus(
  conclusion: 'success' | 'failure',
  workflow = 'ci.yml',
): WorkflowRunStatus {
  return {
    workflow,
    conclusion,
    ageLabel: '1m ago',
    createdAtMs: NOW,
    ok: conclusion === 'success',
    detail: `${conclusion} (1m ago)`,
  };
}

/** A manually-advanced clock: `sleep` fast-forwards `now()` by the requested
 *  amount instead of actually waiting, so the loop under test resolves in
 *  real time while `now()` still reports the elapsed virtual time it relies
 *  on to notice its own deadline. */
function fakeClock(startMs: number) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('watchPostPushCi', () => {
  it('returns concluded on the very first check when CI already finished green', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi.fn().mockResolvedValue(concludedStatus('success'));
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 5000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toEqual({
      kind: 'concluded',
      verdict: { kind: 'recorded', workflow: 'ci.yml', detail: 'success (1m ago)' },
    });
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  it('polls through in-progress checks and returns a remediate verdict once CI concludes red', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi
      .fn()
      .mockResolvedValueOnce(runningStatus())
      .mockResolvedValueOnce(runningStatus())
      .mockResolvedValueOnce(concludedStatus('failure'));
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 10_000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome.kind).toBe('concluded');
    if (outcome.kind !== 'concluded') throw new Error('unreachable');
    expect(outcome.verdict.kind).toBe('remediate');
    expect(checkStatus).toHaveBeenCalledTimes(3);
  });

  it('gives up and reports timed-out when CI never concludes before the deadline', async () => {
    const clock = fakeClock(NOW);
    const checkStatus = vi.fn().mockResolvedValue(runningStatus());
    const outcome = await watchPostPushCi(
      CONTEXT,
      checkStatus,
      { pollIntervalMs: 1000, timeoutMs: 3000 },
      clock.sleep,
      clock.now,
    );
    expect(outcome).toEqual({ kind: 'timed-out', workflow: 'ci.yml' });
    // deadline = NOW+3000ms; checks land at virtual t=0,1000,2000,3000 (last
    // one sees the deadline reached and stops without sleeping again).
    expect(checkStatus).toHaveBeenCalledTimes(4);
  });

  it('exposes sane production defaults: poll every 30s, give up after 20 minutes', () => {
    expect(DEFAULT_POST_PUSH_WATCH_OPTIONS).toEqual({
      pollIntervalMs: 30_000,
      timeoutMs: 20 * 60_000,
    });
  });
});
