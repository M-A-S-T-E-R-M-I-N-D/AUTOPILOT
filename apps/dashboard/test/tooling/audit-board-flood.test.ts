// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure flood-detection functions of
 * scripts/ci/audit-board-flood.mjs, the read-only auditor that finds the
 * near-duplicate/consecutive-run/rapid-fire flood shapes the runtime
 * `flight/anti-flood.ts` guard exists to stop from posting in the first
 * place (this script catches whatever slips past it — see that module's
 * doc comment). `main()`/`threadMessages()`/`gh()` stay unimported — they
 * shell out to the `gh` CLI, same stance every other scripts/ci test takes
 * for its sibling script's fs/git-touching entrypoint.
 *
 * Guard-precision doctrine (FAILURE-DOCTRINE row 6, board web-mtqumz0u-j39av4):
 * every finding kind below gets a companion negative-corpus case proving the
 * near-miss shape it must NOT flag — a scanner with false positives trains
 * everyone to ignore it.
 */
import { describe, it, expect } from 'vitest';
import {
  normalize,
  similarity,
  auditThread,
  boardThreads,
  threadTimeline,
  DUPLICATE_RATIO,
  RAPID_FIRE_MS,
  CONSECUTIVE_CEILING,
  MIN_COMPARE_LENGTH,
  SNIPPET_LENGTH,
} from '../../../../scripts/ci/audit-board-flood.mjs';
import { normalizeCommentText } from '../../src/flight/anti-flood.js';

function msg(
  id: number,
  author: string,
  at: string,
  body: string,
  url = `https://github.com/example/repo/issues/1#${id}`,
) {
  return { kind: 'comment', id, author, at, body, url };
}

describe('normalize', () => {
  it('flattens shell-mangled punctuation so a retry matches its original', () => {
    expect(normalize('≥400 — don’t')).toBe(normalize('>=400 - dont'));
  });

  it('lower-cases, collapses whitespace runs and trims — the exact shape similarity splits on', () => {
    // Comparing two normalized strings to each other cannot see case, an
    // untrimmed edge or a doubled space (both sides carry it alike), so the
    // output itself is pinned.
    expect(normalize('  Hello,\n\n  WORLD   again\t')).toBe('hello world again');
  });

  it('reads a missing body (null or undefined) as empty text, not a crash', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });

  it("agrees with the runtime guard's normalizeCommentText on smart and ASCII punctuation alike", () => {
    // The auditor finds what anti-flood.ts failed to stop, so the two must
    // read "same message" identically — including the smart-punctuation
    // swaps the runtime guard spells out and this strip covers on its own.
    const corpus = [
      '≥400 — don’t',
      '>=400 - dont',
      '“Quoted” ‘single’ – en — em ≤ ≥',
      '"Quoted" \'single\' - en -- em <= >=',
      '  **Bold** _markdown_ `code`\n\n  and   ✓ symbols  ',
    ];
    for (const text of corpus) expect(normalize(text)).toBe(normalizeCommentText(text));
  });
});

