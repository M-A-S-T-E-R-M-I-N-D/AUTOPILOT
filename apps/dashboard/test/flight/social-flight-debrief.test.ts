// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's SOCIAL debrief (epic 0016 slice 5/6, board
 * web-mtpzzxw4-au1b6x): a whole flight's social-pass outcomes folded into
 * one end-of-flight line — silent when no pass ran or was refused, the caps
 * consumed against the summed per-pass budget, the verdict totals, the
 * refusals an operator who turned the toggle on wants explained, and an
 * outright "nothing posted" while the passes stay read-only.
 */

import { describe, it, expect } from 'vitest';
import {
  socialFlightDebriefLine,
  socialFlightDebriefOf,
} from '../../src/flight/social-flight-debrief.js';
import type {
  SocialFlightPassOutcome,
  SocialFlightPassRan,
  SocialFlightSkipReason,
} from '../../src/flight/social-flight-pass.js';
import type { SocialCandidateAction, SocialProtocolVerdict } from '../../src/flight/social-pass.js';
import type { SocialFlightPhase } from '../../src/flight/social-flight-trigger.js';

const ISSUE: SocialCandidateAction = {
  kind: 'new-issue',
  reasoning: 'a mirror finding',
  title: 'The README install section still names the retired launcher',
  body: 'x',
};
const COMMENT: SocialCandidateAction = {
  kind: 'comment',
  reasoning: 'an answer',
  issueNumber: 4,
  body: 'x',
};
const EMPTY: SocialProtocolVerdict = { allowed: [], queued: [], duplicate: [], refused: [] };

function ran(
  phase: SocialFlightPhase,
  verdict: SocialProtocolVerdict = EMPTY,
): SocialFlightPassRan {
  return {
    ran: true,
    phase,
    toggle: 'full',
    identity: {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
      tier: 'Maintainer',
    },
    ownSubmissions: 1,
    openThreads: 2,
    caps: { maxNewIssues: 1, maxComments: 3 },
    verdict,
  };
}

function skipped(
  phase: SocialFlightPhase,
  reason: SocialFlightSkipReason,
): SocialFlightPassOutcome {
  return { ran: false, phase, toggle: 'full', reason };
}

describe('socialFlightDebriefOf — what the flight said nothing about stays unsaid', () => {
  it('a flight with no social pass at all has nothing to debrief', () => {
    expect(socialFlightDebriefOf([])).toBeNull();
  });

  it('a toggle that was off, or not on for these phases, is the expected silent case', () => {
    expect(
      socialFlightDebriefOf([skipped('start', 'toggle-off'), skipped('end', 'phase-not-enabled')]),
    ).toBeNull();
  });
});

describe('socialFlightDebriefOf — the whole flight in one digest', () => {
  it('sums the per-pass caps into the flight budget and counts the allowed plan against it by kind', () => {
    const digest = socialFlightDebriefOf([
      ran('start', { allowed: [ISSUE, COMMENT], queued: [], duplicate: [], refused: [] }),
      ran('interval', { allowed: [COMMENT], queued: [ISSUE], duplicate: [ISSUE], refused: [] }),
      ran('end', { allowed: [], queued: [], duplicate: [], refused: [COMMENT, COMMENT] }),
    ]);

    expect(digest).toEqual({
      passesRan: 3,
      skippedForeignTarget: 0,
      skippedGhDisconnected: 0,
      newIssuesAllowed: 1,
      newIssueBudget: 3,
      commentsAllowed: 2,
      commentBudget: 9,
      queued: 1,
      duplicate: 1,
      refused: 2,
    });
  });

  it('counts the refusals the pass already explained, and never the silent skips', () => {
    const digest = socialFlightDebriefOf([
      skipped('start', 'gh-disconnected'),
      skipped('interval', 'phase-not-enabled'),
      skipped('end', 'gh-disconnected'),
      skipped('end', 'foreign-target'),
    ]);

    expect(digest).toMatchObject({
      passesRan: 0,
      skippedForeignTarget: 1,
      skippedGhDisconnected: 2,
      newIssueBudget: 0,
      commentBudget: 0,
    });
  });
});

describe('socialFlightDebriefLine — the SOCIAL section of the flight log', () => {
  it('reads the caps consumed and the verdict totals, and says outright that nothing was posted', () => {
    const digest = socialFlightDebriefOf([
      ran('start', { allowed: [ISSUE], queued: [COMMENT], duplicate: [], refused: [] }),
      ran('end'),
    ]);

    expect(digest && socialFlightDebriefLine(digest)).toBe(
      'SOCIAL debrief: 2 pass(es) ran; caps consumed 1/2 new issue(s), 0/6 comment(s); ' +
        '1 queued, 0 duplicate, 0 refused; nothing posted (read-only passes).',
    );
  });

  it('names each refusal reason with its count after the passes that ran', () => {
    const digest = socialFlightDebriefOf([
      ran('start'),
      skipped('interval', 'gh-disconnected'),
      skipped('end', 'foreign-target'),
    ]);

    expect(digest && socialFlightDebriefLine(digest)).toBe(
      'SOCIAL debrief: 1 pass(es) ran; caps consumed 0/1 new issue(s), 0/3 comment(s); ' +
        '0 queued, 0 duplicate, 0 refused; 1 skipped (foreign target); ' +
        '1 skipped (gh not connected); nothing posted (read-only passes).',
    );
  });

  it('drops the caps and verdict when no pass ran — a 0/0 budget is not a reading', () => {
    const digest = socialFlightDebriefOf([
      skipped('start', 'gh-disconnected'),
      skipped('end', 'gh-disconnected'),
    ]);

    expect(digest && socialFlightDebriefLine(digest)).toBe(
      'SOCIAL debrief: 0 pass(es) ran; 2 skipped (gh not connected); ' +
        'nothing posted (read-only passes).',
    );
  });
});
