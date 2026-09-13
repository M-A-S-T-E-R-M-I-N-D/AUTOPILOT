// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ICON SYSTEM, slice 2 hub (epic 0025): a panel heading is a leading
 * stroke icon beside an inner [data-i18n] span. The locale sweep
 * (`translateDom`) writes `textContent` on every tagged element, so the tag
 * must sit on the span, never on the heading — otherwise a locale switch
 * would wipe the icon. `panelHeading` is the one place that shape is built,
 * so every panel that drops its emoji uses the same law.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_NAMES } from '../../src/web/icons.js';

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
afterEach(() => {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
});

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

/** Boots the real bundle and exposes the helper through a probe element the
 *  bundle itself builds: the test appends `panelHeading` output by evaluating
 *  a one-line call inside the same script scope. */
function bootWithProbe(call: string): HTMLElement {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => STATE,
  })) as unknown as typeof fetch;
  new Function(clientJs() + `\ndocument.body.appendChild(${call});`)();
  return document.body.lastElementChild as HTMLElement;
}

describe('panelHeading — the icon-beside-a-tagged-span law', () => {
  it('is defined once in the core bundle, after iconEl', () => {
    const js = clientJs();
    expect(js.split('function panelHeading(tag, cls, key, iconName) {').length - 1).toBe(1);
    expect(js.indexOf('function iconEl(name) {')).toBeLessThan(
      js.indexOf('function panelHeading('),
    );
  });

  it('builds <h3 class><svg.icon-name/><span data-i18n>text</span></h3>', () => {
    const h = bootWithProbe("panelHeading('h3', 'release-title', 'releaseTitle', 'rocket')");
    expect(h.tagName).toBe('H3');
    expect(h.className).toBe('release-title');
    expect(h.children).toHaveLength(2);
    const [svg, span] = Array.from(h.children);
    expect(svg!.tagName.toLowerCase()).toBe('svg');
    expect(svg!.getAttribute('class')).toBe('icon icon-rocket');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(span!.tagName).toBe('SPAN');
    expect(span!.getAttribute('data-i18n')).toBe('releaseTitle');
    expect(span!.textContent).toBe(STRINGS.en.releaseTitle);
    expect(h.hasAttribute('data-i18n')).toBe(false);
  });

  it('omits the icon when no name is given, and renders no shapes for an unknown one', () => {
    const plain = bootWithProbe("panelHeading('h2', 'x', 'releaseTitle')");
    expect(plain.children).toHaveLength(1);
    expect(plain.firstElementChild!.tagName).toBe('SPAN');
    const unknown = bootWithProbe("panelHeading('h3', 'x', 'releaseTitle', 'no-such-icon')");
    expect(unknown.firstElementChild!.tagName.toLowerCase()).toBe('svg');
    expect(unknown.firstElementChild!.children).toHaveLength(0);
  });

  it('vendors the shapes the panel headings will draw', () => {
    for (const name of [
      'rocket',
      'plane-landing',
      'monitor',
      'chart-line',
      'zap',
      'dna',
      'search',
      'activity',
      'sprout',
      'message-circle',
      'refresh-cw',
      'repeat',
      'wrench',
      'pen-line',
      'users',
      'handshake',
      'flag',
      'key-round',
      'book-open',
      'git-pull-request',
      'notebook-pen',
      'clock',
      'compass',
      'siren',
      'shield',
      'ban',
      'octagon-x',
      'trophy',
      'skull',
      'bandage',
      'lock-open',
      'clipboard-check',
    ]) {
      expect(ICON_NAMES, name).toContain(name);
    }
  });

  it('the stylesheet spaces a heading icon from its words', () => {
    expect(layoutCss()).toContain(
      'h2 > .icon, h3 > .icon, summary > .icon { margin-inline-end: var(--space-2); }',
    );
  });
});