describe('similarity', () => {
  it('scores two disjoint word sets at zero', () => {
    expect(similarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('scores identical text at one', () => {
    expect(similarity('same words here', 'same words here')).toBe(1);
  });

  it('scores two texts with no words at all at zero, not NaN', () => {
    expect(similarity('', '')).toBe(0);
  });

  it('does not count the empty "word" a doubled space splits out, on either side', () => {
    // anti-flood.ts's commentSimilarity splits the same way — the auditor and
    // the runtime guard must agree on what "same message" means.
    expect(similarity('same  words', 'same words')).toBe(1);
    expect(similarity('same words', 'same  words')).toBe(1);
  });
});

describe('auditThread — NEAR-DUPLICATE', () => {
  const long = 'this message is deliberately long enough to clear the compare-length floor';

  it('flags a same-author retry whose text is nearly identical', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', long),
      msg(2, 'bot', '2026-09-09T10:00:16Z', `${long}!`),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'NEAR-DUPLICATE', author: 'bot' }),
    );
  });

  it('says how similar the pair is and which earlier message it repeats', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', long),
      msg(2, 'bot', '2026-09-09T10:00:16Z', long),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: 'NEAR-DUPLICATE',
        detail: '100% identical to an earlier comment (1)',
      }),
    );
  });

  it(`flags a same-author pair at EXACTLY the ${DUPLICATE_RATIO} ratio boundary — the bound is inclusive`, () => {
    // 19 shared words plus one word unique to each side: similarity =
    // 18 / (19 + 19 - 18) = 18/20 = 0.9 exactly, pinning `>=` against a
    // `>` mutant that would let this exact boundary case through unflagged.
    const shared =
      'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo';
    const a = `${shared} sierra`;
    const b = `${shared} tango`;
    expect(similarity(normalize(a), normalize(b))).toBe(DUPLICATE_RATIO);
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', a),
      msg(2, 'bot', '2026-09-09T10:00:16Z', b),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'NEAR-DUPLICATE', author: 'bot' }),
    );
  });

  it('does not flag the same near-identical text from two DIFFERENT authors', () => {
    // A guard that only checks text similarity would call this a duplicate;
    // two people independently saying the same thing is not a flood.
    const findings = auditThread('issue #1', [
      msg(1, 'alice', '2026-09-09T10:00:00Z', long),
      msg(2, 'bob', '2026-09-09T10:00:16Z', `${long}!`),
    ]);
    expect(findings.filter((f) => f.kind === 'NEAR-DUPLICATE')).toEqual([]);
  });

  it('does not flag identical SHORT greetings under the compare-length floor', () => {
    const short = 'thanks!';
    expect(short.length).toBeLessThan(MIN_COMPARE_LENGTH);
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', short),
      msg(2, 'bot', '2026-09-09T11:00:00Z', short),
    ]);
    expect(findings.filter((f) => f.kind === 'NEAR-DUPLICATE')).toEqual([]);
  });

  it('flags an identical pair at EXACTLY the compare-length floor — the floor is inclusive', () => {
    // Pins the `<` skip-guard against a `<=` mutant: at exactly
    // MIN_COMPARE_LENGTH characters, the pair must still be compared.
    const atFloor = 'x'.repeat(MIN_COMPARE_LENGTH);
    expect(normalize(atFloor).length).toBe(MIN_COMPARE_LENGTH);
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', atFloor),
      msg(2, 'bot', '2026-09-09T11:00:00Z', atFloor),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'NEAR-DUPLICATE', author: 'bot' }),
    );
  });

  it('does not flag a genuine same-author follow-up well below the duplicate ratio', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', long),
      msg(
        2,
        'bot',
        '2026-09-09T12:00:00Z',
        'completely unrelated follow-up about a different topic entirely',
      ),
    ]);
    expect(
      similarity(
        normalize(long),
        normalize('completely unrelated follow-up about a different topic entirely'),
      ),
    ).toBeLessThan(DUPLICATE_RATIO);
    expect(findings.filter((f) => f.kind === 'NEAR-DUPLICATE')).toEqual([]);
  });
});

