// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ICON SYSTEM (epic 0025 slice 1): the vendored set is data both sides
 * build from; the server printer is decorative, currentColor, escaped; the
 * client builds the same icon with createElementNS; the board's glyphs are
 * icons now — no emoji left in the task row's chrome.
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_SHAPES, ICON_NAMES, iconSvg } from '../../src/web/icons.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

// vitest's root is the repo root, and under jsdom import.meta.url is an
// http: URL (not file:), so resolve from cwd (icon-system-emoji-census.test.ts).
const SRC_DIR = join(process.cwd(), 'apps/dashboard/src');

/** Every dashboard source file but the icon data itself, comments stripped —
 *  a doc comment naming an icon is not a render site. */
function sourceOutsideIconData(): string {
  return readdirSync(SRC_DIR, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('icons.ts'))
    .map((f) =>
      readFileSync(join(SRC_DIR, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n'),
    )
    .join('\n');
}

describe('the vendored icon set', () => {
  it('names every icon the board uses and each carries at least one shape', () => {
    for (const name of [
      'target',
      'flame',
      'inbox',
      'clipboard-list',
      'sparkles',
      'trash-2',
      'triangle-alert',
      'grip-vertical',
    ]) {
      expect(ICON_NAMES, name).toContain(name);
      expect(ICON_SHAPES[name]!.length).toBeGreaterThan(0);
    }
  });

  it('every shape is a known SVG element with string attributes only', () => {
    const tags = new Set(['path', 'circle', 'line', 'polyline', 'rect']);
    for (const [name, shapes] of Object.entries(ICON_SHAPES)) {
      for (const [tag, attrs] of shapes) {
        expect(tags.has(tag), `${name}: ${tag}`).toBe(true);
        for (const v of Object.values(attrs)) expect(typeof v).toBe('string');
      }
    }
  });

  it('vendors only what is used (law 1): every shape is named by a render site', () => {
    // ICON_SHAPES rides the core bundle as JSON, so a shape nothing draws is
    // shipped weight on every page load. A name counts once it appears as a
    // quoted literal anywhere in src/ — iconEl('x'), iconSvg('x'), a
    // panelHeading argument, or an `icon: 'x'` field in a data table. It is a
    // floor, not an exact count: a common word ('search', 'clock') can also
    // match a non-icon literal, but a name nothing quotes at all is dead.
    const source = sourceOutsideIconData();
    const unused = ICON_NAMES.filter(
      (name) => !["'", '"', '`'].some((q) => source.includes(q + name + q)),
    );
    expect(unused).toEqual([]);
  });

  it('the complete upstream licence travels with the vendored data', () => {
    expect(existsSync('LICENSES/ISC.txt')).toBe(true);
    const licence = readFileSync('LICENSES/ISC.txt', 'utf8');
    expect(licence).toContain('Lucide Icons and Contributors');
    expect(licence).toContain('Cole Bemis');
    expect(readFileSync('THANKS.md', 'utf8')).toContain('LICENSES/ISC.txt');
  });
});

describe('iconSvg — the server printer', () => {
  it('prints a decorative, currentColor stroke icon sized by CSS', () => {
    const svg = iconSvg('target', 'extra');
    expect(svg).toContain('class="icon icon-target extra"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('<circle cx="12" cy="12" r="10"/>');
    expect(svg).not.toContain(' width=');
    expect(svg).not.toContain(' height=');
  });

  it('escapes attribute values and renders nothing for an unknown name', () => {
    expect(iconSvg('nope')).toBe('');
    const shapes = ICON_SHAPES['flame']!;
    expect(shapes[0]![1]['d']).not.toContain('"');
  });
});

describe('the board row builds its glyphs as icons (no emoji)', () => {
  const PROJECT = {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'idle',
    createdAt: 1,
    fileCount: 1,
    totalBytes: 1,
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
    lastActivityAt: 1,
    activity: [],
    flightLog: [],
    tasks: [
      { id: 't1', title: 'Queued one', status: 'queued', at: 1, source: 'inbox' },
      { id: 't2', title: 'Proposed one', status: 'needs_approval', at: 1, source: 'self' },
      { id: 't3', title: 'Backlog one', status: 'needs_approval', at: 1, source: 'backlog' },
    ],
    rootPath: '/repo/alpha',
  };
  const STATE = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 2,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [PROJECT],
    empty: false,
  };

  it('focus, handle, delete and the source chips carry stroke icons and keep their words', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => STATE,
    })) as unknown as typeof fetch;
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-task-id="t1"]')).not.toBeNull();
    });
    const row = document.querySelector('[data-task-id="t1"]') as HTMLElement;
    expect(row.querySelector('.task-drag-handle svg.icon-grip-vertical')).not.toBeNull();
    expect(row.querySelector('.task-focus-btn svg.icon-target')).not.toBeNull();
    expect(row.querySelector('.task-focus-btn')?.textContent).toBe('');
    expect(row.querySelector('.chip-inbox svg.icon-inbox')).not.toBeNull();
    expect(row.querySelector('.chip-inbox')?.textContent).toBe('inbox');
    const proposed = document.querySelector('[data-task-id="t2"] .chip-proposed') as HTMLElement;
    expect(proposed.querySelector('svg.icon-sparkles')).not.toBeNull();
    expect(proposed.textContent).toBe('proposed');
    const backlog = document.querySelector('[data-task-id="t3"] .chip-backlog') as HTMLElement;
    expect(backlog.querySelector('svg.icon-clipboard-list')).not.toBeNull();
    expect(backlog.textContent).toBe('backlog');
    const del = document.querySelector('[data-task-id="t1"] .task-delete-btn') as HTMLElement;
    expect(del.querySelector('svg.icon-trash-2')).not.toBeNull();
    for (const glyph of ['🎯', '📥', '📋', '✦', '🗑', '⠿']) {
      expect(row.parentElement?.textContent ?? '').not.toContain(glyph);
    }
  });
});
