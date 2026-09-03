// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure card/detail-page action-button tip text
 * math (`web/card-actions.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `card-remove-tooltip.test.ts` and
 * `start-over-tooltip.test.ts` already regression-test this logic indirectly
 * through the rendered DOM in `clientJs()`, but only ever with one project
 * name each — these tests exercise the real functions directly.
 */

import { describe, it, expect } from 'vitest';
import {
  cardRemoveTip,
  cardRemoveAriaLabel,
  startOverTip,
  githubSyncTip,
  githubSyncConfirmMessage,
  githubSyncExecuteResult,
  githubPrLabel,
  githubPrConfirmMessage,
  githubPrExecuteResult,
  poolDeliveryIssueNumber,
} from '../../src/web/card-actions.js';

describe('cardRemoveTip', () => {
  it('names the project being removed', () => {
    expect(cardRemoveTip('Alpha')).toBe('Remove Alpha from the dashboard');
  });
});

describe('cardRemoveAriaLabel', () => {
  it('names the action and target concisely, without the tip full sentence', () => {
    expect(cardRemoveAriaLabel('Alpha')).toBe('Remove Alpha');
    expect(cardRemoveAriaLabel('Alpha')).not.toBe(cardRemoveTip('Alpha'));
  });
});

describe('startOverTip', () => {
  it('names the project whose counters would reset', () => {
    expect(startOverTip('Alpha')).toBe("Reset Alpha's firings + ship-rate counters to 0/0");
  });
});

describe('githubSyncTip', () => {
  it('names the project being synced', () => {
    expect(githubSyncTip('Alpha')).toBe(
      'Sync Alpha to GitHub — creates a private repo, or pushes if one exists',
    );
  });
});

describe('githubSyncConfirmMessage', () => {
  it('warns about private-repo sync by default', () => {
    const msg = githubSyncConfirmMessage('Alpha', 'private');
    expect(msg).toContain('Sync Alpha to GitHub?');
    expect(msg).toContain('private GitHub repo');
    expect(msg).not.toContain('PUBLIC');
  });

  it('warns more severely about public visibility', () => {
    const msg = githubSyncConfirmMessage('Alpha', 'public');
    expect(msg).toContain('Make Alpha PUBLIC on GitHub?');
    expect(msg).toContain('Anyone on the internet will be able to see this code');
  });
});

describe('githubSyncExecuteResult', () => {
  it('formats a successful sync using the server-provided details', () => {
    expect(githubSyncExecuteResult({ ok: true, details: 'pushed to origin.' })).toEqual({
      className: 'github-sync-result github-sync-result-ok',
      text: '✓ pushed to origin.',
    });
  });

  it('falls back to a generic success message when details are missing', () => {
    expect(githubSyncExecuteResult({ ok: true })).toEqual({
      className: 'github-sync-result github-sync-result-ok',
      text: '✓ synced.',
    });
  });

  it('formats a failure using the server-provided error', () => {
    expect(githubSyncExecuteResult({ ok: false, error: 'gh not authenticated' })).toEqual({
      className: 'github-sync-result github-sync-result-fail',
      text: '✗ gh not authenticated',
    });
  });

  it('falls back to a generic failure message when no details/error are given', () => {
    expect(githubSyncExecuteResult(null)).toEqual({
      className: 'github-sync-result github-sync-result-fail',
      text: '✗ sync failed.',
    });
  });
});

describe('githubPrLabel', () => {
  it('names the project whose branch would be contributed', () => {
    expect(githubPrLabel('Alpha')).toBe(
      "Contribute Alpha's current branch upstream as a pull request",
    );
  });
});

describe('githubPrConfirmMessage', () => {
  it('names the project, the title, and warns this runs a real gh pr create', () => {
    const msg = githubPrConfirmMessage('Alpha', 'fix the flaky retry queue');
    expect(msg).toContain('fix the flaky retry queue');
    expect(msg).toContain("from Alpha's current branch");
    expect(msg).toContain('gh pr create');
    expect(msg).toContain('cannot be undone');
    expect(msg).not.toContain('close issue');
  });

  it('names the issue it will close when a pool issue number is given', () => {
    const msg = githubPrConfirmMessage('Alpha', 'fix the flaky retry queue', 42);
    expect(msg).toContain('close issue #42 on merge');
  });
});

describe('poolDeliveryIssueNumber', () => {
  it('returns undefined for an empty task list', () => {
    expect(poolDeliveryIssueNumber([])).toBeUndefined();
  });

  it('extracts the issue number from a single github-sourced task', () => {
    const tasks = [{ id: 'github-42', source: 'github', status: 'in_progress' }];
    expect(poolDeliveryIssueNumber(tasks)).toBe(42);
  });

  it('ignores tasks from other sources', () => {
    const tasks = [
      { id: 'github-42', source: 'dashboard', status: 'in_progress' },
      { id: 'sometask', source: 'self', status: 'queued' },
    ];
    expect(poolDeliveryIssueNumber(tasks)).toBeUndefined();
  });

  it('excludes a deferred github task — no PR should close it', () => {
    const tasks = [{ id: 'github-42', source: 'github', status: 'deferred' }];
    expect(poolDeliveryIssueNumber(tasks)).toBeUndefined();
  });

  it('returns undefined when more than one candidate exists — guessing wrong is worse than no prefill', () => {
    const tasks = [
      { id: 'github-42', source: 'github', status: 'in_progress' },
      { id: 'github-7', source: 'github', status: 'queued' },
    ];
    expect(poolDeliveryIssueNumber(tasks)).toBeUndefined();
  });

  it('picks the one non-deferred candidate among a mix of statuses and sources', () => {
    const tasks = [
      { id: 'github-42', source: 'github', status: 'in_progress' },
      { id: 'github-7', source: 'github', status: 'deferred' },
      { id: 'local-1', source: 'dashboard', status: 'queued' },
    ];
    expect(poolDeliveryIssueNumber(tasks)).toBe(42);
  });
});

describe('githubPrExecuteResult', () => {
  it('formats a successful PR open using the server-provided details and URL', () => {
    expect(
      githubPrExecuteResult({
        ok: true,
        details: 'forking mastermind/autopilot, pushing "fix-branch"',
        url: 'https://github.com/mastermind/autopilot/pull/1',
      }),
    ).toEqual({
      className: 'github-pr-result github-pr-result-ok',
      text: '✓ forking mastermind/autopilot, pushing "fix-branch" https://github.com/mastermind/autopilot/pull/1',
    });
  });

  it('falls back to a generic success message when details are missing', () => {
    expect(githubPrExecuteResult({ ok: true })).toEqual({
      className: 'github-pr-result github-pr-result-ok',
      text: '✓ pull request opened.',
    });
  });

  it('formats a failure using the server-provided error', () => {
    expect(githubPrExecuteResult({ ok: false, error: 'gh not authenticated' })).toEqual({
      className: 'github-pr-result github-pr-result-fail',
      text: '✗ gh not authenticated',
    });
  });

  it('falls back to a generic failure message when no details/error are given', () => {
    expect(githubPrExecuteResult(null)).toEqual({
      className: 'github-pr-result github-pr-result-fail',
      text: '✗ failed to open pull request.',
    });
  });
});