describe('auditThread — CONSECUTIVE-RUN', () => {
  it(`flags ${CONSECUTIVE_CEILING + 1} messages in a row from the same author`, () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'two'),
      msg(3, 'bot', '2026-09-09T10:10:00Z', 'three'),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'CONSECUTIVE-RUN', author: 'bot' }),
    );
  });

  it(`does not flag exactly ${CONSECUTIVE_CEILING} in a row — the ceiling is allowed`, () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'two'),
    ]);
    expect(findings.filter((f) => f.kind === 'CONSECUTIVE-RUN')).toEqual([]);
  });

  it('fires only ONCE for a run that keeps going past the tipping point, not once per extra message', () => {
    // Pins the `===` tipping check against a `>=` mutant: a run of 4 must
    // still report a single CONSECUTIVE-RUN finding, not one at length 3
    // AND another at length 4.
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'two'),
      msg(3, 'bot', '2026-09-09T10:10:00Z', 'three'),
      msg(4, 'bot', '2026-09-09T10:15:00Z', 'four'),
    ]);
    expect(findings.filter((f) => f.kind === 'CONSECUTIVE-RUN')).toHaveLength(1);
  });

  it('says how long the run is and names the message it starts at, not the thread opener', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'human', '2026-09-09T10:00:00Z', 'the opener'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'one'),
      msg(3, 'bot', '2026-09-09T10:10:00Z', 'two'),
      msg(4, 'bot', '2026-09-09T10:15:00Z', 'three'),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: 'CONSECUTIVE-RUN',
        detail: '3 messages in a row with nobody else speaking (run starts at 2)',
      }),
    );
  });

  it('does not flag a run broken up by another author speaking in between', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'two'),
      msg(3, 'human', '2026-09-09T10:07:00Z', 'a reply'),
      msg(4, 'bot', '2026-09-09T10:10:00Z', 'three'),
    ]);
    expect(findings.filter((f) => f.kind === 'CONSECUTIVE-RUN')).toEqual([]);
  });
});

describe('auditThread — RAPID-FIRE', () => {
  it(`flags same-author messages ${RAPID_FIRE_MS / 1000}s or less apart`, () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:02:00.000Z', 'two'),
    ]);
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'RAPID-FIRE', author: 'bot' }));
  });

  it('says the gap in seconds and what kind of message came just before', () => {
    const findings = auditThread('PR #1', [
      { ...msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'), kind: 'review:APPROVED' },
      msg(2, 'bot', '2026-09-09T10:01:30.000Z', 'two'),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: 'RAPID-FIRE',
        detail: "90s after the same author's previous review:APPROVED",
      }),
    );
  });

  it('does not flag same-author messages further apart than the rapid-fire window', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00.000Z', 'two'),
    ]);
    expect(findings.filter((f) => f.kind === 'RAPID-FIRE')).toEqual([]);
  });

  it('does not flag two different authors posting close together', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'alice', '2026-09-09T10:00:00.000Z', 'one'),
      msg(2, 'bob', '2026-09-09T10:00:05.000Z', 'two'),
    ]);
    expect(findings.filter((f) => f.kind === 'RAPID-FIRE')).toEqual([]);
  });
});

describe('auditThread — evidence snippet (guard-precision doctrine: a red must carry matched TEXT)', () => {
  const long = 'this message is deliberately long enough to clear the compare-length floor';

  it('carries the matched message body, not just a ratio/id/url, on a NEAR-DUPLICATE finding', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', long),
      msg(2, 'bot', '2026-09-09T10:00:16Z', `${long}!`),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'NEAR-DUPLICATE', snippet: `${long}!` }),
    );
  });

  it('carries the tipping message body on a CONSECUTIVE-RUN finding', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:05:00Z', 'two'),
      msg(3, 'bot', '2026-09-09T10:10:00Z', 'three — the one that tips the ceiling'),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: 'CONSECUTIVE-RUN',
        snippet: 'three — the one that tips the ceiling',
      }),
    );
  });

  it('carries the second message body on a RAPID-FIRE finding', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:02:00.000Z', 'two, right after'),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'RAPID-FIRE', snippet: 'two, right after' }),
    );
  });

  it(`truncates a snippet past ${SNIPPET_LENGTH} characters with an ellipsis`, () => {
    const overlong = 'x'.repeat(SNIPPET_LENGTH + 40);
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', overlong),
      msg(2, 'bot', '2026-09-09T10:02:00.000Z', overlong),
    ]);
    const rapidFire = findings.find((f) => f.kind === 'RAPID-FIRE');
    expect(rapidFire?.snippet).toBe(`${'x'.repeat(SNIPPET_LENGTH)}…`);
    expect(rapidFire?.snippet.length).toBe(SNIPPET_LENGTH + 1);
  });

  it('does NOT truncate a snippet at exactly the length ceiling (legit shape, must NOT ellipsize)', () => {
    const exact = 'y'.repeat(SNIPPET_LENGTH);
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', exact),
      msg(2, 'bot', '2026-09-09T10:02:00.000Z', exact),
    ]);
    const rapidFire = findings.find((f) => f.kind === 'RAPID-FIRE');
    expect(rapidFire?.snippet).toBe(exact);
  });

  it('flattens every whitespace run and trims the snippet so it prints on one line', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'),
      msg(2, 'bot', '2026-09-09T10:02:00.000Z', '  two,\n\n  right   after  '),
    ]);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'RAPID-FIRE', snippet: 'two, right after' }),
    );
  });

  it('carries an empty snippet, not a crash, for a message handed in with no body', () => {
    // threadTimeline never yields a null body, but auditThread is exported
    // and a caller may hand it raw rows.
    const noBody = { ...msg(2, 'bot', '2026-09-09T10:02:00.000Z', ''), body: null };
    const findings = auditThread('issue #1', [
      msg(1, 'bot', '2026-09-09T10:00:00.000Z', 'one'),
      noBody as unknown as ReturnType<typeof msg>,
    ]);
    expect(findings).toContainEqual(expect.objectContaining({ kind: 'RAPID-FIRE', snippet: '' }));
  });
});

