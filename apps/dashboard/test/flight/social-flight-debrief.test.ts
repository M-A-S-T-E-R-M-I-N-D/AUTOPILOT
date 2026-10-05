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
  SOCIAL_DEBRIEF_EVENT,
  parseSocialFlightDebrief,
  socialFlightDebriefLine,
  socialFlightDebriefOf,
  type SocialFlightDebrief,
  type SocialFlightMirrorDigest,
} from '../../src/flight/social-flight-debrief.js';
import type {
  MirrorPreviewOutcome,
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
const MIRROR: SocialFlightMirrorDigest = {
  checked: 4,
  toClose: 1,
  toReopen: 1,
  toNote: 0,
  toSettle: 0,
  inSync: 2,
};
const MIRROR_RAN: MirrorPreviewOutcome = { ran: true, ...MIRROR };

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

  it("folds in the standalone flight's mirror-pass preview when it ran (epic 0016 4/6)", () => {
    const digest = socialFlightDebriefOf([ran('start')], MIRROR_RAN);

    expect(digest).toMatchObject({ passesRan: 1, mirror: MIRROR });
  });

  it('keeps no mirror reading when the preview skipped quietly — or a code flight had none', () => {
    for (const mirror of [
      { ran: false, reason: 'no-store' },
      { ran: false, reason: 'project-unknown' },
      { ran: false, reason: 'preview-error' },
      undefined,
    ] as const) {
      const digest = socialFlightDebriefOf([ran('start')], mirror);
      expect(digest && 'mirror' in digest, JSON.stringify(mirror)).toBe(false);
    }
  });

  it('a mirror reading alone never breaks the silence of a flight whose passes all stayed off', () => {
    expect(socialFlightDebriefOf([skipped('start', 'toggle-off')], MIRROR_RAN)).toBeNull();
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

  it("reads the mirror preview's counts after the verdict totals, as a preview — never as applied", () => {
    const digest = socialFlightDebriefOf([ran('start')], MIRROR_RAN);

    expect(digest && socialFlightDebriefLine(digest)).toBe(
      'SOCIAL debrief: 1 pass(es) ran; caps consumed 0/1 new issue(s), 0/3 comment(s); ' +
        '0 queued, 0 duplicate, 0 refused; mirror pass previewed 4 github-linked task(s) — ' +
        '1 to close, 1 to reopen, 0 unverified note(s), 0 to settle, 2 in sync; ' +
        'nothing posted (read-only passes).',
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

describe('parseSocialFlightDebrief — the persisted digest reads back whole, or not at all', () => {
  const DIGEST: SocialFlightDebrief = {
    passesRan: 3,
    skippedForeignTarget: 1,
    skippedGhDisconnected: 0,
    newIssuesAllowed: 1,
    newIssueBudget: 3,
    commentsAllowed: 2,
    commentBudget: 9,
    queued: 1,
    duplicate: 0,
    refused: 2,
  };

  it('names the event type fly.ts persists the digest under', () => {
    expect(SOCIAL_DEBRIEF_EVENT).toBe('social-debrief');
  });

  it('round-trips the digest fly.ts writes verbatim', () => {
    expect(parseSocialFlightDebrief(JSON.stringify(DIGEST))).toEqual(DIGEST);
  });

  it('keeps only the digest fields, never a stray key from the payload', () => {
    const parsed = parseSocialFlightDebrief(JSON.stringify({ ...DIGEST, posted: 4 }));
    expect(parsed).toEqual(DIGEST);
  });

  it('refuses a missing, non-JSON or non-object payload', () => {
    for (const payload of [null, '', 'not json', 'null', '7', '"x"', '[]']) {
      expect(parseSocialFlightDebrief(payload), String(payload)).toBeNull();
    }
  });

  it('refuses a partial digest rather than reading a missing count as zero', () => {
    const { refused: _dropped, ...partial } = DIGEST;
    expect(parseSocialFlightDebrief(JSON.stringify(partial))).toBeNull();
  });

  it('refuses a count that is not a non-negative whole number', () => {
    for (const bad of ['3', -1, 1.5, null, true]) {
      const payload = JSON.stringify({ ...DIGEST, queued: bad });
      expect(parseSocialFlightDebrief(payload), JSON.stringify(bad)).toBeNull();
    }
  });

  it("round-trips a Fly GitHub flight's mirror reading, and a row without one keeps none", () => {
    const withMirror: SocialFlightDebrief = { ...DIGEST, mirror: MIRROR };
    expect(parseSocialFlightDebrief(JSON.stringify(withMirror))).toEqual(withMirror);
    expect(parseSocialFlightDebrief(JSON.stringify(DIGEST))).not.toHaveProperty('mirror');
  });

  it('refuses a malformed or partial mirror reading rather than dropping it or reading a gap as zero', () => {
    const { inSync: _dropped, ...partial } = MIRROR;
    for (const mirror of [null, 7, 'x', [], partial, { ...MIRROR, toClose: -1 }]) {
      const payload = JSON.stringify({ ...DIGEST, mirror });
      expect(parseSocialFlightDebrief(payload), JSON.stringify(mirror)).toBeNull();
    }
  });

  it('keeps only the mirror fields, never a stray key from the payload', () => {
    const payload = JSON.stringify({ ...DIGEST, mirror: { ...MIRROR, closed: 3 } });
    expect(parseSocialFlightDebrief(payload)).toEqual({ ...DIGEST, mirror: MIRROR });
  });
});
