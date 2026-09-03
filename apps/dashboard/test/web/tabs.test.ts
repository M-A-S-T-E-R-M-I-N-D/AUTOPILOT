// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D2.13 "tabbed IA" (epic 0015, board web-mtdc6wuk-0exzb4) — direct unit and axe-core coverage
 * for `web/tabs.ts`'s pure APG tablist/tabpanel renderer, pure roving-focus model, and the
 * `tabsJs` client wiring text, the last exercised the same way `web/shell.ts`'s spliced
 * `clientJs()` gets tested elsewhere: `new Function(tabsJs())()` against a mounted fragment (see
 * the module header for why nothing in the real page calls any of it yet).
 */

import { describe, it, expect, afterEach } from 'vitest';
import axe from 'axe-core';
import {
  renderTabList,
  renderTabPanel,
  nextTabId,
  isTabRovingKey,
  tabId,
  tabPanelId,
  tabsJs,
  type TabDef,
} from '../../src/web/tabs.js';

const TABS: readonly TabDef[] = [
  { id: 'process', label: 'Process' },
  { id: 'evaluations', label: 'Evaluations' },
  { id: 'releases', label: 'Releases' },
  { id: 'runtime', label: 'Runtime' },
];

describe('tabId / tabPanelId', () => {
  it('prefixes the tab id and panel id distinctly, so they can never collide', () => {
    expect(tabId('process')).toBe('tab-process');
    expect(tabPanelId('process')).toBe('tab-panel-process');
  });
});

