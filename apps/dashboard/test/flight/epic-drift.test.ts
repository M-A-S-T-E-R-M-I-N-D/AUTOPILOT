// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHEN A TRACKING ISSUE STOPS TELLING THE TRUTH (operator, 2026-09-15).
 * The case that prompted this is the fixture: issue #49 listed eight slices
 * and called the Keeper queue "next"; epic 0021's doc listed eleven, that
 * queue among the shipped. Nothing compared them, because the mirror pass
 * reconciles issues against BOARD TASKS and an epic issue is not one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  epicDocPathFromIssueBody,
  tallySlices,
  findEpicDrift,
} from '../../src/flight/epic-drift.js';

// The shape issue #49 really had, trimmed to the table.
const STALE_ISSUE = `Tracking issue for **epic 0021** (\`docs/epics/0021-app-shell.md\`).

| # | Slice | State |
|---|-------|-------|
| 1 | Foundation | shipped (v0.36.0) |
| 2 | Subject shell | shipped (v0.36.0) |
| 3 | Plan canvas | first cut shipped (v0.38.0); editing, auto-layout, autosave remain |
| 4 | Keeper as an inbox | first cut shipped; the unified queue is next |
| 5 | Project-page subjects | shipped (v0.38.0) |
`;

const CURRENT_DOC = `| # | Slice | State |
|---|-------|-------|
| 1 | Foundation | shipped |
| 2 | Subject shell | shipped |
| 3 | Plan canvas | **second cut shipped** — Remaining: drag-to-reorder, tap-tap connect |
| 4 | Keeper as an inbox | **shipped** — the queue, settled history |
| 5 | Project-page subjects | **shipped** |
| 6 | Context rail | **shipped** |
| 7 | Command palette | **shipped** |
`;

describe('epicDocPathFromIssueBody', () => {
  it('finds the doc an epic issue names', () => {
    expect(epicDocPathFromIssueBody(STALE_ISSUE)).toBe('docs/epics/0021-app-shell.md');
  });

  it('answers null when the body names none', () => {
    for (const body of ['', 'no doc here', 'see docs/README.md']) {
      expect(epicDocPathFromIssueBody(body)).toBeNull();
    }
  });
});

describe('tallySlices', () => {
  it('counts rows without counting the header or its separator', () => {
    expect(tallySlices(STALE_ISSUE).total).toBe(5);
    expect(tallySlices(CURRENT_DOC).total).toBe(7);
  });

  it('refuses to call a slice shipped when its own cell says something remains', () => {
    // Epic 0021's slice 3 reads "second cut shipped … Remaining:
    // drag-to-reorder". Counting that as done is exactly the flattery this
    // comparison exists to prevent.
    expect(tallySlices(CURRENT_DOC).shipped).toBe(6);
    // "open"/"next" are NOT disqualifiers: epic 0021's slice 4 names an exit
    // action called Open, and its slice 3 says undo/redo "shipped next".
    // Prose in a State cell is not a state.
    expect(tallySlices('| 4 | x | **shipped** — one exit action · Open |').shipped).toBe(1);
    expect(tallySlices(`| 3 | x | **second cut shipped** — Remaining: a thing |`).shipped).toBe(0);
    expect(tallySlices(`| 1 | x | Shipped 2026-09-14 |`).shipped).toBe(1);
    expect(tallySlices(`| 2 | x | Open |`).shipped).toBe(0);
  });

  it('counts nothing in prose that merely mentions shipping', () => {
    expect(tallySlices('We shipped a lot this week.')).toEqual({ total: 0, shipped: 0 });
  });
});

describe('findEpicDrift', () => {
  it('catches the real case: the doc is ahead of the issue', () => {
    const drift = findEpicDrift(49, STALE_ISSUE, 'docs/epics/0021-app-shell.md', CURRENT_DOC);
    expect(drift).not.toBeNull();
    expect(drift?.summary).toContain('#49');
    expect(drift?.summary).toContain('7 slices against the issue’s 5'.replace('’', "'"));
    expect(drift?.docTally.shipped).toBeGreaterThan(drift!.issueTally.shipped);
  });

  it('says nothing when the two agree', () => {
    expect(findEpicDrift(1, CURRENT_DOC, 'docs/epics/0021-app-shell.md', CURRENT_DOC)).toBeNull();
  });

  it('says nothing when the ISSUE is ahead — that is how epics start, not drift', () => {
    // An issue written before the doc catches up is normal. Reporting it
    // would make this noisy in exactly the case where nothing is wrong.
    expect(findEpicDrift(1, CURRENT_DOC, 'docs/epics/x.md', STALE_ISSUE)).toBeNull();
  });

  it('says nothing when either side has no slice table at all', () => {
    expect(findEpicDrift(1, 'prose only', 'docs/epics/x.md', CURRENT_DOC)).toBeNull();
    expect(findEpicDrift(1, STALE_ISSUE, 'docs/epics/x.md', 'prose only')).toBeNull();
  });
});

describe('against this repository’s own epic docs', () => {
  it('parses a real slice table, so the shapes stay in step', () => {
    const doc = readFileSync('docs/epics/0021-app-shell.md', 'utf8');
    const tally = tallySlices(doc);
    expect(tally.total).toBe(11);
    // Eight, not ten: slice 3 names remainders, and slices 1-2 are phrased
    // "in this epic's first landing" rather than "shipped". Under-counting
    // is the safe direction — findEpicDrift compares two tables with this
    // same parser, so an unknown wording costs a finding, never invents one.
    expect(tally.shipped).toBe(8);
  });
});
