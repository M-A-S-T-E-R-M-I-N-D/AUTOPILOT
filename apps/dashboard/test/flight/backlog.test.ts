// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseBacklogTitles } from '../../src/flight/backlog.js';

describe('parseBacklogTitles', () => {
  it('extracts the bullet text from open, in-phase, and done items', () => {
    const doc = [
      '# AUTOPILOT — Backlog',
      '',
      '## A. Engine & autonomy',
      '- [ ] Cross-platform TypeScript port of the v2.4 loop',
      '- [~] Retro self-improvement loop + append-only learnings, curated',
      '- [x] Model resilience: fallback chain, promote-on-exhaustion, time-based re-probe',
    ].join('\n');
    expect(parseBacklogTitles(doc)).toEqual([
      'Cross-platform TypeScript port of the v2.4 loop',
      'Retro self-improvement loop + append-only learnings, curated',
      'Model resilience: fallback chain, promote-on-exhaustion, time-based re-probe',
    ]);
  });

  it('ignores headings, blank lines, and prose that is not a checkbox item', () => {
    const doc = [
      '## H. The long tail',
      '',
      'Some free-standing prose that is not a bullet.',
      '- [ ] Token/usage awareness surfaced in the UI',
    ].join('\n');
    expect(parseBacklogTitles(doc)).toEqual(['Token/usage awareness surfaced in the UI']);
  });

  it('does not append wrapped continuation lines onto the checkbox item', () => {
    const doc = [
      '- [ ] **B2+K3** Prompt prefix reorder for cache: stable blocks FIRST,',
      '  volatile (firing number, lastFailure, board) LAST — next prompt version',
    ].join('\n');
    expect(parseBacklogTitles(doc)).toEqual([
      '**B2+K3** Prompt prefix reorder for cache: stable blocks FIRST,',
    ]);
  });

  it('returns an empty list for an empty or bullet-less document', () => {
    expect(parseBacklogTitles('')).toEqual([]);
    expect(parseBacklogTitles('# Just a heading\n\nAnd a paragraph.')).toEqual([]);
  });

  it('trims trailing whitespace off the captured title', () => {
    expect(parseBacklogTitles('- [ ] Trailing spaces after this   ')).toEqual([
      'Trailing spaces after this',
    ]);
  });

  it('requires the checkbox marker to start the line, not just appear in it', () => {
    const doc = 'Quoted from elsewhere: - [ ] Not actually a bullet here';
    expect(parseBacklogTitles(doc)).toEqual([]);
  });
});
