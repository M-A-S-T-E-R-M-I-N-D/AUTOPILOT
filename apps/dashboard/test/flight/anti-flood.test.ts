// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The anti-flood guard, locked against the two real incidents that
 * produced it (operator: "האם זה לא מרגיש שיש פה מלא SPAM?!", PR #33):
 *
 *   - PR #33's approval posted twice, 16s apart, the retry differing only
 *     where the Windows shell downgraded `≥` and `don't`. 97% identical.
 *   - Issue #16's three consecutive maintainer messages, two past the
 *     ceiling ATTRIBUTION.md §3 sets.
 *
 * Both fixtures below are the real texts, trimmed. If either shape ever
 * gets through again, these fail first.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withAntiFlood,
  judgeOutgoingComment,
  parseCommentPost,
  normalizeCommentText,
  commentSimilarity,
  foldCommentBody,
  FLOOD_DUPLICATE_RATIO,
  type ThreadMessage,
} from '../../src/flight/anti-flood.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

/** PR #33's first approval, as posted. */
const APPROVAL_ORIGINAL =
  'Two-tier applied by maintainer edit (0614c7cd), exactly per the request you offered to take: ' +
  '≥400 review lines LANDS with a loud WARN check label (telemetry-visible, split advised); only ' +
  'past the 1200-line runaway ceiling does your existing revert path fire. Verdict gains an ' +
  "explicit tier, ok stays the single don't-revert flag, both thresholds injectable. 1183/1183 " +
  'engine tests, typecheck clean. The WARN label is machine-greppable in the meantime.';

/** The retry 16 seconds later — same message, shell-flattened punctuation
 *  and one reworded clause. This is what must never post again. */
const APPROVAL_RETRY =
  'Two-tier applied by maintainer edit (0614c7cd), exactly per the request you offered to take: ' +
  '>=400 review lines LANDS with a loud WARN check label (telemetry-visible, split advised); only ' +
  'past the 1200-line runaway ceiling does your existing revert path fire. Verdict gains an ' +
  'explicit tier, ok stays the single dont-revert flag, both thresholds injectable. 1183/1183 ' +
  'engine tests, typecheck clean. The WARN label is machine-greppable meanwhile.';

const UNRELATED =
  'The windows red on this head is our own a11y axe-core timeout flake on the windows runner, ' +
  'not anything your branch introduced — the import-graph evidence you posted checks out.';

function msg(id: number, author: string, body: string): ThreadMessage {
  return { id, author, body };
}

describe('normalizeCommentText / commentSimilarity — what "the same message" means', () => {
  it('flattens the punctuation a shell mangles, so a retry matches its original', () => {
    expect(normalizeCommentText('≥400 — don’t')).toBe(normalizeCommentText('>=400 - dont'));
  });

  it('scores the real PR #33 retry above the duplicate threshold', () => {
    const ratio = commentSimilarity(
      normalizeCommentText(APPROVAL_ORIGINAL),
      normalizeCommentText(APPROVAL_RETRY),
    );
    expect(ratio).toBeGreaterThanOrEqual(FLOOD_DUPLICATE_RATIO);
  });

  it('scores a genuine follow-up on the same PR well below it', () => {
    const ratio = commentSimilarity(
      normalizeCommentText(APPROVAL_ORIGINAL),
      normalizeCommentText(UNRELATED),
    );
    expect(ratio).toBeLessThan(FLOOD_DUPLICATE_RATIO);
  });
});

