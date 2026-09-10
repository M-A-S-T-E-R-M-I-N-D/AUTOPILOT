// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER ISSUE-TRIAGE PANEL'S POSTED-COMMENT LINK (epic 0020 "the
 * legible surface", slice 3, board web-mtt8loci-8hnte4: "decisions link to
 * the comment they will post"). `gh issue comment` prints the new comment's
 * own URL to stdout on success — `flight/issue-triage.ts`'s
 * `IssueTriageCommandResult.stdout` already carried it all the way to `POST
 * /api/issue-triage/execute`'s JSON response, and it reached this far only
 * to be discarded, the same "fetched and thrown away" bug slice 1/3's
 * issue-number link and label chips already fixed for this panel. Executes
 * the ACTUAL client bundle (`clientJs()`), the same real-bundle convention
 * `issue-triage-link.test.ts`/`issue-triage-labels.test.ts` use.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const PLAN = {
  issue: { number: 7, title: 'Keyboard nav is broken in the fleet table' },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

const COMMENT_URL = 'https://github.com/example/repo/issues/7#issuecomment-999';

function bootAndExecute(executeResponse: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage/execute')) {
      return { ok: true, status: 200, json: async () => executeResponse } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage: [PLAN] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  new Function(clientJs())();
}

describe('the KEEPER issue-triage panel links a decision to the comment it actually posted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a real link to the posted comment after a successful execute', async () => {
    bootAndExecute({
      commandResults: [
        {
          command: { details: "posting KEEPER's triage reasoning as a comment on #7" },
          code: 0,
          stdout: COMMENT_URL,
        },
      ],
      tasksCreated: 1,
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-issue-triage-execute]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-comment-link')).not.toBeNull();
    });
    const link = document.querySelector('.issue-triage-comment-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(COMMENT_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toBe('#7');
  });

  it('renders no comment link when the execute reports a failure', async () => {
    bootAndExecute({ error: 'gh unavailable' });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-issue-triage-execute]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-result')?.textContent).toContain(
        'gh unavailable',
      );
    });
    expect(document.querySelector('.issue-triage-comment-link')).toBeNull();
  });
});
