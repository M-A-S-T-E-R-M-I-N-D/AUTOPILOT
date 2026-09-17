// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for `narratorTarget`/`narratorKind`/`basename` —
 * previously only exercised indirectly via `narratorLine`/`narratorPhrase`
 * (narrator-overflow and narrator-parity tests assert on the composed
 * sentence) and, for `basename`, via `read/fleet.test.ts` and
 * `web/file-nodes-parity.test.ts`, which both pass it into
 * `activityFileNodes` as a callback and assert on the resulting node names
 * rather than calling `basename()` directly and asserting its own return
 * value or branch behavior in isolation.
 */

import { describe, it, expect } from 'vitest';
import {
  narratorTarget,
  narratorKind,
  basename,
  narratorPhrase,
  narratorLine,
  NARRATOR_TARGET_CAP,
} from '../../src/shared/narrator.js';
import type { NarratorActivity } from '../../src/shared/narrator.js';

function activity(overrides: Partial<NarratorActivity>): NarratorActivity {
  return { tool: 'Bash', target: '', kind: 'command', phase: 'do', ...overrides };
}

describe('narratorTarget', () => {
  it('returns a target at exactly the cap unchanged', () => {
    const target = 'x'.repeat(NARRATOR_TARGET_CAP);
    expect(narratorTarget(target)).toBe(target);
  });

  it('returns a short target unchanged', () => {
    expect(narratorTarget('src/a.ts')).toBe('src/a.ts');
  });

  it('truncates a target one character past the cap with an ellipsis', () => {
    const target = 'x'.repeat(NARRATOR_TARGET_CAP + 1);
    const result = narratorTarget(target);
    expect(result).toBe(`${'x'.repeat(NARRATOR_TARGET_CAP - 1)}…`);
    expect(result.length).toBe(NARRATOR_TARGET_CAP);
  });

  it('truncates a much longer target to the cap length', () => {
    const result = narratorTarget('x'.repeat(200));
    expect(result.length).toBe(NARRATOR_TARGET_CAP);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('narratorKind', () => {
  it.each(['Write', 'Edit', 'NotebookEdit'])('classifies a file activity by %s as edit', (tool) => {
    expect(narratorKind(activity({ kind: 'file', tool }))).toBe('edit');
  });

  it.each(['Read', 'Grep', 'Glob'])('classifies a file activity by %s as read', (tool) => {
    expect(narratorKind(activity({ kind: 'file', tool }))).toBe('read');
  });

  it('classifies a search activity as search', () => {
    expect(narratorKind(activity({ kind: 'search', tool: 'Grep' }))).toBe('search');
  });

  it('classifies a command activity in the gate phase as gate', () => {
    expect(narratorKind(activity({ kind: 'command', phase: 'gate' }))).toBe('gate');
  });

  it('classifies a command activity in the commit phase as commit', () => {
    expect(narratorKind(activity({ kind: 'command', phase: 'commit' }))).toBe('commit');
  });

  it('classifies a command activity in the orient phase as orient', () => {
    expect(narratorKind(activity({ kind: 'command', phase: 'orient' }))).toBe('orient');
  });

  it('classifies a command activity in an unrecognized phase as command', () => {
    expect(narratorKind(activity({ kind: 'command', phase: 'do' }))).toBe('command');
  });

  it('classifies an unrecognized kind as other', () => {
    expect(narratorKind(activity({ kind: 'mystery' }))).toBe('other');
  });
});

describe('basename', () => {
  it('returns the segment after the last forward slash', () => {
    expect(basename('deep/nested/module.ts')).toBe('module.ts');
  });

  it('returns the segment after the last backslash', () => {
    expect(basename('winstyle\\path\\file.tsx')).toBe('file.tsx');
  });

  it('resolves mixed forward and back slashes to the final segment', () => {
    expect(basename('a\\b/c.ts')).toBe('c.ts');
  });

  it('returns the raw string unchanged when there is no separator', () => {
    expect(basename('toplevel.md')).toBe('toplevel.md');
  });

  it('falls back to the raw string on a trailing slash', () => {
    expect(basename('a/b/')).toBe('a/b/');
  });

  it('returns the segment after a single leading slash', () => {
    expect(basename('/file.ts')).toBe('file.ts');
  });

  it('returns the empty string unchanged', () => {
    expect(basename('')).toBe('');
  });
});

// The board-task loop summariser and the compose-time line cap were both
// unexercised: nothing passed a command whose target holds several board-task
// ids, and nothing composed a sentence long enough to overflow. Each exists to
// stop a specific ugliness on the worker card, and each could have been deleted
// with the suite staying green.
describe('narratorPhrase — the board-task loop', () => {
  it('counts the ids instead of quoting the command soup', () => {
    const target = 'for id in web-abc123-xy1 web-def456-zz2 web-ghi789-qq3; do ap task $id; done';
    expect(narratorPhrase(activity({ tool: 'Bash', target }))).toBe('Updating 3 tasks');
  });

  it('quotes the command normally when only ONE id appears', () => {
    // One id is not a loop, so the summary would lose information rather than
    // save it — the boundary is > 1, not >= 1.
    const target = 'ap task web-abc123-xy1';
    expect(narratorPhrase(activity({ tool: 'Bash', target }))).toBe(
      'Running: ap task web-abc123-xy1',
    );
  });

  it('needs a real board-task shape, not merely the web- prefix', () => {
    const target = 'grep web-  web- something';
    expect(narratorPhrase(activity({ tool: 'Bash', target }))).not.toContain('tasks');
  });

  it('reads run-together ids as ONE token, not two', () => {
    // The id segments are greedy on purpose. With a non-greedy final segment
    // this single run-together token would split into two "ids" and the card
    // would claim a 2-task loop that never happened. Measured: the two
    // patterns give 1 match and 2 matches for exactly this input.
    const target = 'web-abc-1web-def-2';
    expect(narratorPhrase(activity({ tool: 'Bash', target }))).toBe('Running: web-abc-1web-def-2');
  });
});

describe('narratorLine — the compose-time cap', () => {
  const CAP = 90;

  it('leaves a sentence of exactly the cap untouched — the boundary is >, not >=', () => {
    // 'Using ' (6) + tool (19) + ' on ' (4) + target (60) + '.' (1) = 90.
    // At exactly the cap the sentence must survive whole: truncating here
    // would cost a character to say nothing, and it is the one input where
    // `>` and `>=` differ at all.
    const line = narratorLine([
      activity({ tool: 'T'.repeat(19), target: 'y'.repeat(60), kind: 'other' }),
    ]);
    expect(line).toHaveLength(CAP);
    expect(line.endsWith('.')).toBe(true);
    expect(line).not.toContain('…');
  });

  it('truncates an over-long sentence to the cap with an ellipsis', () => {
    const line = narratorLine([
      activity({ tool: 'T'.repeat(80), target: 'y'.repeat(80), kind: 'other' }),
    ]);
    expect(line).toHaveLength(CAP);
    expect(line.endsWith('…')).toBe(true);
  });
});