describe('auditThread — clean threads', () => {
  it('returns no findings for an ordinary back-and-forth conversation', () => {
    const findings = auditThread('issue #1', [
      msg(1, 'alice', '2026-09-09T09:00:00Z', 'Opening the issue with the repro steps.'),
      msg(2, 'bob', '2026-09-09T09:30:00Z', 'Looked into it, seems like a config problem.'),
      msg(3, 'alice', '2026-09-09T10:15:00Z', 'Confirmed, fixed in the linked PR.'),
    ]);
    expect(findings).toEqual([]);
  });
});

// The rows below are what `gh api` hands the auditor — untrusted process
// output, so every shape is pinned, not just the happy one.
function ghComment(id: number, login: string, at: string, body: string) {
  return {
    id,
    user: { login },
    created_at: at,
    body,
    html_url: `https://github.com/example/repo/issues/1#issuecomment-${id}`,
  };
}

function ghReview(id: number, login: string, at: string, state: string, body: string) {
  return {
    id,
    user: { login },
    submitted_at: at,
    state,
    body,
    html_url: `https://github.com/example/repo/pull/1#pullrequestreview-${id}`,
  };
}

describe('boardThreads', () => {
  it('names one thread per board row, a PR where gh marked the row a pull request', () => {
    expect(boardThreads([{ number: 3 }, { number: 4, pull_request: { url: 'x' } }])).toEqual([
      { number: 3, isPr: false },
      { number: 4, isPr: true },
    ]);
  });

  it('skips a board row that is not an object instead of killing the whole audit', () => {
    expect(boardThreads([null, { number: 5 }, 7, { number: 6, pull_request: {} }])).toEqual([
      { number: 5, isPr: false },
      { number: 6, isPr: true },
    ]);
  });

  it('reads a board page that is not an array (a `null`) as a board with no threads', () => {
    // A `null` page once threw "Cannot read properties of null (reading
    // 'filter')" before the audit printed a single line — the same crash the
    // null-ROW guard above fixed, one level up.
    expect(boardThreads(null)).toEqual([]);
    expect(boardThreads({ message: 'not an array' })).toEqual([]);
    expect(boardThreads('nope')).toEqual([]);
  });
});

