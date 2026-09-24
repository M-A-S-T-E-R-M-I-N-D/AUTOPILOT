// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT'S NEW (operator, 2026-09-24): the message opens once per new version,
 * closes until the next one, can be silenced for good, and always reopens
 * from the version menu — in the interface's language.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axe from 'axe-core';
import {
  whatsNewClientJs,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_NEVER_KEY,
  WHATS_NEW_STRINGS,
} from '../../src/web/whats-new.js';

const PAYLOAD = {
  version: '0.54.0',
  release: {
    version: '0.54.0',
    date: '2026-09-24',
    groups: [
      {
        title: 'Added',
        items: [
          { kind: 'feat', scope: 'pool', text: 'a claimed issue goes to its checkout' },
          { kind: 'feat', scope: null, text: '<img src=x onerror=alert(1)>' },
        ],
      },
      { title: 'Fixed', items: [{ kind: 'fix', scope: 'gate', text: 'twenty minutes' }] },
      { title: 'Also in this release', items: [{ kind: 'perf', scope: 'ci', text: 'faster' }] },
    ],
  },
  round: {
    roundStartAt: 1,
    tagName: 'v0.53.0',
    firings: 10,
    shipped: 7,
    cost: 20,
    shipRate: 0.7,
    costPerShipped: 2.857,
  },
  github: { repo: 'o/r', openIssues: 4, openPrs: 1 },
  ci: {
    passing: 1,
    failing: 1,
    workflows: [
      { workflow: 'ci.yml', ok: true },
      { workflow: 'e2e.yml', ok: false },
    ],
  },
};

function boot(version = '0.54.0'): void {
  new Function(whatsNewClientJs(version))();
}

function dialog(): HTMLElement | null {
  return document.querySelector('.wn-dialog');
}

async function painted(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector('.wn-tiles')).not.toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.head.innerHTML = '<title>AUTOPILOT</title>';
  document.body.innerHTML =
    '<main><h1>Fleet</h1><details id="settings-menu" open><summary>Settings</summary><div class="settings-body"></div></details></main>';
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => PAYLOAD,
  })) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what's new — when it opens", () => {
  it('stays silent on a first-ever visit, where the tour speaks, and records the version', () => {
    boot();
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe('0.54.0');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('opens for a returning viewer on a new version, and not again once closed', async () => {
    localStorage.setItem('ap-tour-seen', '1');
    localStorage.setItem(WHATS_NEW_SEEN_KEY, '0.53.0');
    boot();
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    await painted();
    (document.querySelector('.wn-close') as HTMLButtonElement).click();
    expect(dialog()).toBeNull();
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe('0.54.0');
    boot();
    expect(dialog()).toBeNull();
  });

  it('opens for a viewer who took the tour before this message existed', () => {
    localStorage.setItem('ap-tour-seen', '1');
    boot();
    expect(dialog()).not.toBeNull();
  });

  it('opens again on the next version', () => {
    localStorage.setItem('ap-tour-seen', '1');
    localStorage.setItem(WHATS_NEW_SEEN_KEY, '0.54.0');
    boot('0.55.0');
    expect(dialog()).not.toBeNull();
  });

  it('never opens by itself after "don\'t show again", but the menu still opens it', async () => {
    localStorage.setItem('ap-tour-seen', '1');
    localStorage.setItem(WHATS_NEW_SEEN_KEY, '0.53.0');
    localStorage.setItem(WHATS_NEW_NEVER_KEY, '1');
    boot();
    expect(dialog()).toBeNull();
    (document.querySelector('.wn-menu-btn') as HTMLButtonElement).click();
    expect(dialog()).not.toBeNull();
    const never = document.querySelector('.wn-never') as HTMLInputElement;
    expect(never.checked).toBe(true);
    never.checked = false;
    never.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(WHATS_NEW_NEVER_KEY)).toBeNull();
  });

  it('records "don\'t show again" from the checkbox', () => {
    localStorage.setItem('ap-tour-seen', '1');
    boot();
    const never = document.querySelector('.wn-never') as HTMLInputElement;
    never.checked = true;
    never.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(WHATS_NEW_NEVER_KEY)).toBe('1');
  });
});

