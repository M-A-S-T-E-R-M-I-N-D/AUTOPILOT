// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0018 "calm cockpit" slice 2 finishing piece (board web-mtq03uzp-hubr6g):
 * the masthead's "flying now" chip strip named each lane but never linked to
 * it. Every lane card (`.live-worker` for a single lane, `.lane-card` inside
 * `.lane-grid` for several) now carries a stable id, the chip is a real `<a>`
 * pointing at `/p/<projectId>#<id>`, and a delegated click listener
 * short-circuits the same-page case into a smooth-scroll + focus instead of a
 * full reload — a lane on a DIFFERENT project's page (not in this document)
 * falls through to the anchor's own href.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const IDLE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  activity: [],
  flightLog: [],
  tasks: [],
};

function flyingProject(id: string, name: string) {
  return {
    ...IDLE_PROJECT,
    id,
    slug: name.toLowerCase(),
    name,
    status: 'flying',
    activity: [
      {
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        at: 1,
        firingId: 'f-' + id,
      },
    ],
  };
}

function multiLaneFlyingProject(id: string, name: string) {
  return {
    ...IDLE_PROJECT,
    id,
    slug: name.toLowerCase(),
    name,
    status: 'flying',
    activity: [
      {
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        at: 2,
        firingId: 'f-' + id + '-1',
      },
      {
        tool: 'Edit',
        target: 'src/index.ts',
        kind: 'file',
        phase: 'do',
        at: 1,
        firingId: 'f-' + id + '-2',
      },
    ],
  };
}

function stateWith(projects: unknown[]) {
  return {
    generatedAt: 1,
    totals: {
      projects: projects.length,
      flying: projects.filter((p) => (p as { status: string }).status === 'flying').length,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects,
    empty: false,
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

function click(el: Element): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe('the "flying now" chip links to its lane card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the chip an href pointing at the project + a same-page fragment', async () => {
    boot(stateWith([flyingProject('p1', 'Alpha')]));
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.live-worker-chip') as HTMLAnchorElement;
    expect(chip.tagName).toBe('A');
    expect(chip.getAttribute('href')).toMatch(/^\/p\/p1#lane-/);

    const targetId = chip.getAttribute('data-lane-target');
    expect(targetId).toBeTruthy();
    const target = document.getElementById(targetId!);
    expect(target).not.toBeNull();
    expect(target).toBe(document.querySelector('.live-worker'));
  });

  it('scrolls to and focuses the single-lane .live-worker card in place, without navigating', async () => {
    boot(stateWith([flyingProject('p1', 'Alpha')]));
    await vi.advanceTimersByTimeAsync(1);

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const chip = document.querySelector('.live-worker-chip')!;
    const card = document.querySelector('.live-worker') as HTMLElement;
    const event = click(chip);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(card);
  });

  it('gives every concurrent lane card its own id and links the right chip to it', async () => {
    boot(stateWith([multiLaneFlyingProject('p1', 'Alpha')]));
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.live-worker-chip')) as HTMLAnchorElement[];
    expect(chips.length).toBe(2);
    const cards = Array.from(document.querySelectorAll('.lane-card')) as HTMLElement[];
    expect(cards.length).toBe(2);

    const targetIds = chips.map((c) => c.getAttribute('data-lane-target'));
    expect(new Set(targetIds).size).toBe(2);

    Element.prototype.scrollIntoView = vi.fn();
    for (const [i, chip] of chips.entries()) {
      const targetId = targetIds[i]!;
      const target = document.getElementById(targetId);
      expect(target).not.toBeNull();
      expect(target!.classList.contains('lane-card')).toBe(true);
      const event = click(chip);
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(target);
    }
  });

  it('leaves navigation to the href when the chip names a lane not on this page', async () => {
    boot(stateWith([flyingProject('p1', 'Alpha')]));
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.live-worker-chip')!;
    chip.setAttribute('data-lane-target', 'lane-does-not-exist');
    const event = click(chip);

    expect(event.defaultPrevented).toBe(false);
  });
});
