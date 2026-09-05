// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the masthead's
 * "updated Xs ago" status is a relative-time label exactly like every other
 * "…ago" chip in the app (all of which explain themselves on hover/focus) —
 * but this one, the very first thing a user sees, rendered with zero
 * explanation of what "updated" actually measures, in either its live or
 * its offline state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 0,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [],
  empty: true,
};

describe('masthead "updated" status', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains what the live timestamp measures once the fleet loads', async () => {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated');
    expect(updated).toBeTruthy();
    expect(updated?.getAttribute('tabindex')).toBe('0');
    expect(updated?.getAttribute('data-tip')).toBe(
      'When the live fleet stream last pushed fresh data',
    );
  });

  it('explains the offline state when the stream drops', async () => {
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated');
    expect(updated?.textContent).toBe('offline — retrying…');
    expect(updated?.getAttribute('tabindex')).toBe('0');
    expect(updated?.getAttribute('data-tip')).toBe(
      'Lost the connection to the server — it will keep retrying automatically',
    );
  });

  it('translates the offline status and its tooltip when the locale is Hebrew', async () => {
    // Regression for the i18n miss ce651fb left behind: that fix translated
    // the masthead's first-paint "connecting…" placeholder but not this
    // later, more-likely-to-fire offline branch, which stayed hardcoded
    // English no matter the reader's locale.
    document.open();
    document.write(renderShell());
    document.close();
    document.documentElement.lang = 'he';
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated');
    expect(updated?.textContent).toBe('לא מקוון — מנסה שוב…');
    expect(updated?.getAttribute('data-tip')).toBe(
      'החיבור לשרת אבד — הניסיון החוזר יתבצע אוטומטית',
    );
  });
});
