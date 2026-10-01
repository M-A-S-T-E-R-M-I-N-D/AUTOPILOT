// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Board ap-mupqfryv-0, the panel half: once `refuseUnboundIssueTriage`
 * refuses a project that is not a checkout of the repository `gh` acts on,
 * `GET /api/issue-triage` answers `{ triage: null, skippedReason, ghRepo,
 * projectRepo? }`. The panel used to read that null as an empty list and say
 * "No open issues to triage." — true of nothing. It now says which
 * repository triage acts on and why this project is not it, with no execute
 * button, the way `issue-triage-panel-guest.test.ts`'s guest note replaces
 * the button for a confirmed non-owner.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { issueTriageRefusalNote } from '../../src/web/issue-triage-panel.js';

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

const MAINTAINER = { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' };

const UNBOUND_NOTE =
  'KEEPER triage acts on octocat/hello-world, the repository this dashboard runs in. This project has no GitHub origin, so none of those issues are triaged onto its board.';
const MISMATCH_NOTE =
  'KEEPER triage acts on octocat/hello-world, the repository this dashboard runs in. This project is a checkout of someone-else/their-project, so none of those issues are triaged onto its board.';

function bootWithTriageBody(triageBody: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: MAINTAINER }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => triageBody } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('issueTriageRefusalNote (board ap-mupqfryv-0)', () => {
  it('names the repository gh acts on for a project with no GitHub origin', () => {
    expect(
      issueTriageRefusalNote({ skippedReason: 'repo-unbound', ghRepo: 'octocat/hello-world' }),
    ).toEqual({
      template: 'issueTriageRepoUnboundNote',
      args: { ghRepo: 'octocat/hello-world' },
      text: UNBOUND_NOTE,
    });
  });

  it('names both repositories for a checkout of another repository', () => {
    expect(
      issueTriageRefusalNote({
        skippedReason: 'repo-mismatch',
        ghRepo: 'octocat/hello-world',
        projectRepo: 'someone-else/their-project',
      }),
    ).toEqual({
      template: 'issueTriageRepoMismatchNote',
      args: { ghRepo: 'octocat/hello-world', projectRepo: 'someone-else/their-project' },
      text: MISMATCH_NOTE,
    });
  });

  it.each([
    ['a plain preview', { triage: [] }],
    ['a bare failure', { triage: null }],
    ['an unknown reason', { triage: null, skippedReason: 'guest', ghRepo: 'octocat/hello-world' }],
    ['a refusal missing its repository', { triage: null, skippedReason: 'repo-unbound' }],
    ['no body at all', null],
  ])('is null for %s', (_why, body) => {
    expect(issueTriageRefusalNote(body)).toBeNull();
  });
});

describe('KEEPER issue triage panel says why it refused instead of "No open issues" (board ap-mupqfryv-0)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    [
      'no GitHub origin',
      { triage: null, skippedReason: 'repo-unbound', ghRepo: 'octocat/hello-world' },
      UNBOUND_NOTE,
    ],
    [
      'a checkout of another repository',
      {
        triage: null,
        skippedReason: 'repo-mismatch',
        projectRepo: 'someone-else/their-project',
        ghRepo: 'octocat/hello-world',
      },
      MISMATCH_NOTE,
    ],
  ])('renders the refusal for %s, with no execute button', async (_why, body, note) => {
    bootWithTriageBody(body);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-refusal-note')).not.toBeNull();
    });
    expect(document.querySelector('.issue-triage-refusal-note')?.textContent).toBe(note);
    expect(document.querySelector('[data-issue-triage-execute]')).toBeNull();
    expect(document.querySelector('.issue-triage-body')?.textContent).not.toContain(
      'No open issues to triage.',
    );
  });

  it('still says "No open issues to triage." for a real empty preview', async () => {
    bootWithTriageBody({ triage: [] });

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-body')?.textContent).toContain(
        'No open issues to triage.',
      );
    });
    expect(document.querySelector('.issue-triage-refusal-note')).toBeNull();
  });
});