describe('judgeOutgoingComment — the whole decision, pure', () => {
  it('suppresses the PR #33 retry as a duplicate of the message already posted', () => {
    const verdict = judgeOutgoingComment(
      [msg(1, 'gabibi555', 'thanks!'), msg(2, 'M-A-S-T-E-R-M-I-N-D', APPROVAL_ORIGINAL)],
      'M-A-S-T-E-R-M-I-N-D',
      APPROVAL_RETRY,
    );
    expect(verdict.action).toBe('suppress');
    if (verdict.action === 'suppress') expect(verdict.duplicateOf).toBe(2);
  });

  it('does not confuse someone else saying the same thing with our own duplicate', () => {
    const verdict = judgeOutgoingComment(
      [msg(1, 'gabibi555', APPROVAL_ORIGINAL)],
      'M-A-S-T-E-R-M-I-N-D',
      APPROVAL_RETRY,
    );
    expect(verdict.action).toBe('pass');
  });

  it('passes a new message when the last word belongs to someone else', () => {
    const verdict = judgeOutgoingComment(
      [
        msg(1, 'M-A-S-T-E-R-M-I-N-D', APPROVAL_ORIGINAL),
        msg(2, 'gabibi555', 'Fixed, take a look.'),
      ],
      'M-A-S-T-E-R-M-I-N-D',
      UNRELATED,
    );
    expect(verdict.action).toBe('pass');
  });

  it('folds the third consecutive message — the issue #16 shape', () => {
    const verdict = judgeOutgoingComment(
      [
        msg(1, 'gabibi555', 'Opening this.'),
        msg(2, 'M-A-S-T-E-R-M-I-N-D', 'First maintainer note about the sweep and its scope.'),
        msg(3, 'M-A-S-T-E-R-M-I-N-D', 'Second maintainer note adding the label rationale.'),
      ],
      'M-A-S-T-E-R-M-I-N-D',
      UNRELATED,
    );
    expect(verdict.action).toBe('fold');
    if (verdict.action === 'fold') {
      expect(verdict.into).toBe(3);
      expect(verdict.consecutive).toBe(2);
    }
  });

  it('lets short acks through without comparing them', () => {
    expect(judgeOutgoingComment([msg(1, 'me', 'thanks!')], 'me', 'thanks!').action).toBe('pass');
  });

  it('passes on an empty thread', () => {
    expect(judgeOutgoingComment([], 'me', UNRELATED).action).toBe('pass');
  });
});

describe('foldCommentBody — the law’s own prescribed form', () => {
  it('keeps the original above a dated Update block', () => {
    const folded = foldCommentBody('Original text.', 'The new finding.', new Date('2026-09-09'));
    expect(folded).toContain('Original text.');
    expect(folded).toContain('**Update (2026-09-09):**');
    expect(folded.indexOf('Original text.')).toBeLessThan(folded.indexOf('**Update'));
  });
});

describe('parseCommentPost — only comment argv is inspected', () => {
  it('parses both gh issue comment and gh pr comment', () => {
    expect(parseCommentPost('gh', ['issue', 'comment', '16', '--body', 'x'])?.target).toBe('16');
    expect(parseCommentPost('gh', ['pr', 'comment', '33', '--body', 'x'])?.body).toBe('x');
  });

  it('ignores labels, reviews, git, and anything else', () => {
    expect(parseCommentPost('gh', ['issue', 'edit', '16', '--add-label', 'epic'])).toBeNull();
    expect(parseCommentPost('gh', ['pr', 'review', '33', '--approve', '--body', 'x'])).toBeNull();
    expect(parseCommentPost('git', ['commit', '-m', 'x'])).toBeNull();
  });
});

/** A fake `gh` that answers the guard's lookups and records every real call. */
function fakeExec(thread: readonly ThreadMessage[], calls: string[][]): CliExec {
  return async (bin, args) => {
    calls.push([bin, ...args]);
    if (bin === 'gh' && args[0] === 'api' && args[1] === 'user') {
      return { code: 0, stdout: JSON.stringify({ login: 'M-A-S-T-E-R-M-I-N-D' }) };
    }
    if (bin === 'gh' && args[0] === 'api' && String(args[1]).includes('/comments')) {
      return {
        code: 0,
        stdout: JSON.stringify(
          thread.map((m) => ({ id: m.id, user: { login: m.author }, body: m.body })),
        ),
      };
    }
    return { code: 0, stdout: '' };
  };
}