describe("what's new — what it shows", () => {
  beforeEach(() => {
    localStorage.setItem('ap-tour-seen', '1');
  });

  it('counts and charts the release, lists what is new, and shows the round and GitHub', async () => {
    boot();
    await painted();
    const d = dialog()!;
    expect(d.querySelector('#wn-title')?.textContent).toBe("What's new in v0.54.0");
    expect(d.textContent).toContain('Released 2026-09-24');
    const tiles = [...d.querySelectorAll('.wn-tile')].map((t) => t.textContent);
    expect(tiles).toContain('Changes4');
    expect(tiles).toContain('Added2');
    expect(tiles).toContain('Open issues4');
    expect(tiles).toContain('Open pull requests1');
    expect(tiles.some((t) => t?.startsWith('Ship rate70%'))).toBe(true);
    expect(tiles).toContain('Cost per shipped$2.86');
    expect((d.querySelector('.wn-bar .wn-k-added') as HTMLElement).style.width).toBe('50%');
    expect(d.querySelectorAll('.wn-ci .wn-bad')).toHaveLength(1);
    expect(d.querySelector('.wn-scope')?.textContent).toBe('pool');
    // English changelog lines inside a Hebrew dialog keep their own direction
    expect(d.querySelector('.wn-list li')?.getAttribute('dir')).toBe('auto');
    expect((d.querySelector('.wn-changelog') as HTMLAnchorElement).href).toBe(
      'https://github.com/o/r/blob/main/CHANGELOG.md',
    );
  });

  it('prints changelog text as text, never as markup', async () => {
    boot();
    await painted();
    expect(document.querySelector('.wn-dialog img')).toBeNull();
    expect(dialog()?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('says so when the details cannot be loaded, and still closes', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    boot();
    await vi.waitFor(() =>
      expect(dialog()?.querySelector('.wn-sub')?.textContent).toBe(WHATS_NEW_STRINGS.en.failed),
    );
    (document.querySelector('.wn-close') as HTMLButtonElement).click();
    expect(dialog()).toBeNull();
  });

  it('speaks Hebrew when the interface does', async () => {
    document.documentElement.lang = 'he';
    boot();
    await painted();
    expect(dialog()?.querySelector('#wn-title')?.textContent).toBe('מה חדש בגרסה v0.54.0');
    expect(document.querySelector('.wn-close')?.textContent).toBe(WHATS_NEW_STRINGS.he.close);
    expect(document.querySelector('.wn-menu-btn')?.textContent).toBe(WHATS_NEW_STRINGS.he.menu);
  });

  it('closes on Escape and returns focus to where it was', async () => {
    const before = document.createElement('button');
    document.body.appendChild(before);
    before.focus();
    boot();
    expect(document.activeElement?.className).toBe('wn-close');
    document
      .querySelector('.wn-overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it('keeps Tab inside the dialog', async () => {
    boot();
    await painted();
    const close = document.querySelector('.wn-close') as HTMLButtonElement;
    close.focus();
    document
      .querySelector('.wn-overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(dialog()?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
  });

  it('is axe-clean when open and painted', async () => {
    boot();
    await painted();
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("what's new — strings", () => {
  it('carries the same keys in English and Hebrew, and every Hebrew line is translated', () => {
    expect(Object.keys(WHATS_NEW_STRINGS.he).sort()).toEqual(
      Object.keys(WHATS_NEW_STRINGS.en).sort(),
    );
    for (const [key, value] of Object.entries(WHATS_NEW_STRINGS.he)) {
      expect(/\p{Script=Hebrew}/u.test(value), key).toBe(true);
    }
  });
});

describe("what's new — styles under the dashboard's CSP", () => {
  // The CSP is default-src 'self': an injected <style> is blocked in a real
  // browser, and jsdom enforces no CSP, so the first cut passed here and
  // rendered unstyled at the foot of the page. The styles ride /tokens.css.
  it('never injects a style element', async () => {
    localStorage.setItem('ap-tour-seen', '1');
    boot();
    await painted();
    expect(document.querySelectorAll('style')).toHaveLength(0);
    expect(whatsNewClientJs('0.54.0')).not.toContain("createElement('style')");
  });
});
