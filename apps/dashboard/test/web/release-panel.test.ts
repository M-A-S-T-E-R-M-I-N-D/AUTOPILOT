// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * RELEASE preview (web-msnshavs-z0obmh): the project page's inside page
 * fetches GET /api/release on demand and renders the SemVer bump the commits
 * since the project's last release tag would cut — read-only, pairs with
 * CURRENT ROUND above it. These tests drive the REAL served client bundle in
 * jsdom against a URL-aware mocked fetch.
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

function bootWithRelease(release: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/release')) {
      return { ok: true, json: async () => ({ release }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the RELEASE preview panel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the next version bump computed since the last release tag', async () => {
    bootWithRelease({
      tagName: 'v1.2.0',
      currentVersion: '1.2.0',
      plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.release-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.release-line')?.textContent).toContain('1.2.0 → 1.3.0');
    });
    expect(document.querySelector('.release-line')?.textContent).toContain('minor');
  });

  it('shows an honest "no release tags yet" state instead of guessing at one', async () => {
    bootWithRelease({ tagName: null, currentVersion: '0.1.0', plan: null });

    await vi.waitFor(() => {
      expect(document.querySelector('.release-panel')).not.toBeNull();
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.release-body')?.textContent).toContain('No release tags yet');
    });
  });

  it('shows a no-op state when nothing since the last tag is release-worthy', async () => {
    bootWithRelease({
      tagName: 'v1.2.0',
      currentVersion: '1.2.0',
      plan: {
        ok: false,
        reason: 'no-op',
        details: 'no release-worthy commits since the last release',
      },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.release-body')?.textContent).toContain(
        'No release-worthy commits since v1.2.0',
      );
    });
  });

  it('degrades to an honest unavailable message when the fetch fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/release')) throw new Error('network down');
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-body')?.textContent).toContain(
        'Release preview unavailable',
      );
    });
  });

  it('shows no EXECUTE button when there is nothing release-worthy to cut', async () => {
    bootWithRelease({
      tagName: 'v1.2.0',
      currentVersion: '1.2.0',
      plan: {
        ok: false,
        reason: 'no-op',
        details: 'no release-worthy commits since the last release',
      },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.release-body')).not.toBeNull();
    });
    expect(document.querySelector('[data-release-execute]')).toBeNull();
  });
});

describe('RELEASE EXECUTE', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function bootReady(executeResponse: unknown): void {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn((url: string) => {
      if (url === '/api/release/execute') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => executeResponse,
        } as unknown as Response);
      }
      if (url.includes('/api/release')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            release: {
              tagName: 'v1.2.0',
              currentVersion: '1.2.0',
              plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
            },
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
    }) as unknown as typeof fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    new Function(clientJs())();
  }

  it('renders a "Cut release" button carrying the planned version, gated behind confirm', async () => {
    bootReady({
      ok: true,
      reason: 'released',
      details: 'released v1.3.0 (minor)',
      version: '1.3.0',
      bump: 'minor',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    expect(button.textContent).toContain('1.3.0');

    button.click();
    await vi.waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
  });

  it('does NOT call the execute endpoint when the operator cancels the confirm', async () => {
    bootReady({ ok: true, reason: 'released', details: '', version: '1.3.0', bump: 'minor' });
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    (document.querySelector('[data-release-execute]') as HTMLButtonElement).click();

    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/release/execute', expect.anything());
  });

  it('renders the success result in place instead of an alert()', async () => {
    bootReady({
      ok: true,
      reason: 'released',
      details: 'released v1.3.0 (minor)',
      version: '1.3.0',
      bump: 'minor',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    (document.querySelector('[data-release-execute]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toBe(
        '✓ Released — released v1.3.0 (minor)',
      );
    });
    expect(document.querySelector('.release-result')?.className).toContain('release-result-ok');
  });

  it('surfaces a failed attestation as a non-fatal note on an otherwise successful release', async () => {
    bootReady({
      ok: true,
      reason: 'released',
      details: 'released v1.3.0 (minor)',
      version: '1.3.0',
      bump: 'minor',
      attestation: { ok: false, details: "a note already exists on 'HEAD'" },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    (document.querySelector('[data-release-execute]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toBe(
        "✓ Released — released v1.3.0 (minor) (note: attestation not attached — a note already exists on 'HEAD')",
      );
    });
    // still a success — the release (commit + tag) landed even though the attestation didn't
    expect(document.querySelector('.release-result')?.className).toContain('release-result-ok');
  });

  it('renders an accessibly-labeled, optional milestone tag input', async () => {
    bootReady({ ok: true, reason: 'released', details: '', version: '1.3.0', bump: 'minor' });

    await vi.waitFor(() => {
      expect(document.querySelector('.release-milestone-input')).not.toBeNull();
    });
    const input = document.querySelector('.release-milestone-input') as HTMLInputElement;
    const label = document.querySelector('label[for="' + input.id + '"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('optional');
    expect(input.getAttribute('aria-label')).toBeTruthy();
  });

  it('sends a filled-in milestone tag alongside the project id', async () => {
    const calls: Array<[string, unknown]> = [];
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn((url: string, opts?: RequestInit) => {
      calls.push([url, opts]);
      if (url === '/api/release/execute') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reason: 'released',
            details: 'released v1.3.0 (minor)',
            version: '1.3.0',
            bump: 'minor',
            milestoneTag: { ok: true, details: "created annotated tag 'm4' at HEAD" },
          }),
        } as unknown as Response);
      }
      if (url.includes('/api/release')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            release: {
              tagName: 'v1.2.0',
              currentVersion: '1.2.0',
              plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
            },
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
    }) as unknown as typeof fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-milestone-input')).not.toBeNull();
    });
    const input = document.querySelector('.release-milestone-input') as HTMLInputElement;
    input.value = 'm4';
    (document.querySelector('[data-release-execute]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toContain('✓');
    });
    const executeCall = calls.find(([url]) => url === '/api/release/execute');
    expect(executeCall).toBeDefined();
    const body = JSON.parse(String((executeCall?.[1] as RequestInit).body));
    expect(body).toEqual({ project: 'p1', milestoneTag: 'm4' });
    expect(document.querySelector('.release-result')?.textContent).toContain(
      "created annotated tag 'm4' at HEAD",
    );
  });

  it('omits milestoneTag from the request body when the input is left blank', async () => {
    const calls: Array<[string, unknown]> = [];
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn((url: string, opts?: RequestInit) => {
      calls.push([url, opts]);
      if (url === '/api/release/execute') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reason: 'released',
            details: 'released v1.3.0 (minor)',
            version: '1.3.0',
            bump: 'minor',
          }),
        } as unknown as Response);
      }
      if (url.includes('/api/release')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            release: {
              tagName: 'v1.2.0',
              currentVersion: '1.2.0',
              plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
            },
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
    }) as unknown as typeof fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    (document.querySelector('[data-release-execute]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toContain('✓');
    });
    const executeCall = calls.find(([url]) => url === '/api/release/execute');
    const body = JSON.parse(String((executeCall?.[1] as RequestInit).body));
    expect(body).toEqual({ project: 'p1' });
  });

  it('renders a refusal in place, re-enabling the button', async () => {
    bootReady({
      ok: false,
      reason: 'no-op',
      details: 'no release-worthy commits since the last release',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toBe(
        '✗ no release-worthy commits since the last release',
      );
    });
    expect(document.querySelector('.release-result')?.className).toContain('release-result-fail');
    expect(button.disabled).toBe(false);
  });
});
