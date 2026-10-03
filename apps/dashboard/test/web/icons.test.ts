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
import { STRINGS } from '@autopilot/tokens';
import { ICON_SHAPES, ICON_NAMES, iconSvg } from '../../src/web/icons.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

// vitest's root is the repo root, and under jsdom import.meta.url is an
// http: URL (not file:), so resolve from cwd (icon-system-emoji-census.test.ts).
const SRC_DIR = join(process.cwd(), 'apps/dashboard/src');

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/** Every dashboard source file but the icon data itself, comments stripped —
 *  a doc comment naming an icon is not a render site. */
function sourceOutsideIconData(): string {
  return readdirSync(SRC_DIR, { recursive: true })
    .map((f) => String(f))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('icons.ts'))
    .map((f) => stripComments(readFileSync(join(SRC_DIR, f), 'utf8')))
    .join('\n');
}

/** The opening a hand-inlined 24-unit icon starts with. `iconSvg` prints
 *  `<svg class="icon …" viewBox=…`, so a vendored icon never matches, and the
 *  charts and the QR code draw other viewBoxes. */
const HAND_INLINED_ICON = /<svg viewBox="0 0 24 24"/g;

/** Each web/ file that still prints its own 24-unit icon markup, as
 *  `file: count` with `/` separators, so the list reads the same on every disk. */
