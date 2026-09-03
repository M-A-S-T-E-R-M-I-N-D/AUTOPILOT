// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  auditClosedTaskDeliverable,
  auditClosedTaskUxExpression,
  findClosedTaskAuditFindings,
  type AuditVcs,
} from '../../src/flight/closed-task-audit.js';

/**
 * A fake VCS backed by a haystack string, tracking every lookup it received.
 * Substring/case-insensitive, mirroring real `GitVcs.containsText` (git grep) —
 * NOT exact-match, since e.g. a "tooltip" pattern must hit a "tooltips" haystack.
 * `filesContainingText` reports the SAME haystack as living at a `/web/`
 * path whenever it matches, so a plain keyword-presence test (this file's
 * bulk of coverage) isn't incidentally tripped by the UX-EXPRESSION path
 * check below — that check gets its OWN dedicated fake, `fakeVcsWithFiles`.
 */
function fakeVcs(haystack: string): AuditVcs & { readonly calls: string[] } {
  const calls: string[] = [];
  const lower = haystack.toLowerCase();
  const path = 'apps/dashboard/src/web/generic.ts';
  return {
    calls,
    async containsText(pattern: string): Promise<boolean> {
      calls.push(pattern);
      return lower.includes(pattern.toLowerCase());
    },
    async filesContainingText(pattern: string): Promise<readonly string[]> {
      return lower.includes(pattern.toLowerCase()) ? [path] : [];
    },
  };
}

/**
 * A fake VCS backed by an explicit path→content map, for
 * `auditClosedTaskUxExpression` tests that need to distinguish WHERE a
 * keyword lives (a `/web/` panel vs. a stray backend comment).
 */
function fakeVcsWithFiles(files: Record<string, string>): AuditVcs {
  return {
    async containsText(pattern: string): Promise<boolean> {
      const lower = pattern.toLowerCase();
      return Object.values(files).some((content) => content.toLowerCase().includes(lower));
    },
    async filesContainingText(pattern: string): Promise<readonly string[]> {
      const lower = pattern.toLowerCase();
      return Object.entries(files)
        .filter(([, content]) => content.toLowerCase().includes(lower))
        .map(([path]) => path);
    },
  };
}

describe('auditClosedTaskDeliverable', () => {
  it('passes when a clause keyword still appears in the current tree', async () => {
    const vcs = fakeVcs('a tooltip renders on hover');
    expect(await auditClosedTaskDeliverable('adds a tooltip to the button', vcs)).toBe(true);
  });

  it('flags drift when none of the keywords appear anymore', async () => {
    const vcs = fakeVcs('nothing relevant here');
    expect(await auditClosedTaskDeliverable('adds a tooltip to the button', vcs)).toBe(false);
  });

  it('tolerates a plural clause word matching a singular in the tree', async () => {
    const vcs = fakeVcs('shows one tooltip');
    expect(await auditClosedTaskDeliverable('adds tooltips everywhere', vcs)).toBe(true);
  });

  it('passes a clause with no checkable keywords (all stopwords) without querying the VCS', async () => {
    const vcs = fakeVcs('');
    expect(await auditClosedTaskDeliverable('that this with from', vcs)).toBe(true);
    expect(vcs.calls).toEqual([]);
  });

  it('short-circuits on the first matching keyword instead of checking every one', async () => {
    const vcs = fakeVcs('alpha is here');
    expect(await auditClosedTaskDeliverable('alpha bravo charlie delta', vcs)).toBe(true);
    expect(vcs.calls).toEqual(['alpha']);
  });

  it('does not fall back to a truncated tail for a keyword that does not end in "s"', async () => {
    // "guard" isn't present, but its naive last-char-chopped tail "guar" is (inside
    // "guarantee") — only a keyword actually ending in "s" is allowed that fallback.
    const vcs = fakeVcs('provide a guarantee here');
    expect(await auditClosedTaskDeliverable('will hold guard duty', vcs)).toBe(false);
  });

  it('does not check a plural keyword whose singular falls below the 4-char floor', async () => {
    // "figs" -> singular "fig" (3 chars) is present in the haystack, but the floor
    // must block the fallback before it ever queries the VCS for "fig".
    const vcs = fakeVcs('we sell a big fig basket');
    expect(await auditClosedTaskDeliverable('restock figs today', vcs)).toBe(false);
  });

  it('checks a plural keyword whose singular sits exactly at the 4-char floor', async () => {
    // "carts" -> singular "cart" is exactly 4 chars — the floor is inclusive.
    const vcs = fakeVcs('a small cart nearby');
    expect(await auditClosedTaskDeliverable('arrange carts neatly', vcs)).toBe(true);
  });
});