describe('renderTabList', () => {
  it('renders one role="tab" button per entry inside a labelled role="tablist"', () => {
    const html = renderTabList(TABS, 'process', 'Project sections');
    expect(html).toContain('role="tablist" aria-label="Project sections"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
  });

  it('marks only the active tab aria-selected and a real Tab stop', () => {
    const html = renderTabList(TABS, 'evaluations', 'Project sections');
    expect(html).toContain(
      '<button type="button" role="tab" id="tab-evaluations" aria-controls="tab-panel-evaluations" ' +
        'aria-selected="true" tabindex="0">Evaluations</button>',
    );
    expect(html).toContain(
      '<button type="button" role="tab" id="tab-process" aria-controls="tab-panel-process" ' +
        'aria-selected="false" tabindex="-1">Process</button>',
    );
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it('escapes a hostile label instead of injecting markup', () => {
    const html = renderTabList([{ id: 'x', label: '<script>alert(1)</script>' }], 'x', 'Tabs');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderTabPanel', () => {
  const tab: TabDef = { id: 'evaluations', label: 'Evaluations' };

  it('renders a labelled role="tabpanel" wrapping the given content', () => {
    const html = renderTabPanel(tab, 'evaluations', '<p>content</p>');
    expect(html).toBe(
      '<div class="tabpanel" role="tabpanel" id="tab-panel-evaluations" ' +
        'aria-labelledby="tab-evaluations" tabindex="0"><p>content</p></div>',
    );
  });

  it('carries the hidden attribute when it is not the active tab', () => {
    const html = renderTabPanel(tab, 'process', '<p>content</p>');
    expect(html).toContain(' hidden><p>content</p></div>');
  });
});

describe('isTabRovingKey', () => {
  it('accepts exactly Left/Right/Home/End', () => {
    expect(isTabRovingKey('ArrowLeft')).toBe(true);
    expect(isTabRovingKey('ArrowRight')).toBe(true);
    expect(isTabRovingKey('Home')).toBe(true);
    expect(isTabRovingKey('End')).toBe(true);
  });

  it('rejects everything else, including the tree sidebar’s Up/Down', () => {
    expect(isTabRovingKey('ArrowUp')).toBe(false);
    expect(isTabRovingKey('ArrowDown')).toBe(false);
    expect(isTabRovingKey('Enter')).toBe(false);
    expect(isTabRovingKey('')).toBe(false);
  });
});

describe('nextTabId', () => {
  it('moves one tab left/right, clamped at the ends (no wrap)', () => {
    expect(nextTabId(TABS, 'evaluations', 'ArrowRight')).toBe('releases');
    expect(nextTabId(TABS, 'evaluations', 'ArrowLeft')).toBe('process');
    expect(nextTabId(TABS, 'process', 'ArrowLeft')).toBe('process');
    expect(nextTabId(TABS, 'runtime', 'ArrowRight')).toBe('runtime');
  });

  it('jumps to the first/last tab on Home/End', () => {
    expect(nextTabId(TABS, 'evaluations', 'Home')).toBe('process');
    expect(nextTabId(TABS, 'evaluations', 'End')).toBe('runtime');
  });

  it('resolves an id absent from tabs (stale selection) to itself, not a throw', () => {
    expect(nextTabId(TABS, 'gone', 'ArrowRight')).toBe('gone');
    expect(nextTabId([], 'gone', 'Home')).toBe('gone');
  });
});

describe('tabsJs', () => {
  function mount(activeId: string): void {
    const root = document.createElement('div');
    root.innerHTML =
      renderTabList(TABS, activeId, 'Project sections') +
      TABS.map((tab) => renderTabPanel(tab, activeId, `<p>${tab.label} panel content</p>`)).join(
        '',
      );
    document.body.appendChild(root);
    new Function(tabsJs())();
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clicking a tab selects it, unhides its panel, and hides the rest', () => {
    mount('process');

    document.getElementById('tab-evaluations')!.click();

    expect(document.getElementById('tab-evaluations')!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-evaluations')!.getAttribute('tabindex')).toBe('0');
    expect(document.getElementById('tab-process')!.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('tab-process')!.getAttribute('tabindex')).toBe('-1');
    expect(document.getElementById('tab-panel-evaluations')!.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('tab-panel-process')!.hasAttribute('hidden')).toBe(true);
  });

  it('clicking the already-active tab is a no-op', () => {
    mount('process');
    document.getElementById('tab-process')!.click();
    expect(document.getElementById('tab-process')!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-panel-process')!.hasAttribute('hidden')).toBe(false);
  });

  it('clicking outside the tablist does nothing', () => {
    mount('process');
    document
      .getElementById('tab-panel-process')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('tab-process')!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-evaluations')!.getAttribute('aria-selected')).toBe('false');
  });

  it('ArrowRight moves the roving tabindex and activates (automatic activation)', () => {
    mount('process');
    const processTab = document.getElementById('tab-process')!;
    processTab.focus();

    processTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );

    expect(document.getElementById('tab-evaluations')!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-panel-evaluations')!.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('tab-panel-process')!.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('tab-evaluations'));
  });

  it('End jumps to the last tab; a clamped edge (no movement) does not re-activate', () => {
    mount('process');
    const processTab = document.getElementById('tab-process')!;
    processTab.focus();

    processTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('tab-runtime')!.getAttribute('aria-selected')).toBe('true');

    const runtimeTab = document.getElementById('tab-runtime')!;
    runtimeTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(runtimeTab);
    expect(document.getElementById('tab-panel-runtime')!.hasAttribute('hidden')).toBe(false);
  });

  it('ignores keys outside the roving set', () => {
    mount('process');
    document
      .getElementById('tab-process')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.getElementById('tab-process')!.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-evaluations')!.getAttribute('aria-selected')).toBe('false');
  });
});

const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

describe('rendered tablist + tabpanels (axe-core, WCAG A/AA)', () => {
  // Scanning `document` directly would also flag the bare jsdom document's own
  // missing <html lang>/<title> — real, but not this fragment's concern (the
  // full-shell a11y suite already covers those). Scoping the scan to a mounted
  // container checks only the tablist/tabpanel markup this module renders.
  function mount(activeId: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML =
      renderTabList(TABS, activeId, 'Project sections') +
      TABS.map((tab) => renderTabPanel(tab, activeId, `<p>${tab.label} panel content</p>`)).join(
        '',
      );
    document.body.appendChild(root);
    return root;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the default-active tablist is axe-clean', async () => {
    const root = mount('process');
    const results = await axe.run(root, AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });

  it('stays axe-clean with a non-first tab active', async () => {
    const root = mount('releases');
    const results = await axe.run(root, AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });
});
