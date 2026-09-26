// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE CLAIMS LEDGER (claim-ledger.ts) — the law born of #27 being claimed
 * twice: a claim is read from the claim COMMENT and the assignee, a
 * release note ends it, the claimant's own later comments keep it alive,
 * and 14 quiet days make it stale.
 */

import { describe, it, expect } from 'vitest';
import {
  claimLedger,
  claimStanding,
  claimStandings,
  CLAIM_WINDOW_DAYS,
  CLAIM_COMMENT_RE,
  CLAIM_RELEASE_RE,
} from '../../src/flight/claim-ledger.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-09-11T14:23:10Z');

function comment(author: string, body: string, at: number) {
  return { author, body, createdAt: at };
}

describe('claimLedger', () => {
  it('reads a claim from the pool client sentence even when the assign never landed (#27)', () => {
    const claims = claimLedger(
      [],
      [
        comment(
          'gabibi555',
          'Claimed by gabibi555 via the pool client.\n\n— ✈️ AUTOPILOT agent',
          T0,
        ),
      ],
    );
    expect(claims).toEqual([
      { login: 'gabibi555', claimedAt: T0, assigned: false, lastActivityAt: T0, contested: false },
    ]);
  });

  it('merges an assignee with their claim comment, and lists an assignee without one as undated', () => {
    const claims = claimLedger(
      ['octocat', 'silent'],
      [comment('octocat', 'Claimed by octocat via the pool client.', T0)],
    );
    expect(claims).toEqual([
      { login: 'silent', claimedAt: null, assigned: true, lastActivityAt: null, contested: false },
      { login: 'octocat', claimedAt: T0, assigned: true, lastActivityAt: T0, contested: false },
    ]);
  });

  it('keeps the first claim when a second one rides over it, and marks the second contested', () => {
    const claims = claimLedger(
      ['M-A-S-T-E-R-M-I-N-D'],
      [
        comment('gabibi555', 'Claimed by gabibi555 via the pool client.', T0),
        comment(
          'M-A-S-T-E-R-M-I-N-D',
          'Also claimed by M-A-S-T-E-R-M-I-N-D via the pool client (contested).',
          T0 + DAY,
        ),
      ],
    );
    expect(claims.map((c) => [c.login, c.contested, c.assigned])).toEqual([
      ['gabibi555', false, false],
      ['M-A-S-T-E-R-M-I-N-D', true, true],
    ]);
  });

  it("a release note ends that login's claim; the reaper's Unassigning wording counts too", () => {
    const claims = claimLedger(
      [],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('b', 'Claimed by b via the pool client.', T0 + DAY),
        comment(
          'bot',
          "Releasing @a's claim — quiet for 15 days, past the 14-day window.",
          T0 + 16 * DAY,
        ),
        comment('bot', 'Unassigning @b — quiet for 14 days on this claim.', T0 + 20 * DAY),
      ],
    );
    expect(claims).toEqual([]);
  });

  it("the claimant's own later comment counts as activity; anyone else's does not", () => {
    const claims = claimLedger(
      [],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('someone', 'any news?', T0 + 5 * DAY),
        comment('a', 'Progress note: half the slices are in.', T0 + 3 * DAY),
      ],
    );
    expect(claims[0]?.lastActivityAt).toBe(T0 + 3 * DAY);
  });

  it('walks comments oldest-first regardless of input order', () => {
    const claims = claimLedger(
      [],
      [
        comment('bot', "Releasing @a's claim — quiet.", T0 + 20 * DAY),
        comment('a', 'Claimed by a via the pool client.', T0),
      ],
    );
    expect(claims).toEqual([]);
  });

  it('a release note ends the claim even when the paired --remove-assignee call failed and the login is still assigned', () => {
    const claims = claimLedger(
      ['b'],
      [
        comment('b', 'Claimed by b via the pool client.', T0),
        comment('bot', 'Unassigning @b — quiet for 14 days on this claim.', T0 + 20 * DAY),
      ],
    );
    expect(claims).toEqual([]);
  });

  it('re-claiming after a release opens a fresh claim', () => {
    const claims = claimLedger(
      [],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('bot', "Releasing @a's claim — quiet.", T0 + 20 * DAY),
        comment('a', 'Claimed by a via the pool client.', T0 + 21 * DAY),
      ],
    );
    expect(claims).toEqual([
      {
        login: 'a',
        claimedAt: T0 + 21 * DAY,
        assigned: false,
        lastActivityAt: T0 + 21 * DAY,
        contested: false,
      },
    ]);
  });

  it('ignores comments that merely mention the words', () => {
    const claims = claimLedger(
      [],
      [comment('x', 'I think this was claimed by y via the pool client last week', T0)],
    );
    expect(claims).toEqual([]);
  });

  /**
   * EPIC 0019 additive-only law — the edge branches the first tests walked
   * past. Each pins behavior the pool client, the panel and the flight-end
   * reaper already rely on; none of them changes a contract.
   */
  it('a second claim sentence by the SAME login renews their one claim instead of duplicating it', () => {
    const claims = claimLedger(
      [],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('a', 'Also claimed by a via the pool client (contested).', T0 + DAY),
      ],
    );
    expect(claims).toEqual([
      {
        login: 'a',
        claimedAt: T0 + DAY,
        assigned: false,
        lastActivityAt: T0 + DAY,
        contested: true,
      },
    ]);
  });

  it('keys a relayed claim on the login it NAMES, not on who posted it — the named login keeps it alive, the relay does not', () => {
    const claims = claimLedger(
      [],
      [
        comment('autopilot-bot', 'Claimed by gabibi555 via the pool client.', T0),
        comment('autopilot-bot', 'Flight 12 started on this issue.', T0 + DAY),
        comment('gabibi555', 'Progress note: first slice is up.', T0 + 2 * DAY),
        comment('autopilot-bot', 'Flight 12 ended.', T0 + 3 * DAY),
      ],
    );
    expect(claims).toEqual([
      {
        login: 'gabibi555',
        claimedAt: T0,
        assigned: false,
        lastActivityAt: T0 + 2 * DAY,
        contested: false,
      },
    ]);
  });

  it("a released login's later plain comment does not resurrect the claim — only a fresh claim sentence reopens it", () => {
    const claims = claimLedger(
      ['a'],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('bot', "Releasing @a's claim — quiet for 15 days.", T0 + 20 * DAY),
        comment('a', 'Sorry, got pulled away — back on it now.', T0 + 21 * DAY),
      ],
    );
    expect(claims).toEqual([]);
  });

  it('a release note ends an undated assignee-only claim too — the note beats the raw assignee list even with no claim sentence before it', () => {
    const claims = claimLedger(
      ['silent', 'octocat'],
      [
        comment('octocat', 'Claimed by octocat via the pool client.', T0),
        comment('maintainer', 'Unassigning @silent — you were added by mistake.', T0 + DAY),
      ],
    );
    expect(claims).toEqual([
      { login: 'octocat', claimedAt: T0, assigned: true, lastActivityAt: T0, contested: false },
    ]);
  });

  it('a release for one login leaves every other live claim untouched', () => {
    const claims = claimLedger(
      [],
      [
        comment('a', 'Claimed by a via the pool client.', T0),
        comment('b', 'Also claimed by b via the pool client (contested).', T0 + DAY),
        comment('bot', "Releasing @a's claim — quiet for 15 days.", T0 + 16 * DAY),
      ],
    );
    expect(claims).toEqual([
      {
        login: 'b',
        claimedAt: T0 + DAY,
        assigned: false,
        lastActivityAt: T0 + DAY,
        contested: true,
      },
    ]);
  });

  it('orders dated claims oldest-first no matter how the assignee list orders them', () => {
    const claims = claimLedger(
      ['late', 'early'],
      [
        comment('late', 'Claimed by late via the pool client.', T0 + 5 * DAY),
        comment('early', 'Claimed by early via the pool client.', T0),
      ],
    );
    expect(claims.map((c) => c.login)).toEqual(['early', 'late']);
  });

  it('puts every undated assignee ahead of every dated claim, keeping the assignee order among them', () => {
    const claims = claimLedger(
      ['quiet-z', 'dated-b', 'quiet-a'],
      [
        comment('dated-b', 'Claimed by dated-b via the pool client.', T0 + 2 * DAY),
        comment('dated-a', 'Claimed by dated-a via the pool client.', T0),
      ],
    );
    expect(claims.map((c) => [c.login, c.claimedAt])).toEqual([
      ['quiet-z', null],
      ['quiet-a', null],
      ['dated-a', T0],
      ['dated-b', T0 + 2 * DAY],
    ]);
  });

  it('an empty issue — no assignees, no comments — is simply free', () => {
    expect(claimLedger([], [])).toEqual([]);
  });
});

