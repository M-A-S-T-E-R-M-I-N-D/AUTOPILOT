// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's KEEPER ISSUE TRIAGE panel
 * (`web/features/issue-triage.ts`, board web-msnsndki-dz3vn1): its title,
 * loading placeholder, empty state, and fetch-failure state are client-built
 * `el()` nodes — `scripts/i18n/find-untagged-strings.mjs` listed all four as
 * untagged. Each must carry its STRINGS key so `translateDom()` (page load,
 * language switch, AND the panel's own post-fetch sweep) renders it in the
 * active locale, the same contract `coordination.ts` already meets.
 *
 * The execute button (`issueTriageExecute`) was a fifth gap the scanner
 * missed entirely — a `.textContent =` assignment, not an `el()` call — so
 * it stayed English-only under the Hebrew locale even after the other four
 * were fixed. It gets the same `data-i18n` tag plus its own sweep.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
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

type TriageMode = 'empty' | 'pending' | 'fail' | 'nonEmpty';

const OPEN_ISSUE = {
  issue: { number: 42, title: 'Widget renders blank on load' },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

function boot(mode: TriageMode): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/issue-triage')) {
      if (mode === 'pending') return new Promise<Response>(() => {});
      if (mode === 'fail') throw new Error('network down');
      if (mode === 'nonEmpty')
        return { ok: true, json: async () => ({ triage: [OPEN_ISSUE] }) } as unknown as Response;
      return { ok: true, json: async () => ({ triage: [] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

describe('the KEEPER ISSUE TRIAGE panel i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('tags the title and the empty state with their STRINGS keys', async () => {
    boot('empty');
    await settle();

    const title = document.querySelector('.issue-triage-title');
    expect(title?.textContent).toBe('🗝️ KEEPER issue triage');
    expect(title?.getAttribute('data-i18n')).toBe('issueTriageTitle');

    const empty = document.querySelector('.issue-triage-body p');
    expect(empty?.textContent).toBe('No open issues to triage.');
    expect(empty?.getAttribute('data-i18n')).toBe('issueTriageEmpty');
  });

  it('tags the loading placeholder while the fetch is still in flight', async () => {
    boot('pending');
    await settle();

    const loading = document.querySelector('.issue-triage-body p');
    expect(loading?.textContent).toBe('Checking open issues against the board…');
    expect(loading?.getAttribute('data-i18n')).toBe('issueTriageLoading');
  });

  it('tags the unavailable state when the fetch fails', async () => {
    boot('fail');
    await settle();

    const unavailable = document.querySelector('.issue-triage-body p');
    expect(unavailable?.textContent).toBe('Issue triage unavailable.');
    expect(unavailable?.getAttribute('data-i18n')).toBe('issueTriageUnavailable');
  });

  it('switching to Hebrew translates the title and the empty state', async () => {
    boot('empty');
    await settle();

    switchToHebrew();

    expect(document.querySelector('.issue-triage-title')?.textContent).toBe(
      STRINGS.he.issueTriageTitle,
    );
    expect(document.querySelector('.issue-triage-body p')?.textContent).toBe(
      STRINGS.he.issueTriageEmpty,
    );
  });

  it('renders the empty state in Hebrew when the fetch resolves after the language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();
    expect(document.querySelector('.issue-triage-body p')?.textContent).toBe(
      STRINGS.he.issueTriageLoading,
    );

    // A second panel render whose fetch resolves AFTER the switch must sweep
    // its own fresh DOM — the page-level switch sweep already ran.
    boot('empty');
    await settle();

    expect(document.querySelector('.issue-triage-body p')?.textContent).toBe(
      STRINGS.he.issueTriageEmpty,
    );
  });

  it('renders the unavailable state in Hebrew when the fetch fails after the language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();

    boot('fail');
    await settle();

    expect(document.querySelector('.issue-triage-body p')?.textContent).toBe(
      STRINGS.he.issueTriageUnavailable,
    );
  });

  it('tags the execute button with its STRINGS key', async () => {
    boot('nonEmpty');
    await settle();

    const button = document.querySelector('.issue-triage-execute');
    expect(button?.textContent).toBe('🗝️ Run KEEPER triage');
    expect(button?.getAttribute('data-i18n')).toBe('issueTriageExecute');
  });

  it('switching to Hebrew translates the execute button', async () => {
    boot('nonEmpty');
    await settle();

    switchToHebrew();

    expect(document.querySelector('.issue-triage-execute')?.textContent).toBe(
      STRINGS.he.issueTriageExecute,
    );
  });

  it('renders the execute button in Hebrew when the fetch resolves after the language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();

    boot('nonEmpty');
    await settle();

    expect(document.querySelector('.issue-triage-execute')?.textContent).toBe(
      STRINGS.he.issueTriageExecute,
    );
  });
});