describe('withAntiFlood — the wrapper every posting path inherits', () => {
  it('never runs the duplicate post and reports it as a clean no-op', async () => {
    const calls: string[][] = [];
    const notes: string[] = [];
    const exec = withAntiFlood(
      fakeExec([msg(7, 'M-A-S-T-E-R-M-I-N-D', APPROVAL_ORIGINAL)], calls),
      {
        onVerdict: (n) => notes.push(n),
      },
    );

    const run = await exec('gh', ['pr', 'comment', '33', '--body', APPROVAL_RETRY]);

    expect(run.code).toBe(0);
    expect(calls.some((c) => c[1] === 'pr' && c[2] === 'comment')).toBe(false);
    expect(notes[0]).toContain('suppressed');
  });

  it('edits the tail instead of stacking a third consecutive message', async () => {
    const calls: string[][] = [];
    const thread = [
      msg(1, 'gabibi555', 'Opening this.'),
      msg(2, 'M-A-S-T-E-R-M-I-N-D', 'First maintainer note about the sweep and its scope.'),
      msg(3, 'M-A-S-T-E-R-M-I-N-D', 'Second maintainer note adding the label rationale.'),
    ];
    const exec = withAntiFlood(fakeExec(thread, calls), {
      now: () => new Date('2026-09-09T00:00:00Z'),
    });

    await exec('gh', ['issue', 'comment', '16', '--body', UNRELATED]);

    const patch = calls.find((c) => c.includes('PATCH'));
    expect(patch).toBeDefined();
    expect(patch?.join(' ')).toContain('issues/comments/3');
    expect(patch?.join(' ')).toContain('**Update (2026-09-09):**');
    expect(calls.some((c) => c[1] === 'issue' && c[2] === 'comment')).toBe(false);
  });

  it('posts normally when the thread has room for the message', async () => {
    const calls: string[][] = [];
    const exec = withAntiFlood(fakeExec([msg(1, 'gabibi555', 'Fixed, take a look.')], calls));

    await exec('gh', ['issue', 'comment', '16', '--body', UNRELATED]);

    expect(calls.some((c) => c[1] === 'issue' && c[2] === 'comment')).toBe(true);
  });

  it('passes every non-comment call through uninspected', async () => {
    const calls: string[][] = [];
    const exec = withAntiFlood(fakeExec([], calls));

    await exec('gh', ['issue', 'edit', '16', '--add-label', 'epic']);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['gh', 'issue', 'edit', '16', '--add-label', 'epic']);
  });

  it('fails open and still posts when the thread cannot be read', async () => {
    const calls: string[][] = [];
    const broken: CliExec = async (bin, args) => {
      calls.push([bin, ...args]);
      if (args[0] === 'api') return { code: 1, stdout: '' };
      return { code: 0, stdout: '' };
    };
    const exec = withAntiFlood(broken);

    const run = await exec('gh', ['issue', 'comment', '16', '--body', UNRELATED]);

    expect(run.code).toBe(0);
    expect(calls.some((c) => c[1] === 'issue' && c[2] === 'comment')).toBe(true);
  });

  it('still posts when the fold edit itself fails, rather than losing the text', async () => {
    const calls: string[][] = [];
    const thread = [
      msg(2, 'M-A-S-T-E-R-M-I-N-D', 'First maintainer note about the sweep and its scope.'),
      msg(3, 'M-A-S-T-E-R-M-I-N-D', 'Second maintainer note adding the label rationale.'),
    ];
    const base = fakeExec(thread, calls);
    const flaky: CliExec = async (bin, args) => {
      if (args.includes('PATCH')) {
        calls.push([bin, ...args]);
        return { code: 1, stdout: '' };
      }
      return base(bin, args);
    };
    const exec = withAntiFlood(flaky, { now: () => new Date('2026-09-09T00:00:00Z') });

    await exec('gh', ['issue', 'comment', '16', '--body', UNRELATED]);

    expect(calls.some((c) => c[1] === 'issue' && c[2] === 'comment')).toBe(true);
  });

  it('reads the thread once per post, not once per candidate message', async () => {
    const calls: string[][] = [];
    const thread = Array.from({ length: 12 }, (_, i) => msg(i + 1, 'gabibi555', `note ${i}`));
    const exec = withAntiFlood(fakeExec(thread, calls));

    await exec('gh', ['issue', 'comment', '16', '--body', UNRELATED]);

    const reads = calls.filter((c) => String(c[2]).includes('/comments'));
    expect(reads).toHaveLength(1);
  });
});

describe('the guard is wired, not merely written', () => {
  it('is exported from the flight surface the executors import', async () => {
    const mod = await import('../../src/flight/anti-flood.js');
    expect(typeof mod.withAntiFlood).toBe('function');
    expect(vi.isMockFunction(mod.withAntiFlood)).toBe(false);
  });
});
