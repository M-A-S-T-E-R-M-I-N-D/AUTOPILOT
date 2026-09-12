// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pool client panel's pure formatting math
 * (`web/pool-client-panel.ts`) — the dashboard UI surface for `GET
 * /api/pool-client` + `POST /api/pool-client/execute` (epic 0007, "PLATFORM
 * 6/7", slice 6's browse/claim panel).
 */

import { describe, it, expect } from 'vitest';
import {
  poolClaimDecisionLabel,
  poolClaimLedgerText,
  poolClaimConfirmMessage,
  poolClaimExecuteResult,
  poolClaimExecuteTip,
  poolClaimFlyTip,
  poolClaimFlyResult,
} from '../../src/web/pool-client-panel.js';

describe('poolClaimDecisionLabel', () => {
  it('labels a claim decision', () => {
    expect(poolClaimDecisionLabel('claim')).toBe('✓ claimable');
  });

  it('labels a skip decision', () => {
    expect(poolClaimDecisionLabel('skip')).toBe('— already claimed');
  });

  it('echoes back an unrecognized decision verbatim rather than throwing', () => {
    expect(poolClaimDecisionLabel('mystery')).toBe('mystery');
  });
});

describe('poolClaimConfirmMessage', () => {
  const issue = { number: 7, title: 'Fix the thing', url: 'https://x/7', assignees: [] };

  it('states the issue and reasoning', () => {
    const msg = poolClaimConfirmMessage(issue, {
      decision: 'claim',
      reasoning: 'claiming #7 for octocat',
    });
    expect(msg).toContain('Claim pool issue #7 "Fix the thing"?');
    expect(msg).toContain('claiming #7 for octocat');
  });

  it('omits the queuing line when no project is picked', () => {
    const msg = poolClaimConfirmMessage(issue, { decision: 'claim', reasoning: 'claiming #7' });
    expect(msg).not.toContain('local board task');
  });

  it('names the target project when one is picked', () => {
    const msg = poolClaimConfirmMessage(
      issue,
      { decision: 'claim', reasoning: 'claiming #7' },
      'dashboard',
    );
    expect(msg).toContain('A local board task will also be queued on "dashboard"');
  });
});

describe('poolClaimExecuteResult', () => {
  it('joins every planned command detail in order on success', () => {
    const result = poolClaimExecuteResult({
      decision: { decision: 'claim', reasoning: 'claiming #7' },
      commandResults: [
        { command: { details: 'assigning #7 to octocat' }, code: 0 },
        { command: { details: 'posting the claim as a comment on #7' }, code: 0 },
      ],
    });
    expect(result.text).toBe('✓ assigning #7 to octocat; posting the claim as a comment on #7.');
    expect(result.className).toBe('pool-client-result pool-client-result-ok');
  });

  it('reports the first failing command, not a generic message', () => {
    const result = poolClaimExecuteResult({
      decision: { decision: 'claim', reasoning: 'claiming #7' },
      commandResults: [{ command: { details: 'assigning #7 to octocat' }, code: 1 }],
    });
    expect(result.text).toBe('✗ assigning #7 to octocat failed (exit 1).');
    expect(result.className).toBe('pool-client-result pool-client-result-fail');
  });

  it('reports a skip decision as its own reasoning rather than a fake success', () => {
    const result = poolClaimExecuteResult({
      decision: { decision: 'skip', reasoning: '#7 is already claimed by someone-else' },
      commandResults: [],
    });
    expect(result.text).toBe('✗ #7 is already claimed by someone-else');
    expect(result.className).toBe('pool-client-result pool-client-result-fail');
  });

  it('notes a queued local board task on success when taskQueued is true, and offers a fly action', () => {
    const result = poolClaimExecuteResult({
      decision: { decision: 'claim', reasoning: 'claiming #7' },
      commandResults: [{ command: { details: 'assigning #7 to octocat' }, code: 0 }],
      taskQueued: true,
    });
    expect(result.text).toBe('✓ assigning #7 to octocat. A local board task was queued too.');
    expect(result.offerFly).toBe(true);
  });

  it('says nothing extra on success when taskQueued is false, and offers no fly action', () => {
    const result = poolClaimExecuteResult({
      decision: { decision: 'claim', reasoning: 'claiming #7' },
      commandResults: [{ command: { details: 'assigning #7 to octocat' }, code: 0 }],
      taskQueued: false,
    });
    expect(result.text).toBe('✓ assigning #7 to octocat.');
    expect(result.offerFly).toBeUndefined();
  });

  it('falls back to the error field when there is no decision', () => {
    expect(poolClaimExecuteResult({ error: 'pool client execute failed' }).text).toBe(
      '✗ pool client execute failed',
    );
  });

  it('treats a null/undefined response as a failure', () => {
    expect(poolClaimExecuteResult(null).text).toBe('✗ Pool claim execute failed.');
    expect(poolClaimExecuteResult(undefined).className).toBe(
      'pool-client-result pool-client-result-fail',
    );
  });
});

describe('poolClaimExecuteTip', () => {
  it('names the issue and decision', () => {
    const tip = poolClaimExecuteTip(
      { number: 7, title: 'Fix the thing', url: 'https://x/7', assignees: [] },
      { decision: 'claim', reasoning: 'claiming #7' },
    );
    expect(tip).toContain('Claim pool issue #7');
    expect(tip).toContain('claimable');
  });
});

describe('poolClaimFlyTip', () => {
  it('names the target project', () => {
    expect(poolClaimFlyTip('dashboard')).toContain('"dashboard"');
  });
});

describe('poolClaimFlyResult', () => {
  it('reports a started flight as success, echoing the server message', () => {
    const result = poolClaimFlyResult({ started: true, message: 'Flying dashboard.' });
    expect(result.text).toBe('✓ Flying dashboard.');
    expect(result.className).toBe('pool-client-result pool-client-result-ok');
  });

  it('reports a queued flight (concurrency cap full) as success too, matching StartFlightResult\'s own "queued is accepted, not refused" contract', () => {
    const result = poolClaimFlyResult({ queued: true });
    expect(result.text).toBe('✓ Flight queued.');
    expect(result.className).toBe('pool-client-result pool-client-result-ok');
  });

  it('reports neither started nor queued as a failure, surfacing the server message', () => {
    const result = poolClaimFlyResult({
      started: false,
      message: 'a flight is already running there',
    });
    expect(result.text).toBe('✗ a flight is already running there');
    expect(result.className).toBe('pool-client-result pool-client-result-fail');
  });

  it('falls back to a generic failure message when the server gives no message or error', () => {
    expect(poolClaimFlyResult({ started: false }).text).toBe('✗ Could not start the flight.');
  });

  it('treats a null/undefined response as a failure', () => {
    expect(poolClaimFlyResult(null).text).toBe('✗ Fly request failed — try again shortly.');
    expect(poolClaimFlyResult(undefined).className).toBe(
      'pool-client-result pool-client-result-fail',
    );
  });
});

describe('the claims ledger on the panel (#27 was claimed twice without a word of it)', () => {
  const T0 = Date.parse('2026-09-11T14:23:10Z');
  const DAY = 24 * 60 * 60 * 1000;
  const live = {
    claim: { login: 'gabibi555', claimedAt: T0, assigned: false, contested: false },
    quietDays: 2,
    releasesAt: T0 + 14 * DAY,
    stale: false,
  };

  it('labels a contest decision as held, with the claim-anyway question', () => {
    expect(poolClaimDecisionLabel('contest')).toBe('⚑ held — claim anyway?');
  });

  it('paints who holds the issue, since when, and when it releases', () => {
    expect(poolClaimLedgerText([live])).toBe(
      'Held by @gabibi555 since 2026-09-11 · quiet 2d · releases 2026-09-25 if nothing moves.',
    );
  });

  it('says a stale claim releases on the next claim or the flight-end sweep', () => {
    expect(poolClaimLedgerText([{ ...live, quietDays: 16, stale: true }])).toContain(
      'quiet 16d, stale: releases on the next claim or flight-end sweep',
    );
  });

  it('lists every holder, marks the contested one, and calls an undated assignee out as such', () => {
    const text = poolClaimLedgerText([
      live,
      {
        claim: {
          login: 'M-A-S-T-E-R-M-I-N-D',
          claimedAt: T0 + DAY,
          assigned: true,
          contested: true,
        },
        quietDays: 1,
        releasesAt: T0 + 15 * DAY,
        stale: false,
      },
      {
        claim: { login: 'silent', claimedAt: null, assigned: true, contested: false },
        quietDays: null,
        releasesAt: null,
        stale: false,
      },
    ]);
    expect(text).toContain('@gabibi555 since 2026-09-11');
    expect(text).toContain('@M-A-S-T-E-R-M-I-N-D since 2026-09-12 (contested)');
    expect(text).toContain('@silent date unknown');
  });

  it('is empty when nobody holds the issue', () => {
    expect(poolClaimLedgerText([])).toBe('');
    expect(poolClaimLedgerText(undefined)).toBe('');
  });

  it('the contest confirm spells out the 14-day release and the compare-both-solutions rule', () => {
    const msg = poolClaimConfirmMessage(
      { number: 27, title: 'Navigation remake', url: 'https://x/27', assignees: [] },
      { decision: 'contest', reasoning: '#27 is held by @gabibi555 since 2026-09-11.' },
      'dashboard',
    );
    expect(msg).toContain('Claim pool issue #27 "Navigation remake" ANYWAY?');
    expect(msg).toContain('#27 is held by @gabibi555 since 2026-09-11.');
    expect(msg).toContain('quiet for 14 days');
    expect(msg).toContain('releases on its own');
    expect(msg).toContain('the review compares them');
    expect(msg).toContain('A local board task will also be queued on "dashboard"');
  });

  it('the plain claim confirm names the 14-day rule too, comment first', () => {
    const msg = poolClaimConfirmMessage(
      { number: 7, title: 'Fix the thing', url: 'https://x/7', assignees: [] },
      { decision: 'claim', reasoning: 'claiming #7 for octocat' },
    );
    expect(msg).toContain('posts a claim comment on GitHub and assigns the issue to you');
    expect(msg).toContain('14 quiet days release it back to the pool');
  });

  it('the contest tip says someone holds it', () => {
    expect(
      poolClaimExecuteTip(
        { number: 27, title: 't', url: 'u', assignees: [] },
        { decision: 'contest', reasoning: 'r' },
      ),
    ).toContain('Someone holds it already');
  });
});
