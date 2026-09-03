// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  findDueVerifyByNotes,
  findStaleVerifyByProposalIds,
  verifyByIdPrefix,
  verifyByTaskId,
} from '../../src/flight/verify-by.js';

describe('findDueVerifyByNotes', () => {
  it('flags a section whose verify-by date is exactly today as due (0 days overdue)', () => {
    const today = Date.parse('2026-09-01T00:00:00Z');
    const md = '## Anthropic models & routing (2026-08-07, verify by 2026-09-01)\n\nbody text';
    const due = findDueVerifyByNotes(md, today);
    expect(due).toEqual([
      { title: 'Anthropic models & routing', verifyByDate: '2026-09-01', daysOverdue: 0 },
    ]);
  });

  it('computes days overdue for a past verify-by date', () => {
    const today = Date.parse('2026-09-13T00:00:00Z');
    const md = '## Anthropic models & routing (2026-08-07, verify by 2026-09-01)';
    const due = findDueVerifyByNotes(md, today);
    expect(due[0]?.daysOverdue).toBe(12);
  });

  it('does not flag a section whose verify-by date is still in the future', () => {
    const today = Date.parse('2026-08-11T00:00:00Z');
    const md = '## Anthropic models & routing (2026-08-07, verify by 2026-09-01)';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('skips a heading with a trailing condition but no fixed date ("verify per its Appendix 4 half-lives")', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md =
      '## SOTA MAP — the consolidated context pack (2026-08-08, verify per its Appendix 4 half-lives)';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('extracts just the date from a verify-by note with a trailing OR condition', () => {
    const today = Date.parse('2026-11-01T00:00:00Z');
    const md =
      '## WCAG 2.2 AAA audit (2026-08-08, verify by 2026-11-01 or on any theme/token change)';
    const due = findDueVerifyByNotes(md, today);
    expect(due).toEqual([
      { title: 'WCAG 2.2 AAA audit', verifyByDate: '2026-11-01', daysOverdue: 0 },
    ]);
  });

  it('skips a heading with no parenthetical at all', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '## Plain heading with no notes';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('ignores non-heading inline mentions of "verify by" (not a "## " line)', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = 'Wikipedia index). Verify by: stable — books/sites are canonical.';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('returns multiple due sections sorted most-overdue first', () => {
    const today = Date.parse('2026-12-01T00:00:00Z');
    const md = [
      '## Deploy playbook (2026-08-08, verify by 2026-11-01 or when packaging starts)',
      '## Anthropic models & routing (2026-08-07, verify by 2026-09-01)',
    ].join('\n\n');
    const due = findDueVerifyByNotes(md, today);
    expect(due.map((d) => d.title)).toEqual(['Anthropic models & routing', 'Deploy playbook']);
    expect(due[0]?.daysOverdue).toBeGreaterThan(due[1]?.daysOverdue ?? -1);
  });

  it('skips a malformed verify-by date instead of throwing', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '## Bad date section (2026-08-07, verify by 2026-13-99)';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('returns an empty array for a document with no headings', () => {
    expect(findDueVerifyByNotes('just some prose, no headings at all', Date.now())).toEqual([]);
  });

  it('is a day boundary, not a calendar-day-of-week check (23:59 the day before is still not due)', () => {
    const almostThere = Date.parse('2026-08-31T23:59:00Z');
    const md = '## Anthropic models & routing (2026-08-07, verify by 2026-09-01)';
    expect(findDueVerifyByNotes(md, almostThere)).toEqual([]);
  });

  it('skips a heading with nothing but whitespace between "##" and its parenthetical', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '##  (verify by 2020-01-01)';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('still matches a title after two spaces following "##"', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '##  Title (verify by 2020-01-01)';
    const due = findDueVerifyByNotes(md, today);
    expect(due).toEqual([{ title: 'Title', verifyByDate: '2020-01-01', daysOverdue: 3653 }]);
  });

  it('ignores a "##" that appears mid-line rather than at the start of a line', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = 'See notes ## Fake heading (verify by 2020-01-01)';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('ignores a heading with trailing text after the parenthetical', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '## Title (verify by 2020-01-01) trailing text';
    expect(findDueVerifyByNotes(md, today)).toEqual([]);
  });

  it('matches a heading with no space between the title and its parenthetical', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '## Title(verify by 2020-01-01)';
    const due = findDueVerifyByNotes(md, today);
    expect(due).toEqual([{ title: 'Title', verifyByDate: '2020-01-01', daysOverdue: 3653 }]);
  });

  it('still matches a heading with trailing whitespace after the parenthetical', () => {
    const today = Date.parse('2030-01-01T00:00:00Z');
    const md = '## Title (verify by 2020-01-01)  ';
    const due = findDueVerifyByNotes(md, today);
    expect(due).toEqual([{ title: 'Title', verifyByDate: '2020-01-01', daysOverdue: 3653 }]);
  });
});

describe('verifyByIdPrefix', () => {
  it('slugifies the title into a stable, doc-freshness-style prefix', () => {
    expect(verifyByIdPrefix('Anthropic models & routing')).toBe(
      'verifyby-anthropic-models-routing-',
    );
  });

  it('produces the same prefix for the same title every call', () => {
    expect(verifyByIdPrefix('WCAG 2.2 AAA audit')).toBe(verifyByIdPrefix('WCAG 2.2 AAA audit'));
  });
});

describe('verifyByTaskId', () => {
  it('folds the note title and its own verify-by date into the id, not a run timestamp', () => {
    const note = {
      title: 'Anthropic models & routing',
      verifyByDate: '2026-09-01',
      daysOverdue: 3,
    };
    expect(verifyByTaskId(note)).toBe('verifyby-anthropic-models-routing-2026-09-01');
  });

  it('re-derives the identical id across repeated sweeps of the same unedited note', () => {
    const note = { title: 'Deploy playbook', verifyByDate: '2026-11-01', daysOverdue: 0 };
    expect(verifyByTaskId(note)).toBe(verifyByTaskId({ ...note, daysOverdue: 12 }));
  });

  it('mints a different id once the entry is edited to a new verify-by date', () => {
    const before = verifyByTaskId({
      title: 'Deploy playbook',
      verifyByDate: '2026-11-01',
      daysOverdue: 0,
    });
    const after = verifyByTaskId({
      title: 'Deploy playbook',
      verifyByDate: '2027-02-01',
      daysOverdue: 0,
    });
    expect(before).not.toBe(after);
  });

  it('starts with verifyByIdPrefix(note.title), so the fly.ts dedup LIKE query matches it', () => {
    const note = { title: 'WCAG 2.2 AAA audit', verifyByDate: '2026-11-01', daysOverdue: 0 };
    expect(verifyByTaskId(note).startsWith(verifyByIdPrefix(note.title))).toBe(true);
  });
});

describe('findStaleVerifyByProposalIds', () => {
  const note = { title: 'Deploy playbook', verifyByDate: '2026-11-01', daysOverdue: 0 };
  const currentId = verifyByTaskId(note);

  it('keeps an open proposal whose id matches a currently-due note', () => {
    expect(findStaleVerifyByProposalIds([currentId], [note])).toEqual([]);
  });

  it('flags an open proposal as stale once its note is edited to a new verify-by date', () => {
    const staleId = verifyByTaskId({ ...note, verifyByDate: '2026-09-01' });
    const updatedNote = { ...note, verifyByDate: '2027-02-01' };
    expect(findStaleVerifyByProposalIds([staleId], [updatedNote])).toEqual([staleId]);
  });

  it('flags an open proposal as stale once its note is no longer due at all', () => {
    expect(findStaleVerifyByProposalIds([currentId], [])).toEqual([currentId]);
  });

  it('returns an empty array when there are no open proposals', () => {
    expect(findStaleVerifyByProposalIds([], [note])).toEqual([]);
  });

  it('only flags the stale ids, keeping current ones from a mixed batch', () => {
    const staleId = verifyByTaskId({
      title: 'Old section',
      verifyByDate: '2026-01-01',
      daysOverdue: 0,
    });
    expect(findStaleVerifyByProposalIds([currentId, staleId], [note])).toEqual([staleId]);
  });
});
