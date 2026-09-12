// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE APP SHELL'S LAWS (epic 0021), pinned mechanically.
 *
 * The dashboard had zero responsive breakpoints, a flat stack of fourteen
 * body-level sections, one panel with no stylesheet at all, and tap targets
 * under the WCAG 2.5.8 floor — and its only responsive test measured the
 * one thing that was fine (horizontal overflow). These tests pin the
 * structure the fix rests on so the next panel cannot quietly opt out:
 * mobile-first queries only, breakpoints from the token package, every
 * body-level section owned by a subject, the nav's anchors resolving to
 * real sections, and the client module actually switching subjects.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BREAKPOINT, mediaMin, STRINGS, LOCALE_NAMES } from '@autopilot/tokens';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell } from '../../src/web/shell.js';
import { subjectNavJs } from '../../src/web/features/subject-nav.js';
import { DEFERRED_OPERATOR_FEATURES, PROJECT_PAGE_FEATURES } from '../../src/web/chunks.js';

const css = layoutCss();
const SUBJECTS = ['fleet', 'fly', 'keeper', 'community'] as const;
const SUBJECT_KEYS = [
  'subjectNav',
  'subjectFleet',
  'subjectOverview',
  'subjectBoard',
  'subjectPlan',
  'subjectDocs',
  'subjectData',
  'subjectFly',
  'subjectKeeper',
  'subjectCommunity',
  'subjectEmpty',
  'focusMode',
  'focusModeTip',
  'focusExit',
  'paletteOpen',
  'paletteTitle',
  'palettePlaceholder',
  'paletteEmpty',
  'paletteGoTo',
  'paletteOpenProject',
  'paletteTheme',
  'paletteLanguage',
  'paletteSearch',
  'contextRail',
  'contextRailEmpty',
] as const;

/** The client bundle's `tr()` lives in core (locale.ts); the shell module
 *  reads it as a free global, so the tests give it a transparent one. */
function stubTranslator(): void {
  (globalThis as unknown as { tr: unknown }).tr = (key: string, subs?: Record<string, string>) =>
    subs ? `${key}:${Object.values(subs).join(',')}` : key;
}

// jsdom's document.open()/write() keeps every listener registered on the
// `document` and `window` objects themselves (matching browsers), so each
// boot() below would leave its Ctrl+K and hashchange handlers behind for
// the next test — and a toggle shortcut fired through an even number of
// stale handlers opens and re-closes the palette in one keystroke. Track
// what the module attaches and strip it after each test (the a11y harness
// does the same, for the same reason).
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}
function stripTrackedListeners(): void {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
}

function tagFor(html: string, id: string): string | undefined {
  return html.match(new RegExp(`<(?:section|nav|main)(?: [^>]*)? id="${id}"[^>]*>`))?.[0];
}

