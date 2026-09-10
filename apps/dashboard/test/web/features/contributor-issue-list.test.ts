// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the visitor-facing CONTRIBUTOR ISSUE LIST panel
 * client (`web/features/contributor-issue-list.ts`) — mirrors
 * `test/web/features/pool-client.test.ts`'s direct-coverage shape.
 * Real-bundle DOM render coverage lives alongside in
 * `test/web/contributor-issue-list-render.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { contributorIssueTierBadge } from '../../../src/web/contributor-issue-list-panel.js';
import { contributorIssueListJs } from '../../../src/web/features/contributor-issue-list.js';

describe('contributorIssueListJs', () => {
  it('embeds contributor-issue-list-panel splice real compiled source via .toString()', () => {
    const out = contributorIssueListJs();
    expect(out).toContain(contributorIssueTierBadge.toString());
  });

  it('declares renderContributorIssueListPanel and loadContributorIssueListPanel', () => {
    const out = contributorIssueListJs();
    expect(out).toContain('function renderContributorIssueListPanel(entries) {');
    expect(out).toContain('function loadContributorIssueListPanel() {');
  });

  it('fetches the contributor issue list on its own timer rather than riding the fleet stream', () => {
    const out = contributorIssueListJs();
    expect(out).toContain(
      "fetch('/api/contributor-issues', { headers: { accept: 'application/json' } })",
    );
    expect(out).toContain('var CONTRIBUTOR_ISSUE_LIST_POLL_MS = 30000;');
    expect(out).toContain(
      'setInterval(loadContributorIssueListPanel, CONTRIBUTOR_ISSUE_LIST_POLL_MS);',
    );
  });

  it('self-initializes by calling loadContributorIssueListPanel() at load, independent of any project', () => {
    const out = contributorIssueListJs();
    expect(
      out
        .trim()
        .endsWith('setInterval(loadContributorIssueListPanel, CONTRIBUTOR_ISSUE_LIST_POLL_MS);'),
    ).toBe(true);
    expect(out).toContain(
      'loadContributorIssueListPanel();\nsetInterval(loadContributorIssueListPanel, CONTRIBUTOR_ISSUE_LIST_POLL_MS);',
    );
  });

  it('carries no claim action — read-only, unlike the Pool panel', () => {
    const out = contributorIssueListJs();
    expect(out).not.toContain("fetch('/api/contributor-issues/execute'");
    expect(out).not.toContain('window.confirm');
  });

  it('reuses the shared el/tipChip helpers rather than re-declaring them', () => {
    const out = contributorIssueListJs();
    expect(out).toContain("el('h3', 'contributor-issue-list-title'");
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = contributorIssueListJs();
    expect(out).toBe(out.trim());
  });
});
