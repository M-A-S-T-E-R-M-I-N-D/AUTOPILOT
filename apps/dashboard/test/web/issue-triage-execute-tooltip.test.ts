// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the KEEPER
 * issue-triage panel's "🗝️ Run KEEPER triage" button — unlike its sibling
 * `.issue-triage-number` chip and decision badge on the same panel, both
 * fully tipped — carries no [data-tip]/aria-label at all, so hovering or
 * focusing it tells you nothing about the batch blast radius before the
 * click triggers issueTriageConfirmMessage's confirm dialog. The same gap
 * pr-review-execute-tooltip.test.ts closed for the PR-review Apply button.
 *
 * Covers the pure tip text (issueTriageExecuteTip) AND the shell.ts wiring
 * that puts it on the button — the wiring was deferred to this follow-up
 * slice because shell.ts was claimed by a sibling flight when the helper
 * landed. Same DOM-boot pattern as release-execute-tooltip.test.ts.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  issueTriageExecuteTip,
  issueTriageHasWork,
  issueTriageNothingToRunTip,
} from '../../src/web/issue-triage-panel.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const ACCEPT = {
  issue: { number: 42, title: 'Widget renders blank on load' },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};
const DUPLICATE = {
  issue: { number: 43, title: 'Widget renders blank again' },
  decision: { decision: 'duplicate', reasoning: 'Matches open task.' },
};
const SKIP = {
  issue: { number: 44, title: 'Already handled last pass' },
  decision: { decision: 'skip', reasoning: 'Triaged previously.' },
};
const DOSSIER = {
  issue: { number: 45, title: 'partner application: @someone' },
  decision: { decision: 'dossier', reasoning: 'Standing application.' },
};

describe('issueTriageExecuteTip — Run KEEPER triage button hover/focus text', () => {
  it('names the batch size and per-decision counts in one sentence', () => {
    const tip = issueTriageExecuteTip([ACCEPT, DUPLICATE, SKIP]);
    expect(tip).toContain('3 open issues');
    expect(tip).toContain('1 to accept');
    expect(tip).toContain('1 to mark duplicate');
    expect(tip).toContain('1 already triaged');
  });

  it('reads singular for a one-issue batch and says gh fires only after a confirm', () => {
    const tip = issueTriageExecuteTip([ACCEPT]);
    expect(tip).toContain('1 open issue');
    expect(tip).not.toContain('1 open issues');
    expect(tip).toContain('confirm');
  });

  it('mirrors the confirm message counts so hover preview matches the dialog', () => {
    const tip = issueTriageExecuteTip([ACCEPT, DUPLICATE]);
    expect(tip).toContain('2 open issues');
    expect(tip).toContain('1 to accept');
    expect(tip).toContain('0 already triaged');
    expect(tip).toContain('label + comment + new board task');
  });

  it('counts a dossier decision separately from accept/duplicate/skip', () => {
    const tip = issueTriageExecuteTip([ACCEPT, DUPLICATE, SKIP, DOSSIER]);
    expect(tip).toContain('4 open issues');
    expect(tip).toContain('1 to post a maintainer evidence dossier for');
    expect(tip).toContain('1 already triaged');
  });
});

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

function bootWithTriage(triage: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage }) } as unknown as Response;
    }
    if (url.includes('/api/release')) {
      return { ok: true, json: async () => ({ release: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('Run KEEPER triage button explains itself on hover/focus (shell wiring)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the triage button a data-tip matching its aria-label with the batch counts', async () => {
    bootWithTriage([ACCEPT, DUPLICATE, SKIP]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-issue-triage-execute]');
    expect(button?.getAttribute('data-tip')).toBeTruthy();
    expect(button?.getAttribute('data-tip')).toBe(button?.getAttribute('aria-label'));
    expect(button?.getAttribute('data-tip')).toBe(issueTriageExecuteTip([ACCEPT, DUPLICATE, SKIP]));
    expect(button?.getAttribute('data-tip')).toContain('3 open issues');
  });
});

/**
 * Operator catch (2026-09-09): with every open issue already triaged the
 * button still read "🗝️ Run KEEPER triage" and its tip still said "0 to
 * accept … 6 already triaged" — an affordance offering a confirm dialog
 * for a run that would touch nothing. The disabled-with-reason law says a
 * control that cannot act must SAY SO, not pretend; the button now goes
 * disabled and its tip names the condition and what re-enables it.
 */
describe('the triage button goes disabled-with-reason when nothing is actionable', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports no work when every plan is a skip', () => {
    expect(issueTriageHasWork([SKIP, SKIP])).toBe(false);
    expect(issueTriageHasWork([])).toBe(false);
  });

  it('reports work when any plan accepts, dedups, or opens a dossier', () => {
    expect(issueTriageHasWork([SKIP, ACCEPT])).toBe(true);
    expect(issueTriageHasWork([SKIP, DUPLICATE])).toBe(true);
    expect(issueTriageHasWork([SKIP, DOSSIER])).toBe(true);
  });

  it('names the count and what re-enables the button in the reason tip', () => {
    const tip = issueTriageNothingToRunTip(6);
    expect(tip).toContain('Nothing to run');
    expect(tip).toContain('6 open issues are');
    expect(tip).toContain('new or changed issue');
    expect(issueTriageNothingToRunTip(1)).toContain('1 open issue is');
  });

  it('renders the button disabled with the reason tip on an all-skip round', async () => {
    bootWithTriage([SKIP, SKIP, SKIP]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-issue-triage-execute]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('data-tip')).toBe(issueTriageNothingToRunTip(3));
    expect(button.getAttribute('data-tip')).toBe(button.getAttribute('aria-label'));
    expect(button.getAttribute('data-tip')).not.toContain('to accept');
  });

  it('leaves the button enabled with the batch tip when one issue is new', async () => {
    bootWithTriage([SKIP, SKIP, ACCEPT]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-issue-triage-execute]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.getAttribute('data-tip')).toContain('1 to accept');
  });
});