describe('auditClosedTaskUxExpression', () => {
  it('passes a clause with no UX signal words without querying the VCS', async () => {
    const vcs = fakeVcsWithFiles({});
    expect(await auditClosedTaskUxExpression('reconciles the billing ledger nightly', vcs)).toBe(
      true,
    );
  });

  it('passes when a UX-promising clause keyword still lives in a /web/ file', async () => {
    const vcs = fakeVcsWithFiles({
      'apps/dashboard/src/web/panel.ts': 'renders a chip in the header',
    });
    expect(await auditClosedTaskUxExpression('adds a chip to the header', vcs)).toBe(true);
  });

  it('passes when a UX-promising clause keyword still lives in a docs/*.md file', async () => {
    const vcs = fakeVcsWithFiles({ 'docs/chip-guide.md': 'the chip appears on hover' });
    expect(await auditClosedTaskUxExpression('adds a chip on hover', vcs)).toBe(true);
  });

  it('flags drift when the keyword survives only in a non-UI file (UI ripped out, stray mention left behind)', async () => {
    const vcs = fakeVcsWithFiles({
      'apps/dashboard/src/flight/notes.ts': '// TODO: used to render a chip here',
    });
    expect(await auditClosedTaskUxExpression('adds a chip to the header', vcs)).toBe(false);
  });

  it('flags drift when the keyword is gone from the tree entirely', async () => {
    const vcs = fakeVcsWithFiles({});
    expect(await auditClosedTaskUxExpression('adds a chip to the header', vcs)).toBe(false);
  });

  it('treats a docs/ file that is not markdown as not user-facing', async () => {
    const vcs = fakeVcsWithFiles({ 'docs/notes.txt': 'a chip lives here' });
    expect(await auditClosedTaskUxExpression('adds a chip to the header', vcs)).toBe(false);
  });

  it('treats a markdown file outside docs/ as not user-facing', async () => {
    const vcs = fakeVcsWithFiles({ 'notes/readme.md': 'a chip lives here' });
    expect(await auditClosedTaskUxExpression('adds a chip to the header', vcs)).toBe(false);
  });

  it('passes a UX-promising clause with no checkable keywords without querying the VCS', async () => {
    const vcs = fakeVcsWithFiles({});
    expect(await auditClosedTaskUxExpression('the ui that this', vcs)).toBe(true);
  });
});

describe('findClosedTaskAuditFindings', () => {
  it('flags a done task whose DELIVERABLE clause no longer checks out', async () => {
    const vcs = fakeVcs('nothing relevant here');
    const findings = await findClosedTaskAuditFindings(
      [{ id: 't-1', title: 'add a tooltip DELIVERABLE: renders a tooltip on hover' }],
      vcs,
    );
    expect(findings).toEqual([
      {
        taskId: 't-1',
        title: 'add a tooltip DELIVERABLE: renders a tooltip on hover',
        deliverable: 'renders a tooltip on hover',
        reason: 'deliverable-drift',
      },
    ]);
  });

  it('flags a done task whose UX-promising DELIVERABLE clause lost its UI/Docs expression', async () => {
    const vcs = fakeVcsWithFiles({
      'apps/dashboard/src/flight/notes.ts': 'a chip used to render on the header',
    });
    const findings = await findClosedTaskAuditFindings(
      [{ id: 't-1', title: 'add a header chip DELIVERABLE: renders a chip on the header' }],
      vcs,
    );
    expect(findings).toEqual([
      {
        taskId: 't-1',
        title: 'add a header chip DELIVERABLE: renders a chip on the header',
        deliverable: 'renders a chip on the header',
        reason: 'ux-expression-drift',
      },
    ]);
  });

  it('skips a done task whose DELIVERABLE clause still checks out', async () => {
    const vcs = fakeVcs('a tooltip renders on hover');
    const findings = await findClosedTaskAuditFindings(
      [{ id: 't-1', title: 'add a tooltip DELIVERABLE: renders a tooltip on hover' }],
      vcs,
    );
    expect(findings).toEqual([]);
  });

  it('skips a done task with no DELIVERABLE clause at all, without touching the VCS', async () => {
    const vcs = fakeVcs('');
    const findings = await findClosedTaskAuditFindings([{ id: 't-1', title: 'plain task' }], vcs);
    expect(findings).toEqual([]);
    expect(vcs.calls).toEqual([]);
  });

  it('evaluates multiple candidates independently', async () => {
    const vcs = fakeVcs('only the widget survived');
    const findings = await findClosedTaskAuditFindings(
      [
        { id: 't-widget', title: 'DELIVERABLE: adds a widget' },
        { id: 't-gadget', title: 'DELIVERABLE: adds a gadget' },
      ],
      vcs,
    );
    expect(findings.map((f) => f.taskId)).toEqual(['t-gadget']);
  });
});
