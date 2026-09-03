// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The FLEET WISDOM banner (board web-msnt26xe-pc4pzp): the fleet-wide
 * pending wisdom amendment is only a real feature once the operator can
 * read the mined text and ratify/dismiss it from the dashboard — this is
 * that expression's regression test, mirroring soul-proposal-panel.test.ts
 * for the fleet-scoped counterpart.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

function stateWith(overrides: Record<string, unknown>) {
  return {
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
    wisdomProposed: null,
    ...overrides,
  };
}

function boot(state: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('FLEET WISDOM banner (board web-msnt26xe-pc4pzp)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders no banner while no fleet wisdom amendment is pending', async () => {
    boot(stateWith({}));
    await vi.advanceTimersByTimeAsync(1);

    const host = document.getElementById('fleet-wisdom');
    expect(host?.hidden).toBe(true);
    expect(document.querySelector('.fleet-wisdom-panel')).toBeNull();
  });

  it('renders the proposed text with keyboard-reachable ratify/dismiss buttons when a proposal is pending', async () => {
    boot(stateWith({ wisdomProposed: 'checkpoint before the turn cap' }));
    await vi.advanceTimersByTimeAsync(1);

    const host = document.getElementById('fleet-wisdom');
    expect(host?.hidden).toBe(false);
    const panel = host?.querySelector('.fleet-wisdom-panel');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.fleet-wisdom-text')?.textContent).toBe(
      'checkpoint before the turn cap',
    );

    const ratifyBtn = panel?.querySelector('[data-fleet-wisdom-ratify]');
    expect(ratifyBtn?.tagName).toBe('BUTTON');
    expect(ratifyBtn?.getAttribute('data-tip')).toBeTruthy();
    expect(ratifyBtn?.getAttribute('aria-label')).toBeTruthy();

    const dismissBtn = panel?.querySelector('[data-fleet-wisdom-dismiss]');
    expect(dismissBtn?.tagName).toBe('BUTTON');
    expect(dismissBtn?.getAttribute('data-tip')).toBeTruthy();
    expect(dismissBtn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('names the learning kind in the summary when the proposal carries a registered marker (epic 0014 slice 4b)', async () => {
    boot(
      stateWith({
        wisdomProposed: 'checkpoint before the turn cap',
        wisdomKind: 'recurring checkpoint pattern',
      }),
    );
    await vi.advanceTimersByTimeAsync(1);

    const summary = document.querySelector('.fleet-wisdom-panel .soul-proposal-summary');
    expect(summary?.textContent).toBe(
      '◆ Fleet wisdom proposal pending (recurring checkpoint pattern) — review',
    );
  });

  it('falls back to the generic summary when the proposal carries no registered marker', async () => {
    boot(stateWith({ wisdomProposed: 'a hand-authored fleet note', wisdomKind: null }));
    await vi.advanceTimersByTimeAsync(1);

    const summary = document.querySelector('.fleet-wisdom-panel .soul-proposal-summary');
    expect(summary?.textContent).toBe('◆ Fleet wisdom proposal pending — review');
  });

  it('the pending-wisdom panel, with its learning kind named, is axe-clean', async () => {
    boot(
      stateWith({
        wisdomProposed: 'checkpoint before the turn cap',
        wisdomKind: 'recurring checkpoint pattern',
      }),
    );
    await vi.advanceTimersByTimeAsync(1);

    vi.useRealTimers();
    const results = await axe.run(document, AXE_OPTIONS);
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('ratify asks for confirmation, then POSTs to /api/fleet/wisdom-ratify and disables itself', async () => {
    boot(stateWith({ wisdomProposed: 'a mined fleet amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-fleet-wisdom-ratify]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).toHaveBeenCalledWith(STRINGS.en.fleetWisdomRatifyConfirm);
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fleet/wisdom-ratify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('ratify does nothing when the confirmation is declined', async () => {
    boot(stateWith({ wisdomProposed: 'a mined fleet amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-fleet-wisdom-ratify]') as HTMLButtonElement;
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(btn.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dismiss POSTs to /api/fleet/wisdom-dismiss without a confirmation and disables itself', async () => {
    boot(stateWith({ wisdomProposed: 'a mined fleet amendment' }));
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-fleet-wisdom-dismiss]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const confirmSpy = vi.spyOn(window, 'confirm');

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(btn.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/fleet/wisdom-dismiss',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
});
