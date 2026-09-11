// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the MIRROR PASS panel's "Run mirror pass" EXECUTE button
 * (`web/features/mirror-pass.ts`, board web-msnsndki-dz3vn1). The button
 * shipped tagged `data-i18n="mirrorPassExecute"` with no such STRINGS key —
 * `translateDom()` is nil-safe, so the tag was simply dead and the button
 * stayed English under Hebrew — and its hover tip / accessible name, its
 * `window.confirm()` text, the in-flight "Running…" label and the click
 * handler's own request-failed line were plain literals. Drives the real
 * served bundle in jsdom, the same way `issue-triage-panel-i18n.test.ts`
 * covers the KEEPER panel's EXECUTE button: English byte-identical + tagged,
 * the in-place Hebrew flip, the panel's own post-fetch sweep on a saved
 * locale, and the three tr()-painted click-time strings.
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

const RECONCILE_FINDING = [
  { finding: { issueNumber: 42, comment: 'Landed in abc123 — closing.' } },
];

const MAINTAINER = { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' };

type ExecuteMode = 'pending' | 'fail';

function boot(executeMode: ExecuteMode = 'pending'): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: MAINTAINER }) } as unknown as Response;
    }
    // Most specific mirror-pass paths first — every one of them contains the
    // bare `/api/mirror-pass` substring the preview route matches on.
    if (url.includes('/api/mirror-pass/execute')) {
      if (executeMode === 'fail') throw new Error('network down');
      return new Promise<Response>(() => {});
    }
    if (url.includes('/api/mirror-pass/landing-note')) {
      return { ok: true, json: async () => ({ landingNote: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/drift')) {
      return { ok: true, json: async () => ({ drift: null }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/stale-claims')) {
      return { ok: true, json: async () => ({ staleClaims: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass')) {
      return {
        ok: true,
        json: async () => ({ mirrorPass: RECONCILE_FINDING }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

async function executeButton(): Promise<HTMLButtonElement> {
  await vi.waitFor(() => {
    expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
  });
  return document.querySelector('[data-mirror-pass-execute]') as HTMLButtonElement;
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function executeCalls(): number {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
    String(call[0]).includes('/api/mirror-pass/execute'),
  ).length;
}

describe('the MIRROR PASS execute button i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('renders the English label, tip and accessible name byte-identical, each tagged with its STRINGS key', async () => {
    boot();
    const button = await executeButton();

    expect(button.textContent).toBe('Run mirror pass');
    expect(button.getAttribute('data-i18n')).toBe('mirrorPassExecute');
    expect(button.getAttribute('data-tip')).toBe(STRINGS.en.mirrorPassExecuteTip);
    expect(button.getAttribute('data-i18n-tip')).toBe('mirrorPassExecuteTip');
    expect(button.getAttribute('aria-label')).toBe(STRINGS.en.mirrorPassExecuteTip);
    expect(button.getAttribute('data-i18n-aria')).toBe('mirrorPassExecuteTip');
  });

  it('switching to Hebrew flips the label, tip and accessible name in place', async () => {
    boot();
    const button = await executeButton();

    switchToHebrew();

    expect(button.textContent).toBe(STRINGS.he.mirrorPassExecute);
    expect(button.getAttribute('data-tip')).toBe(STRINGS.he.mirrorPassExecuteTip);
    expect(button.getAttribute('aria-label')).toBe(STRINGS.he.mirrorPassExecuteTip);
    expect(document.querySelector('[data-mirror-pass-execute]')).toBe(button);
  });

  it('paints the button in Hebrew on first render when Hebrew is the saved locale — the panel sweeps its own post-fetch DOM', async () => {
    localStorage.setItem('ap-locale', 'he');
    boot();
    const button = await executeButton();

    expect(button.textContent).toBe(STRINGS.he.mirrorPassExecute);
    expect(button.getAttribute('aria-label')).toBe(STRINGS.he.mirrorPassExecuteTip);
  });

  it('asks the confirm question in Hebrew, and a declined confirm posts nothing', async () => {
    boot();
    const button = await executeButton();
    switchToHebrew();
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => false);

    button.click();

    expect(confirm).toHaveBeenCalledWith(STRINGS.he.mirrorPassExecuteConfirm);
    expect(executeCalls()).toBe(0);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(STRINGS.he.mirrorPassExecute);
  });

  it('shows the in-flight label in Hebrew while the execute request is pending', async () => {
    boot('pending');
    const button = await executeButton();
    switchToHebrew();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    button.click();

    expect(executeCalls()).toBe(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(STRINGS.he.mirrorPassExecuting);
  });

  it('reports a failed execute request in Hebrew and restores the Hebrew idle label', async () => {
    boot('fail');
    const button = await executeButton();
    switchToHebrew();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-result')?.textContent).toBe(
        STRINGS.he.mirrorPassRequestFailed,
      );
    });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(STRINGS.he.mirrorPassExecute);
  });

  it('keeps the confirm and transient states English under the default locale', async () => {
    boot('fail');
    const button = await executeButton();
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    button.click();

    expect(confirm).toHaveBeenCalledWith(STRINGS.en.mirrorPassExecuteConfirm);
    expect(button.textContent).toBe('Running…');
    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-result')?.textContent).toBe(
        'Mirror pass request failed.',
      );
    });
    expect(button.textContent).toBe('Run mirror pass');
  });
});
