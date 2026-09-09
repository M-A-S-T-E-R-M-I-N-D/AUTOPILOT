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
  DUPLICATE_RATIO,
  RAPID_FIRE_MS,
  CONSECUTIVE_CEILING,
  MIN_COMPARE_LENGTH,
  SNIPPET_LENGTH,
} from '../../../../scripts/ci/audit-board-flood.mjs';

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
});

describe('similarity', () => {
  it('scores two disjoint word sets at zero', () => {
    expect(similarity('alpha beta', 'gamma delta')).toBe(0);
  });

  it('scores identical text at one', () => {
    expect(similarity('same words here', 'same words here')).toBe(1);
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
