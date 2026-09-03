// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for web/backlog-panel.ts's backlogCandidateMeta — the
 * DETECTED BACKLOG panel's per-candidate copy (match chip text/tooltip, plus
 * the confirm button's tooltip). backlog-panel.test.ts drives the real
 * client bundle and only ever asserted substrings of the chip's visible
 * text, never the full data-tip/aria-label sentences this covers directly.
 */

import { describe, it, expect } from 'vitest';
import { backlogCandidateMeta } from '../../src/web/backlog-panel.js';
import { backlogMatchText } from '../../src/shared/backlog-match.js';

const SUBJECT_CAND = {
  taskId: 't1',
  taskTitle: 'add widget parser support',
  commitSha: 'abc1234',
  commitSubject: 'feat(widget): add widget parser support',
  matchedVia: 'subject' as const,
};

const PATH_CAND = {
  taskId: 't2',
  taskTitle: 'otlp endpoint wiring',
  commitSha: 'def5678',
  commitSubject: 'wip(autopilot): checkpoint — firing 12 died mid-unit',
  matchedVia: 'path' as const,
};

describe('backlogCandidateMeta', () => {
  it('gives a subject match a confirm-button tooltip and a "never applied automatically" chip tip', () => {
    const meta = backlogCandidateMeta(SUBJECT_CAND, backlogMatchText);

    expect(meta.matchText).toBe(backlogMatchText(SUBJECT_CAND));
    expect(meta.tip).toBe(
      'Possible match: commit abc1234 "feat(widget): add widget parser support" — never applied automatically, confirm below to mark the task done.',
    );
    expect(meta.confirmTip).toBe(
      'Mark "add widget parser support" done — this commit appears to have shipped it',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): the chip's
    // aria-label states only the essential fact concisely — the full
    // guidance sentence stays in the tip, never duplicated verbatim.
    expect(meta.ariaLabel).toBe('Possible match: commit abc1234');
    expect(meta.ariaLabel).not.toBe(meta.tip);
    expect(meta.titleTip).toBe('Board task t1');
  });

  it('gives a path match a null confirmTip and a "too weak a signal" chip tip', () => {
    const meta = backlogCandidateMeta(PATH_CAND, backlogMatchText);

    expect(meta.matchText).toBe(backlogMatchText(PATH_CAND));
    expect(meta.tip).toBe(
      'Possible match: commit def5678 "wip(autopilot): checkpoint — firing 12 died mid-unit" [matched via changed files, not subject text] — file overlap alone is too weak a signal to confirm from here; check the commit before marking this done on the task board.',
    );
    expect(meta.confirmTip).toBeNull();
    // The weak-signal caveat survives into the concise label — a path match
    // must not announce itself with the same confidence as a subject match.
    expect(meta.ariaLabel).toBe('Possible match (files only): commit def5678');
    expect(meta.ariaLabel).not.toBe(meta.tip);
    expect(meta.titleTip).toBe('Board task t2');
  });
});
