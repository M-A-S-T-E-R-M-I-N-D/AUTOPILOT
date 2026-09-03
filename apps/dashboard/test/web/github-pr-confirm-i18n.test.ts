// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n foundation (board web-msnsndki-dz3vn1): the project detail page's
 * "Contribute upstream" PR form's `window.confirm()` message used to be
 * built by `card-actions.ts`'s English-only `githubPrConfirmMessage`. The
 * submit handler now reads the translated text from `STRINGS.githubPrConfirm`
 * (base sentence, `{name}`/`{title}` placeholders) plus
 * `STRINGS.githubPrConfirmIssueClause` (`{issueNumber}`, appended only when
 * a pool issue number is prefilled) via `tr(key, subs)` — the same
 * `{name}`-template pattern `github-sync-confirm.test.ts` already covers,
 * generalized to a substitution MAP since this confirm needs two
 * independent placeholders in one sentence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function fillAndSubmit(title: string): void {
  const titleEl = document.querySelector('.github-pr-title') as HTMLInputElement;
  titleEl.value = title;
  const form = document.querySelector('[data-github-pr-form="p1"]') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('github-pr-form confirms with the translated message', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('confirms with the base wording (no issue clause) when no pool issue is prefilled', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fillAndSubmit('fix the flaky retry queue');

    expect(confirmSpy).toHaveBeenCalledWith(
      STRINGS.en.githubPrConfirm
        .replace('{name}', 'Alpha')
        .replace('{title}', 'fix the flaky retry queue'),
    );
  });

  it('appends the issue-closing clause when a pool issue number is prefilled', async () => {
    const stateWithIssue = {
      ...STATE,
      projects: [
        { ...PROJECT, tasks: [{ id: 'github-42', source: 'github', status: 'in_progress' }] },
      ],
    };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => stateWithIssue }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fillAndSubmit('fix the flaky retry queue');

    const expected =
      STRINGS.en.githubPrConfirm
        .replace('{name}', 'Alpha')
        .replace('{title}', 'fix the flaky retry queue') +
      STRINGS.en.githubPrConfirmIssueClause.replace('{issueNumber}', '42');
    expect(confirmSpy).toHaveBeenCalledWith(expected);
  });

  it('does not fetch when the operator cancels the confirm dialog', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fillAndSubmit('fix the flaky retry queue');

    expect(fetchMock).not.toHaveBeenCalledWith('/api/github-pr/execute', expect.anything());
  });
});
