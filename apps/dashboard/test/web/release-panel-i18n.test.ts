// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * i18n wiring for the project page's "🚀 Next release" panel
 * (`web/features/release.ts`, board web-msnsndki-dz3vn1). The heading was
 * tagged first — an `el()`-built `<h3 class="release-title">` the regex
 * `pnpm i18n:untagged` scanner could not see until it learned the `el()`
 * shape (issue #16). Once it did, it listed the panel's four remaining
 * `el()` text nodes: the loading placeholder (built once, synchronously,
 * when the panel mounts — rides the page-level sweep like the heading), and
 * the three states rebuilt inside the async `/api/release` handlers — the
 * unavailable message (fetch failure OR a payload with no release), the
 * "no release tags yet" message, and the milestone-tag `<label>` on a
 * planned release. Each must carry its STRINGS key so `translateDom()` (page
 * load, language switch, AND the panel's own post-fetch sweep) renders it
 * in the active locale — the contract `issue-triage.ts` already meets.
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
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.12,
  },
  projects: [PROJECT],
  empty: false,
};

/** What `/api/release` does for this boot. */
type ReleaseMode = 'pending' | 'fail' | 'none' | 'notags' | 'plan';

const RELEASE_BY_MODE: Record<Exclude<ReleaseMode, 'pending' | 'fail'>, unknown> = {
  none: null,
  notags: { tagName: null, currentVersion: '0.1.0', plan: null },
  plan: {
    tagName: 'v1.2.0',
    currentVersion: '1.2.0',
    plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
  },
};

function boot(mode: ReleaseMode): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/release')) {
      if (mode === 'pending') return new Promise<Response>(() => {});
      if (mode === 'fail') throw new Error('network down');
      return {
        ok: true,
        json: async () => ({ release: RELEASE_BY_MODE[mode] }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

const bodyText = (): string | undefined =>
  document.querySelector('.release-panel .release-body p')?.textContent ?? undefined;

describe('"🚀 Next release" panel i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it('tags the "Next release" heading with its STRINGS key', async () => {
    boot('none');
    await settle();

    const heading = document.querySelector('.release-panel h3.release-title');
    expect(heading?.getAttribute('data-i18n')).toBe('releaseTitle');
    expect(heading?.textContent).toBe('🚀 Next release');
  });

  it('switching to Hebrew translates the heading', async () => {
    boot('none');
    await settle();

    switchToHebrew();

    const heading = document.querySelector('.release-panel h3.release-title');
    expect(heading?.textContent).toBe(STRINGS.he.releaseTitle);
  });

  it('tags the loading placeholder while the fetch is still in flight', async () => {
    boot('pending');
    await settle();

    const loading = document.querySelector('.release-panel .release-body p');
    expect(loading?.textContent).toBe('Checking for release-worthy commits…');
    expect(loading?.getAttribute('data-i18n')).toBe('releaseLoading');
  });

  it('tags the unavailable state when the fetch fails', async () => {
    boot('fail');
    await settle();

    const unavailable = document.querySelector('.release-panel .release-body p');
    expect(unavailable?.textContent).toBe('Release preview unavailable.');
    expect(unavailable?.getAttribute('data-i18n')).toBe('releaseUnavailable');
  });

  it('tags the unavailable state when the payload carries no release', async () => {
    boot('none');
    await settle();

    const unavailable = document.querySelector('.release-panel .release-body p');
    expect(unavailable?.textContent).toBe('Release preview unavailable.');
    expect(unavailable?.getAttribute('data-i18n')).toBe('releaseUnavailable');
  });

  it('tags the "no release tags yet" state', async () => {
    boot('notags');
    await settle();

    const noTags = document.querySelector('.release-panel .release-body p');
    expect(noTags?.textContent).toBe(
      'No release tags yet — nothing to diff the next release against.',
    );
    expect(noTags?.getAttribute('data-i18n')).toBe('releaseNoTags');
  });

  it('tags the milestone-tag label on a planned release', async () => {
    boot('plan');
    await settle();

    const label = document.querySelector('.release-panel .release-milestone label');
    expect(label?.textContent).toBe('Milestone tag (optional)');
    expect(label?.getAttribute('data-i18n')).toBe('releaseMilestoneLabel');
    // The label stays wired to its input — tagging must not loosen the a11y contract.
    expect(label?.getAttribute('for')).toBe('release-milestone-p1');
  });

  it('switching to Hebrew translates the already-rendered states', async () => {
    boot('notags');
    await settle();
    switchToHebrew();
    expect(bodyText()).toBe(STRINGS.he.releaseNoTags);

    boot('plan');
    await settle();
    switchToHebrew();
    expect(document.querySelector('.release-panel .release-milestone label')?.textContent).toBe(
      STRINGS.he.releaseMilestoneLabel,
    );
  });

  it('renders the post-fetch states in Hebrew when the fetch resolves after the language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();
    expect(bodyText()).toBe(STRINGS.he.releaseLoading);

    // A second panel render whose fetch resolves AFTER the switch must sweep
    // its own fresh DOM — the page-level switch sweep already ran.
    boot('notags');
    await settle();
    expect(bodyText()).toBe(STRINGS.he.releaseNoTags);

    boot('none');
    await settle();
    expect(bodyText()).toBe(STRINGS.he.releaseUnavailable);

    boot('plan');
    await settle();
    expect(document.querySelector('.release-panel .release-milestone label')?.textContent).toBe(
      STRINGS.he.releaseMilestoneLabel,
    );
  });

  it('renders the unavailable state in Hebrew when the fetch fails after the language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();

    boot('fail');
    await settle();

    expect(bodyText()).toBe(STRINGS.he.releaseUnavailable);
  });
});

describe('RELEASE EXECUTE button i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  /** Boots the panel with a planned release AND a mocked /api/release/execute,
   *  so the EXECUTE button's click handler (not just its initial render) can
   *  be driven — the plain `boot()` above only mocks GET /api/release. */
  function bootExecuteReady(succeed: boolean): void {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/release/execute') {
        if (!succeed) return Promise.reject(new Error('network down'));
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
          json: async () => ({ release: RELEASE_BY_MODE.plan }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => STATE } as unknown as Response);
    }) as unknown as typeof fetch;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    new Function(clientJs())();
  }

  it('renders the EXECUTE button label with the planned version by default', async () => {
    boot('plan');
    await settle();

    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    expect(button.textContent).toBe('🚀 Cut release v1.3.0');
  });

  it('renders the EXECUTE button label in Hebrew when the panel builds after a language switch', async () => {
    boot('pending');
    await settle();
    switchToHebrew();

    boot('plan');
    await settle();

    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    expect(button.textContent).toBe(STRINGS.he.releaseExecuteButton.replace('{version}', '1.3.0'));
  });

  it('shows the in-flight "Releasing…" label in Hebrew immediately on click under a Hebrew locale', async () => {
    bootExecuteReady(true);
    await settle();
    switchToHebrew();

    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    button.click();

    expect(button.textContent).toBe(STRINGS.he.releasing);
  });

  it('shows the network-failure fallback in Hebrew when Hebrew is active', async () => {
    bootExecuteReady(false);
    await settle();
    switchToHebrew();

    const button = document.querySelector('[data-release-execute]') as HTMLButtonElement;
    button.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.release-result')?.textContent).toBe(
        STRINGS.he.releaseRequestFailed,
      );
    });
  });
});