describe('layout-css — mobile-first laws', () => {
  it('uses the token package breakpoints, so the stylesheet and the tests read one width', () => {
    expect(css).toContain(mediaMin('md'));
    expect(css).toContain(mediaMin('lg'));
    expect(css).toContain(mediaMin('xl'));
    expect(BREAKPOINT.md).toBe('48rem');
    expect(BREAKPOINT.lg).toBe('64rem');
  });

  it('adds at width — no max-width media query anywhere', () => {
    expect(css).not.toMatch(/@media[^{]*max-width/);
  });

  it('hides an inactive subject through one state attribute only the nav module sets', () => {
    // No range query and no width-keyed hide rule: which subjects exist is
    // the nav's business, and without the module nothing is hidden at all.
    expect(css).not.toMatch(/@media \(width </);
    expect(css).toContain('[data-subject-inactive="true"] { display: none !important; }');
  });

  it('gives every pointer target the WCAG 2.5.8 floor, and 44px under a coarse pointer', () => {
    expect(css).toContain('button, summary, select, [role="button"] { min-block-size: 1.5rem; }');
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(coarse).toContain('min-block-size: 2.75rem');
    // iOS Safari zooms a focused input under 16px — the coarse block lifts inputs to ≥1rem.
    expect(coarse).toContain('font-size: max(1rem, var(--text-sm))');
  });

  it('styles the good-first-issues panel — it had no rules at all before epic 0021', () => {
    expect(css).toMatch(
      /\.contributor-issue-list-panel \{[^}]*background: var\(--color-surface-raised\)/,
    );
    expect(css).toMatch(/\.contributor-issue-list-number \{[^}]*color: var\(--color-accent\)/);
  });

  it('shares one inline edge across body-level sections via --page-inline', () => {
    expect(css).toContain(':root { --page-inline: var(--space-3)');
    for (const sel of ['.masthead', '.totals', '.stat-tiles', '.flightbar', '.searchbar']) {
      const rule = css.slice(css.indexOf(`\n${sel} {`));
      expect(rule.slice(0, rule.indexOf('}')), `${sel} pads with --page-inline`).toContain(
        'var(--page-inline)',
      );
    }
    expect(css).toMatch(
      /body > \.pool-client-panel[^{]*\{ margin-inline: var\(--page-inline\); \}/,
    );
  });

  it('places the subject nav as a bottom bar at base and a rail from md', () => {
    expect(css).toMatch(/\.subject-nav \{\s*position: fixed; inset-block-end: 0; inset-inline: 0;/);
    const md = css.slice(css.indexOf(mediaMin('md')));
    expect(md).toMatch(
      /\.subject-nav \{\s*inset-block: 0; inset-inline-end: auto; inline-size: var\(--shell-rail-size\)/,
    );
    expect(md).toContain(
      'body { padding-block-end: 0; padding-inline-start: var(--shell-rail-size); }',
    );
  });
});

describe('renderShell — every section belongs to a subject', () => {
  const html = renderShell();

  it('renders the body with the default subject and a nav of the four subjects', () => {
    expect(html).toContain('<body data-subject="fleet">');
    expect(html).toContain(
      '<nav class="subject-nav" id="subject-nav" aria-label="Sections" data-i18n-aria="subjectNav">',
    );
    for (const s of SUBJECTS) expect(html).toContain(`data-subject-link="${s}"`);
    expect(html).toContain('data-subject-link="fleet" aria-current="page"');
  });

  it('tags every body-level section with its subject', () => {
    const owned: Record<string, (typeof SUBJECTS)[number]> = {
      totals: 'fleet',
      'live-workers': 'fleet',
      'stat-tiles': 'fleet',
      fleet: 'fleet',
      flightbar: 'fly',
      searchbar: 'fly',
      'pr-review-panel': 'keeper',
      'pool-client-panel': 'keeper',
      'fleet-wisdom': 'keeper',
      'contributor-issue-list-panel': 'community',
      'publicity-panel': 'community',
      'contributor-standing-panel': 'community',
    };
    for (const [id, subject] of Object.entries(owned)) {
      const tag = tagFor(html, id);
      expect(tag, `#${id} exists`).toBeDefined();
      expect(tag, `#${id} → ${subject}`).toContain(`data-subject="${subject}"`);
    }
  });

  it('gives every body-level section class at least one stylesheet rule', () => {
    // The good-first-issues panel shipped for weeks with ZERO rules —
    // browser-blue links flush to the viewport edge — and nothing said a
    // word. This is the structural stop: a body-level section is a
    // designed surface, and a designed surface has a rule.
    const classes = [...html.matchAll(/\n {2}<(?:section|nav|main|p) class="([a-z-]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(classes.length).toBeGreaterThan(10);
    for (const cls of classes) {
      expect(css, `.${cls} is styled`).toMatch(new RegExp(`(^|[\\s,])\\.${cls}[\\s,{:>]`, 'm'));
    }
  });

  it('points every nav anchor at a section its own subject owns (no dead ends)', () => {
    const links = [...html.matchAll(/href="#([^"]+)" data-subject-link="([a-z]+)"/g)];
    expect(links).toHaveLength(4);
    for (const [, id, subject] of links) {
      expect(tagFor(html, id!), `#${id} for ${subject}`).toContain(`data-subject="${subject}"`);
    }
  });

  it('a project page has six subjects (0018 tabs) and is marked as tabs at every width', () => {
    const project = renderShell('demo');
    expect(html).toContain('data-i18n="subjectFleet"');
    expect(project).toContain(
      '<body data-project="demo" data-subject="fleet" data-subject-mode="tabs">',
    );
    const links = [...project.matchAll(/data-subject-link="([a-z]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(['fleet', 'board', 'keeper', 'plan', 'docs', 'data']);
    for (const key of [
      'subjectOverview',
      'subjectBoard',
      'subjectPlan',
      'subjectDocs',
      'subjectData',
    ]) {
      expect(project).toContain(`data-i18n="${key}"`);
    }
    // main#fleet is the CONTAINER of a project page's subjects, not one of them;
    // the fly sections join Overview there and the community sections join Keeper.
    expect(tagFor(project, 'fleet')).not.toContain('data-subject=');
    expect(tagFor(html, 'fleet')).toContain('data-subject="fleet"');
    expect(tagFor(project, 'flightbar')).toContain('data-subject="fleet"');
    expect(tagFor(project, 'contributor-standing-panel')).toContain('data-subject="keeper"');
  });

  it('carries every subject string in every locale', () => {
    for (const key of SUBJECT_KEYS) {
      for (const locale of LOCALE_NAMES)
        expect(STRINGS[locale][key], `${locale}.${key}`).toBeTruthy();
    }
  });

  it('renders the context rail on the fleet page only, hidden until the nav module fills it', () => {
    expect(html).toMatch(/<aside class="context-rail" id="context-rail"[^>]* hidden>/);
    expect(html).toContain('data-i18n="contextRailEmpty"');
    expect(renderShell('demo')).not.toContain('id="context-rail"');
    expect(css).toContain('.context-rail {');
    expect(css).toContain('body[data-rail="on"] > .context-rail');
  });

  it('ships the nav module in the DEFERRED chunk — self-initializing, nothing in core calls it', () => {
    expect(DEFERRED_OPERATOR_FEATURES).toContain('subject-nav');
    expect(PROJECT_PAGE_FEATURES).not.toContain('subject-nav');
  });
});

describe('subject-nav client — switching subjects', () => {
  let stacked = false;
  let wide = false;
  let mqListeners: Array<[string, () => void]> = [];

  beforeEach(() => {
    document.open();
    document.write(renderShell());
    document.close();
    window.localStorage.clear();
    stacked = false;
    wide = false;
    mqListeners = [];
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
      get matches() {
        return query.includes('80rem') ? wide : stacked;
      },
      addEventListener: (_type: string, fn: () => void) => {
        mqListeners.push([query, fn]);
      },
    });
    (window as unknown as { scrollTo: unknown }).scrollTo = () => {};
    stubTranslator();
  });
  afterEach(async () => {
    // jsdom defers an anchor's fragment navigation to a later task (a real
    // browser navigates synchronously on click). Flush it here so the
    // stacked-regime test's un-prevented click cannot land its hash change
    // inside a later test.
    await new Promise((r) => setTimeout(r, 0));
    window.location.hash = '';
    await new Promise((r) => setTimeout(r, 0));
    stripTrackedListeners();
  });

  function boot(): void {
    new Function(subjectNavJs())();
  }
  function link(name: string): HTMLAnchorElement {
    return document.querySelector(`[data-subject-link="${name}"]`) as HTMLAnchorElement;
  }
  function tap(name: string): MouseEvent {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    link(name).dispatchEvent(ev);
    return ev;
  }

  it('boots into the fleet subject and marks its link current', () => {
    // Server-rendered markup carries no data-nav: without the script every
    // subject is on the page. Boot is what turns the one-subject rule on.
    expect(document.body.dataset['nav']).toBeUndefined();
    boot();
    expect(document.body.dataset['nav']).toBe('on');
    expect(document.body.dataset['subject']).toBe('fleet');
    expect(link('fleet').getAttribute('aria-current')).toBe('page');
    expect(link('fly').getAttribute('aria-current')).toBeNull();
  });

  it('a tap on Fly switches the subject below lg without navigating', () => {
    boot();
    const ev = tap('fly');
    expect(ev.defaultPrevented).toBe(true);
    expect(document.body.dataset['subject']).toBe('fly');
    expect(link('fly').getAttribute('aria-current')).toBe('page');
    expect(window.localStorage.getItem('ap-subject')).toBe('fly');
    // The inactive subjects leave the page through the one state attribute.
    expect(document.getElementById('totals')?.getAttribute('data-subject-inactive')).toBe('true');
    expect(document.getElementById('flightbar')?.hasAttribute('data-subject-inactive')).toBe(false);
  });

  it('from lg up on the fleet page nothing is marked inactive — every subject stacks', () => {
    stacked = true;
    boot();
    tap('keeper');
    expect(document.querySelector('[data-subject-inactive]')).toBeNull();
  });

  it('from xl the fleet page gains the context rail — lanes and the Keeper queue move beside the reader, and back below it', () => {
    stacked = true;
    wide = true;
    boot();
    const rail = document.getElementById('context-rail')!;
    expect(rail.hidden).toBe(false);
    expect(document.body.dataset['rail']).toBe('on');
    for (const id of ['live-workers', 'pr-review-panel', 'pool-client-panel']) {
      expect(document.getElementById(id)!.parentElement, id).toBe(rail);
    }
    expect(document.getElementById('totals')!.parentElement).toBe(document.body);
    // Every railed section is hidden in this fixture: the rail says so.
    expect((rail.querySelector('.context-rail-empty') as HTMLElement).hidden).toBe(false);
    // Nothing is marked inactive — the rail's sections are part of the stacked page.
    expect(document.querySelector('[data-subject-inactive]')).toBeNull();

    // The window narrows: every section returns to where the server put it, in order.
    wide = false;
    for (const [query, fn] of mqListeners) if (query.includes('80rem')) fn();
    expect(rail.hidden).toBe(true);
    expect(document.body.dataset['rail']).toBeUndefined();
    const ids = Array.from(document.body.children)
      .map((k) => k.id)
      .filter(Boolean);
    expect(ids.indexOf('live-workers')).toBe(ids.indexOf('totals') + 1);
    expect(ids.indexOf('pr-review-panel')).toBe(ids.indexOf('stat-tiles') + 1);
    expect(ids.indexOf('pool-client-panel')).toBe(ids.indexOf('pr-review-panel') + 1);
  });

  it("the rail's empty line yields the moment a railed section shows content", () => {
    stacked = true;
    wide = true;
    boot();
    const rail = document.getElementById('context-rail')!;
    const empty = rail.querySelector('.context-rail-empty') as HTMLElement;
    expect(empty.hidden).toBe(false);
    document.getElementById('live-workers')!.hidden = false;
    // The hidden-attribute observer re-marks on the next microtask/task.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(empty.hidden).toBe(true);
        resolve();
      }, 0);
    });
  });

  it('a project page never grows a rail, however wide', () => {
    document.open();
    document.write(renderShell('demo'));
    document.close();
    stacked = true;
    wide = true;
    boot();
    expect(document.getElementById('context-rail')).toBeNull();
    expect(document.body.dataset['rail']).toBeUndefined();
  });

  it('a project page is tabs at every width: a wide window still shows one subject', () => {
    document.open();
    document.write(renderShell('demo'));
    document.close();
    stacked = true;
    boot();
    const ev = tap('docs');
    expect(ev.defaultPrevented).toBe(true);
    expect(document.body.dataset['subject']).toBe('docs');
    expect(document.getElementById('totals')?.getAttribute('data-subject-inactive')).toBe('true');
  });

  it('focus mode hides the chrome through one body attribute and Escape brings it back', () => {
    boot();
    const toggle = document.getElementById('focus-toggle') as HTMLButtonElement;
    const exit = document.getElementById('focus-exit') as HTMLButtonElement;
    expect(exit.hidden).toBe(true);
    toggle.click();
    expect(document.body.dataset['focus']).toBe('on');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(exit.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.dataset['focus']).toBeUndefined();
    expect(exit.hidden).toBe(true);
    // Never persisted: nothing about focus reaches localStorage.
    expect(window.localStorage.getItem('ap-focus')).toBeNull();
  });

  it('Ctrl+K opens the palette with the page’s places and actions, typing filters, Enter runs', () => {
    document.open();
    document.write(renderShell('demo'));
    document.close();
    stubTranslator();
    boot();
    const dialog = document.getElementById('palette') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    expect(dialog.hasAttribute('open')).toBe(true);
    const labels = () =>
      [...document.querySelectorAll('#palette-list li')].map((li) => li.textContent);
    expect(labels()).toEqual(
      expect.arrayContaining(['paletteGoTo:Docs', 'paletteTheme:dark', 'focusMode', 'tour']),
    );

    const input = document.getElementById('palette-input') as HTMLInputElement;
    input.value = 'docs';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(labels()).toEqual(['paletteGoTo:Docs']);
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-opt-0');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.body.dataset['subject']).toBe('docs');
  });

  it('the masthead offers ⌘K from md and the shell carries one dialog for it', () => {
    const html = renderShell();
    expect(html).toContain('id="palette-btn"');
    expect(html).toContain('<dialog class="palette" id="palette" aria-labelledby="palette-title">');
    expect(html).toContain('role="combobox"');
    expect(css).toContain('.palette-btn { display: none;');
    expect(css.slice(css.indexOf(mediaMin('md')))).toContain(
      '.palette-btn { display: inline-flex;',
    );
    expect(css).toContain('body[data-focus="on"] .masthead, body[data-focus="on"] .subject-nav');
  });

  it('the Keeper place shows how many things wait on a human, and says so to a reader', async () => {
    const panel = document.getElementById('pr-review-panel') as HTMLElement;
    panel.hidden = false;
    panel.innerHTML = '<div class="pr-review-item"></div><div class="pr-review-item"></div>';
    boot();
    const badge = link('keeper').querySelector('.subject-badge') as HTMLElement;
    expect(badge.textContent).toBe('2');
    expect(badge.hidden).toBe(false);
    expect(link('keeper').getAttribute('aria-label')).toBe('Keeper, keeperWaiting:2');
    // The panel empties on a later poll; the observer recounts.
    panel.hidden = true;
    await new Promise((r) => setTimeout(r, 0));
    expect(badge.hidden).toBe(true);
    expect(link('keeper').getAttribute('aria-label')).toBe('Keeper');
  });

  it('re-marks the sections renderProjectPage rebuilds when the page announces them', () => {
    document.open();
    document.write(renderShell('demo'));
    document.close();
    boot();
    tap('board');
    const main = document.getElementById('fleet') as HTMLElement;
    const tasks = document.createElement('section');
    tasks.dataset['subject'] = 'board';
    const docs = document.createElement('section');
    docs.dataset['subject'] = 'docs';
    main.append(tasks, docs);
    document.dispatchEvent(new CustomEvent('ap:subjects-changed'));
    expect(tasks.hasAttribute('data-subject-inactive')).toBe(false);
    expect(docs.getAttribute('data-subject-inactive')).toBe('true');
  });

  it('from lg up the anchor jump IS the navigation — the click is not prevented', () => {
    stacked = true;
    boot();
    const ev = tap('keeper');
    expect(ev.defaultPrevented).toBe(false);
    expect(link('keeper').getAttribute('aria-current')).toBe('page');
  });

  it('a deep link lands on the subject that owns the anchored section', () => {
    window.location.hash = '#pool-client-panel';
    boot();
    expect(document.body.dataset['subject']).toBe('keeper');
  });

  it('says "nothing here yet" for a subject whose sections are all hidden, never on the fleet', () => {
    boot();
    // Every keeper section is server-rendered hidden until a poll fills it.
    tap('keeper');
    expect((document.getElementById('subject-empty') as HTMLElement).hidden).toBe(false);
    // data-empty (a style hook), never aria-disabled: the link still works.
    expect(link('keeper').getAttribute('data-empty')).toBe('true');
    expect(link('keeper').hasAttribute('aria-disabled')).toBe(false);
    tap('fleet');
    expect((document.getElementById('subject-empty') as HTMLElement).hidden).toBe(true);
  });

  it('an identical tick writes nothing — the hidden-attribute observer cannot loop', async () => {
    boot();
    const writes: MutationRecord[] = [];
    const nav = document.getElementById('subject-nav') as HTMLElement;
    const mo = new MutationObserver((records) => writes.push(...records));
    mo.observe(nav, { attributes: true, subtree: true, attributeOldValue: true });
    (document.getElementById('pool-client-panel') as HTMLElement).hidden = true; // already hidden
    await new Promise((r) => setTimeout(r, 0));
    mo.disconnect();
    expect(
      writes.map(
        (r) =>
          ((r.target as Element).getAttribute('data-subject-link') ??
            (r.target as Element).tagName) +
          ' ' +
          r.attributeName +
          ' was=' +
          r.oldValue +
          ' now=' +
          (r.target as Element).getAttribute(r.attributeName!),
      ),
    ).toEqual([]);
  });
});