function handInlinedIconSites(): string[] {
  const webDir = join(SRC_DIR, 'web');
  const sites: string[] = [];
  for (const entry of readdirSync(webDir, { recursive: true })) {
    const file = String(entry).replaceAll('\\', '/');
    if (!file.endsWith('.ts') || file === 'icons.ts') continue;
    const code = stripComments(readFileSync(join(webDir, file), 'utf8'));
    const count = code.match(HAND_INLINED_ICON)?.length ?? 0;
    if (count > 0) sites.push(`${file}: ${count}`);
  }
  return sites.sort();
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

// Law 1 names icons.ts as the one place an icon's path lives, yet the Ask
// sheet's and the terminal HUD's close buttons each printed a hand-copied x
// beside the snackbar's vendored one. They print the vendored x now, sized by
// CSS at the pixel size their width/height attributes used to give them.
describe('server-printed chrome draws vendored icons (law 1)', () => {
  it('the Ask sheet and terminal HUD close buttons print the vendored x and keep their names', () => {
    const page = new DOMParser().parseFromString(renderShell(), 'text/html');
    for (const id of ['ask-sheet-close', 'terminal-hud-close']) {
      const button = page.getElementById(id) as HTMLButtonElement;
      expect(button, id).not.toBeNull();
      expect(button.children, id).toHaveLength(1);
      const icon = button.querySelector('svg.icon.icon-x');
      expect(icon, id).not.toBeNull();
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
      expect(icon!.hasAttribute('width'), id).toBe(false);
      expect(button.textContent, id).toBe('');
      expect(button.getAttribute('aria-label'), id).toBeTruthy();
      expect(button.getAttribute('data-i18n-aria'), id).toBeTruthy();
    }
  });

  it('sizes each close icon from the type scale at its old pixel size', () => {
    const css = layoutCss();
    expect(css).toContain(
      '.ask-sheet-close > .icon { inline-size: 1.25rem; block-size: 1.25rem; }',
    );
    expect(css).toContain(
      '.terminal-hud-close > .icon { inline-size: 1.125rem; block-size: 1.125rem; }',
    );
  });

  // The Ask button printed Feather's message-circle by hand at 24px; it draws
  // Lucide's vendored one now, sized by CSS at the same 1.5rem.
  it('the Ask button prints the vendored message-circle and keeps its name', () => {
    const page = new DOMParser().parseFromString(renderShell(), 'text/html');
    const button = page.getElementById('ask-fab') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.children).toHaveLength(1);
    const icon = button.querySelector('svg.icon.icon-message-circle');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute('aria-hidden')).toBe('true');
    expect(icon!.hasAttribute('width')).toBe(false);
    expect(button.textContent).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Ask');
    expect(button.getAttribute('data-i18n-aria')).toBe('askFab');
    expect(layoutCss()).toContain('.ask-fab > .icon { inline-size: 1.5rem; block-size: 1.5rem; }');
  });

  // The rail's focus toggle printed Feather's maximize by hand; Lucide's is
  // the same four corners, so it draws the vendored one, still sized by the
  // rail's `.subject-link svg` rule beside the link icons.
  it('the focus toggle prints the vendored maximize and keeps its label', () => {
    const page = new DOMParser().parseFromString(renderShell(), 'text/html');
    const button = page.getElementById('focus-toggle') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.children).toHaveLength(2);
    const icon = button.firstElementChild!;
    expect(icon.matches('svg.icon.icon-maximize')).toBe(true);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.hasAttribute('width')).toBe(false);
    expect(button.querySelector('span[data-i18n="focusMode"]')?.textContent).toBe('Focus');
    expect(button.textContent).toBe('Focus');
    expect(layoutCss()).toContain(
      '.subject-link svg { inline-size: 1.375rem; block-size: 1.375rem;',
    );
  });

  // The rail's three link builders printed a hand-copied Feather table; each
  // place draws its vendored Lucide shape now, still sized by the rail's
  // `.subject-link svg` and the tab row's `.project-tab svg` rules.
  it('every rail link and project tab prints its vendored icon beside its label', () => {
    const RAIL: Record<string, string> = {
      fleet: 'layout-grid',
      fly: 'send',
      keeper: 'inbox',
      community: 'users',
      benchmark: 'chart-scatter',
    };
    const TABS: Record<string, string> = {
      fleet: 'layout-grid',
      board: 'square-kanban',
      keeper: 'inbox',
      plan: 'git-branch',
      docs: 'book-open',
      data: 'chart-no-axes-column',
    };
    const fleetPage = new DOMParser().parseFromString(renderShell(), 'text/html');
    const projectPage = new DOMParser().parseFromString(renderShell('alpha'), 'text/html');
    const cases: [Element[], Record<string, string>, string][] = [
      [
        [...fleetPage.querySelectorAll('#subject-nav a[data-subject-link]')],
        RAIL,
        'data-subject-link',
      ],
      [
        [...projectPage.querySelectorAll('#subject-nav a[data-global-link]')],
        RAIL,
        'data-global-link',
      ],
      [[...projectPage.querySelectorAll('#project-tabs a')], TABS, 'data-subject-link'],
    ];
    for (const [links, icons, attr] of cases) {
      expect(links.map((a) => a.getAttribute(attr))).toEqual(Object.keys(icons));
      for (const link of links) {
        const name = icons[link.getAttribute(attr)!]!;
        expect(ICON_NAMES, name).toContain(name);
        expect(link.children, name).toHaveLength(2);
        const icon = link.firstElementChild!;
        expect(icon.matches(`svg.icon.icon-${name}`), name).toBe(true);
        expect(icon.getAttribute('aria-hidden')).toBe('true');
        expect(icon.hasAttribute('width'), name).toBe(false);
        expect(link.lastElementChild!.matches('span[data-i18n]'), name).toBe(true);
      }
    }
    const css = layoutCss();
    expect(css).toContain('.subject-link svg { inline-size: 1.375rem; block-size: 1.375rem;');
    expect(css).toContain('.project-tab svg { inline-size: 1.125rem; block-size: 1.125rem;');
  });

  // The lucky button printed a filled, hand-drawn clover; it draws Lucide's
  // stroke clover now, still sized and spun by the `#fly-lucky svg` rules.
  it('the lucky button prints the vendored clover and keeps its name', () => {
    const page = new DOMParser().parseFromString(renderShell(), 'text/html');
    const button = page.getElementById('fly-lucky') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.children).toHaveLength(1);
    const icon = button.querySelector('svg.icon.icon-clover');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute('aria-hidden')).toBe('true');
    expect(icon!.getAttribute('fill')).toBe('none');
    expect(icon!.hasAttribute('width')).toBe(false);
    expect(button.textContent).toBe('');
    expect(button.getAttribute('aria-label')).toBe(STRINGS.en.flyLuckyAria);
    expect(button.getAttribute('data-i18n-aria')).toBe('flyLuckyAria');
    expect(layoutCss()).toContain('#fly-lucky svg { inline-size: 1.35em; block-size: 1.35em;');
  });

  // Every web/ file draws its icons through the vendored set now.
  it('hand-inlines no 24-unit icon outside the vendored set', () => {
    expect(handInlinedIconSites()).toEqual([]);
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

  // Epic 0026's row anatomy: a leading status glyph (an icon, epic 0025).
  // The pill keeps its word, tip and accessible name; the glyph is decorative.
  it('each status pill leads with its status glyph, and a locale switch keeps it', async () => {
    const GLYPHS: Record<string, string> = {
      queued: 'circle',
      in_progress: 'circle-dot',
      done: 'circle-check',
      needs_approval: 'circle-question-mark',
      deferred: 'circle-pause',
    };
    const tasks = Object.keys(GLYPHS).map((status) => ({
      id: 's-' + status,
      title: 'Status ' + status,
      status,
      at: 1,
    }));
    const state = { ...STATE, projects: [{ ...PROJECT, tasks }] };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => state,
    })) as unknown as typeof fetch;
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-task-id="s-deferred"]')).not.toBeNull();
    });
    const pillOf = (status: string) =>
      document.querySelector(`[data-task-id="s-${status}"] .pill.task-${status}`) as HTMLElement;
    for (const [status, glyph] of Object.entries(GLYPHS)) {
      expect(ICON_NAMES, glyph).toContain(glyph);
      const pill = pillOf(status);
      const icon = pill.firstElementChild as Element;
      expect(icon.tagName.toLowerCase(), status).toBe('svg');
      expect(icon.classList.contains('icon-' + glyph), status).toBe(true);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(pill.querySelectorAll('svg')).toHaveLength(1);
      expect(pill.textContent, status).toBe(STRINGS.en[TASK_STATUS_KEYS[status]!]);
    }

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const [status, glyph] of Object.entries(GLYPHS)) {
      const pill = pillOf(status);
      expect(pill.firstElementChild?.classList.contains('icon-' + glyph), status).toBe(true);
      expect(pill.textContent, status).toBe(STRINGS.he[TASK_STATUS_KEYS[status]!]);
    }
  });

  // Epic 0025 slice 3 (status pills): the fleet card's project-status pill
  // leads with the same circle family, so "flying" reads like an in-progress
  // task and "needs you" like one awaiting your decision.
  it('each project status pill leads with its status glyph, and a locale switch keeps it', async () => {
    const GLYPHS: Record<string, string> = {
      registered: 'circle',
      flying: 'circle-dot',
      paused: 'circle-pause',
      hibernating: 'moon',
      needs_you: 'circle-question-mark',
    };
    const projects = Object.keys(GLYPHS).map((status) => ({
      ...PROJECT,
      id: 'p-' + status,
      slug: 'p-' + status,
      name: 'Project ' + status,
      status,
      tasks: [],
    }));
    const state = { ...STATE, totals: { ...STATE.totals, projects: projects.length }, projects };
    // The task-row test above leaves Hebrew saved; start from English.
    localStorage.clear();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => state,
    })) as unknown as typeof fetch;
    new Function(clientJs())();

    const pillOf = (status: string) =>
      document.querySelector(`.card-head .pill.pill-${status}`) as HTMLElement;
    await vi.waitFor(() => {
      for (const status of Object.keys(GLYPHS)) expect(pillOf(status), status).not.toBeNull();
    });
    for (const [status, glyph] of Object.entries(GLYPHS)) {
      expect(ICON_NAMES, glyph).toContain(glyph);
      const pill = pillOf(status);
      const icon = pill.firstElementChild as Element;
      expect(icon.tagName.toLowerCase(), status).toBe('svg');
      expect(icon.classList.contains('icon-' + glyph), status).toBe(true);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(pill.querySelectorAll('svg')).toHaveLength(1);
      expect(pill.textContent, status).toBe(STRINGS.en[PROJECT_STATUS_KEYS[status]!]);
    }

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const [status, glyph] of Object.entries(GLYPHS)) {
      const pill = pillOf(status);
      expect(pill.firstElementChild?.classList.contains('icon-' + glyph), status).toBe(true);
      expect(pill.textContent, status).toBe(STRINGS.he[PROJECT_STATUS_KEYS[status]!]);
    }
  });
});

const PROJECT_STATUS_KEYS: Record<string, keyof typeof STRINGS.en> = {
  registered: 'projectStatusRegistered',
  flying: 'projectStatusFlying',
  paused: 'projectStatusPaused',
  hibernating: 'projectStatusHibernating',
  needs_you: 'projectStatusNeedsYou',
};

const TASK_STATUS_KEYS: Record<string, keyof typeof STRINGS.en> = {
  queued: 'taskStatusQueued',
  in_progress: 'taskStatusInProgress',
  done: 'taskStatusDone',
  needs_approval: 'taskStatusNeedsApproval',
  deferred: 'taskStatusDeferred',
};
