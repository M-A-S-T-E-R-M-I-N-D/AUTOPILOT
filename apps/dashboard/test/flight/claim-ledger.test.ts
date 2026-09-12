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

  it('the window is the shared 14-day convention', () => {
    expect(CLAIM_WINDOW_DAYS).toBe(14);
  });
});