describe('the sentences', () => {
  it('match the pool client claim wording with or without an @', () => {
    expect(CLAIM_COMMENT_RE.exec('Claimed by @octo-cat via the pool client.')?.[2]).toBe(
      'octo-cat',
    );
    expect(
      CLAIM_COMMENT_RE.exec(
        'Also claimed by M-A-S-T-E-R-M-I-N-D via the pool client (contested).',
      )?.[1],
    ).toBe('Also c');
  });

  it('match both release verbs', () => {
    expect(CLAIM_RELEASE_RE.exec("Releasing @a's claim — quiet")?.[1]).toBe('a');
    expect(CLAIM_RELEASE_RE.exec('Unassigning @b-c — quiet for 14 days')?.[1]).toBe('b-c');
  });
});

describe('claimStanding', () => {
  const claim = { login: 'a', claimedAt: T0, assigned: true, lastActivityAt: T0, contested: false };

  it('is live inside the window and says when it releases', () => {
    const s = claimStanding(claim, T0 + 2 * DAY);
    expect(s).toEqual({
      claim,
      quietDays: 2,
      releasesAt: T0 + CLAIM_WINDOW_DAYS * DAY,
      stale: false,
    });
  });

  it('is stale at exactly the window', () => {
    expect(claimStanding(claim, T0 + CLAIM_WINDOW_DAYS * DAY).stale).toBe(true);
    expect(claimStanding(claim, T0 + CLAIM_WINDOW_DAYS * DAY - 1).stale).toBe(false);
  });

  it('never calls an undated claim stale — the ledger does not guess', () => {
    const undated = { ...claim, claimedAt: null, lastActivityAt: null };
    expect(claimStanding(undated, T0 + 100 * DAY)).toEqual({
      claim: undated,
      quietDays: null,
      releasesAt: null,
      stale: false,
    });
  });

  it('measures every claim at once', () => {
    expect(claimStandings([claim, { ...claim, login: 'b' }], T0).map((s) => s.claim.login)).toEqual(
      ['a', 'b'],
    );
  });

  it('clamps a future-dated activity (clock skew between gh and the host) to zero quiet days, never negative and never stale', () => {
    const s = claimStanding(claim, T0 - 3 * DAY);
    expect(s.quietDays).toBe(0);
    expect(s.stale).toBe(false);
    expect(s.releasesAt).toBe(T0 + CLAIM_WINDOW_DAYS * DAY);
  });

  it('floors partial days — 13 days and 23 hours of quiet is 13 quiet days, still live', () => {
    const s = claimStanding(claim, T0 + 13 * DAY + 23 * 60 * 60 * 1000);
    expect(s.quietDays).toBe(13);
    expect(s.stale).toBe(false);
  });

  it('honors a caller-supplied window, and claimStandings threads it through to every claim', () => {
    const two = claimStanding(claim, T0 + 3 * DAY, 2);
    expect(two).toEqual({ claim, quietDays: 3, releasesAt: T0 + 2 * DAY, stale: true });

    const all = claimStandings([claim, { ...claim, login: 'b' }], T0 + 3 * DAY, 2);
    expect(all.map((s) => [s.claim.login, s.stale, s.releasesAt])).toEqual([
      ['a', true, T0 + 2 * DAY],
      ['b', true, T0 + 2 * DAY],
    ]);
  });

  it('an undated claim stays undated under any window', () => {
    const undated = { ...claim, claimedAt: null, lastActivityAt: null };
    expect(claimStandings([undated], T0 + 100 * DAY, 1)[0]).toEqual({
      claim: undated,
      quietDays: null,
      releasesAt: null,
      stale: false,
    });
  });

  it('the window is the shared 14-day convention', () => {
    expect(CLAIM_WINDOW_DAYS).toBe(14);
  });
});