describe('threadTimeline', () => {
  it('flattens comments and reviews into one timeline, oldest first', () => {
    const timeline = threadTimeline(
      [
        ghComment(1, 'alice', '2026-09-09T09:00:00Z', 'first'),
        ghComment(2, 'bob', '2026-09-09T09:20:00Z', 'third'),
      ],
      [ghReview(9, 'carol', '2026-09-09T09:10:00Z', 'APPROVED', 'second')],
    );
    expect(timeline).toEqual([
      {
        kind: 'comment',
        id: 1,
        author: 'alice',
        at: '2026-09-09T09:00:00Z',
        body: 'first',
        url: 'https://github.com/example/repo/issues/1#issuecomment-1',
      },
      {
        kind: 'review:APPROVED',
        id: 9,
        author: 'carol',
        at: '2026-09-09T09:10:00Z',
        body: 'second',
        url: 'https://github.com/example/repo/pull/1#pullrequestreview-9',
      },
      {
        kind: 'comment',
        id: 2,
        author: 'bob',
        at: '2026-09-09T09:20:00Z',
        body: 'third',
        url: 'https://github.com/example/repo/issues/1#issuecomment-2',
      },
    ]);
  });

  it('drops a review with no written body — an empty approval floods nobody', () => {
    const timeline = threadTimeline(
      [],
      [
        ghReview(1, 'alice', '2026-09-09T09:00:00Z', 'APPROVED', '   '),
        { ...ghReview(2, 'alice', '2026-09-09T09:01:00Z', 'APPROVED', ''), body: null },
        ghReview(3, 'alice', '2026-09-09T09:02:00Z', 'COMMENTED', 'a real remark'),
      ],
    );
    expect(timeline.map((m) => m.id)).toEqual([3]);
  });

  it('reads a comment with no user as author "?" and no body as ""', () => {
    const [message] = threadTimeline(
      [{ id: 1, user: null, created_at: '2026-09-09T09:00:00Z', body: null, html_url: 'u' }],
      [],
    );
    expect(message).toMatchObject({ author: '?', body: '' });
  });

  it('reads a review with no user as author "?"', () => {
    const [message] = threadTimeline(
      [],
      [{ ...ghReview(1, 'x', '2026-09-09T09:00:00Z', 'COMMENTED', 'a remark'), user: null }],
    );
    expect(message).toMatchObject({ kind: 'review:COMMENTED', author: '?', body: 'a remark' });
  });

  it('skips a comment or review row that is not an object instead of killing the whole audit', () => {
    const timeline = threadTimeline(
      [null, ghComment(1, 'alice', '2026-09-09T09:00:00Z', 'kept'), 7],
      [null, ghReview(2, 'bob', '2026-09-09T09:05:00Z', 'COMMENTED', 'also kept'), 'x'],
    );
    expect(timeline.map((m) => m.id)).toEqual([1, 2]);
  });

  it('reads a comment or review page that is not an array (a `null`) as an empty page', () => {
    expect(threadTimeline(null, null)).toEqual([]);
    expect(threadTimeline({ message: 'not an array' }, undefined)).toEqual([]);
  });

  it('still audits the reviews when only the comments page is unreadable — a flood there is not hidden', () => {
    const retry = 'Approved: gate green at >= 90% coverage, all checks pass, no conflicts.';
    const timeline = threadTimeline(null, [
      ghReview(1, 'keeper', '2026-09-09T09:00:00Z', 'APPROVED', retry),
      ghReview(2, 'keeper', '2026-09-09T09:00:30Z', 'APPROVED', retry),
    ]);
    expect(timeline.map((m) => m.id)).toEqual([1, 2]);
    expect(auditThread('PR #1', timeline).map((f) => f.kind)).toContain('NEAR-DUPLICATE');
  });

  it('still audits the rows around a null one — a flood beside it is not hidden', () => {
    const retry = 'Approved: gate green at >= 90% coverage, all checks pass, no conflicts.';
    const timeline = threadTimeline(
      [
        ghComment(1, 'keeper', '2026-09-09T09:00:00Z', retry),
        null,
        ghComment(2, 'keeper', '2026-09-09T09:00:30Z', retry),
      ],
      [],
    );
    expect(auditThread('PR #1', timeline).map((f) => f.kind)).toContain('NEAR-DUPLICATE');
  });
});
