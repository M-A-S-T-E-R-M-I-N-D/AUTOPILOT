// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { buildInboxDigest } from '../src/inbox.js';

describe('buildInboxDigest', () => {
  it('renders each dropped file under its own heading', () => {
    const digest = buildInboxDigest([
      { name: 'ship-faster.md', content: 'Please prioritize the deploy playbook.' },
      { name: 'note.txt', content: 'Heads up: staging is flaky today.' },
    ]);
    expect(digest).toBe(
      [
        "## INBOX — the operator's notes (optional input, never a dependency)",
        'Dropped into `INBOX/` for you to read. Use them for context if relevant to this',
        "firing's pick; they are not a task queue and completing one is not required.",
        '',
        '### ship-faster.md',
        'Please prioritize the deploy playbook.',
        '',
        '### note.txt',
        'Heads up: staging is flaky today.',
      ].join('\n'),
    );
  });

  it('returns an empty string when the inbox is empty', () => {
    expect(buildInboxDigest([])).toBe('');
  });

  it('caps the number of entries rather than dumping everything', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ name: `n${i}.md`, content: `c${i}` }));
    const digest = buildInboxDigest(entries);
    expect(digest).toContain('### n0.md');
    expect(digest).toContain('### n9.md');
    expect(digest).not.toContain('### n10.md');
  });

  it('bounds a single huge entry rather than dumping it verbatim', () => {
    const huge = 'x'.repeat(5000);
    const digest = buildInboxDigest([{ name: 'huge.md', content: huge }]);
    expect(digest.length).toBeLessThan(huge.length);
  });

  it('trims surrounding whitespace from entry content', () => {
    const digest = buildInboxDigest([{ name: 'a.md', content: '\n\n  hello  \n\n' }]);
    expect(digest).toContain('### a.md\nhello');
  });
});
