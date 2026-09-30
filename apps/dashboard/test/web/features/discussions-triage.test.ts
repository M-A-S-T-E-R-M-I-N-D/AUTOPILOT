// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's KEEPER DISCUSSIONS panel
 * client (`web/features/discussions-triage.ts`) — same pattern
 * `test/web/features/mirror-pass.test.ts` already uses for this class of
 * `.toString()`-spliced panel-JS generator: assert on the generated source
 * text rather than booting a full jsdom page for every wiring detail.
 */

import { describe, it, expect } from 'vitest';
import {
  discussionsTriageDecisionLabel,
  discussionsTriageItems,
  discussionsTriageCanExecute,
  discussionsTriageConfirmMessage,
  discussionsTriageExecuteResultMessage,
} from '../../../src/web/discussions-triage-panel.js';
import { discussionsTriageJs } from '../../../src/web/features/discussions-triage.js';

describe('discussionsTriageJs', () => {
  it('embeds discussionsTriageDecisionLabel/discussionsTriageItems/discussionsTriageCanExecute/discussionsTriageConfirmMessage/discussionsTriageExecuteResultMessage real compiled source via .toString()', () => {
    const out = discussionsTriageJs();
    expect(out).toContain(discussionsTriageDecisionLabel.toString());
    expect(out).toContain(discussionsTriageItems.toString());
    expect(out).toContain(discussionsTriageCanExecute.toString());
    expect(out).toContain(discussionsTriageConfirmMessage.toString());
    expect(out).toContain(discussionsTriageExecuteResultMessage.toString());
  });

  it('declares discussionsTriageSection, renderDiscussionsTriageBody, and loadDiscussionsTriageBody', () => {
    const out = discussionsTriageJs();
    expect(out).toContain('function discussionsTriageSection(pid) {');
    expect(out).toContain('function renderDiscussionsTriageBody(body, plans, canExecute) {');
    expect(out).toContain('function loadDiscussionsTriageBody(body) {');
  });

  it('folds the skips into one translated count line, so the accepts lead (2026-09-30)', () => {
    const out = discussionsTriageJs();
    expect(out).toContain('(items[i].skip ? skipped : list).appendChild(');
    expect(out).toContain("var fold = el('details', 'discussions-triage-skipped');");
    expect(out).toContain(
      "foldSummary.setAttribute('data-i18n-template', 'discussionsTriageSkipped');",
    );
  });

  it('leads a skip row with its decorative skip-forward icon, the words still its text (epic 0025)', () => {
    // Runs the generated renderer itself against stand-ins for the core
    // helpers it calls, so the row the operator sees is asserted, not just
    // the source text.
    const el = (tag: string, cls: string, text?: string): HTMLElement => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const iconEl = (name: string): SVGSVGElement => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon icon-' + name);
      svg.setAttribute('aria-hidden', 'true');
      return svg;
    };
    const render = new Function(
      'el',
      'tr',
      'iconEl',
      'translateDom',
      `${discussionsTriageJs()}\nreturn renderDiscussionsTriageBody;`,
    )(
      el,
      () => '1 skipped',
      iconEl,
      () => undefined,
    ) as (body: HTMLElement, plans: readonly unknown[], canExecute: boolean) => void;
    const body = document.createElement('div');

    render(
      body,
      [
        {
          discussion: { number: 5, title: 'How?' },
          decision: { decision: 'accept', reasoning: '#5 "How?" has no answer yet.' },
        },
        {
          discussion: { number: 6, title: 'Done' },
          decision: { decision: 'skip', reasoning: '#6 "Done" already has an answer.' },
        },
      ],
      false,
    );

    const [acceptRow, skipRow] = Array.from(body.querySelectorAll('li.discussions-triage-item'));
    expect(acceptRow!.querySelector('svg')).toBeNull();
    expect(skipRow!.closest('details.discussions-triage-skipped')).not.toBeNull();
    expect(skipRow!.firstElementChild?.getAttribute('class')).toBe('icon icon-skip-forward');
    expect(skipRow!.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(skipRow!.textContent).toBe('skip — #6 "Done" already has an answer.');
  });

  it('is repo-scoped: no ?project= on the preview fetch, no project field on the execute body', () => {
    const out = discussionsTriageJs();
    expect(out).toContain("fetch('/api/discussions-triage')");
    expect(out).not.toContain('?project=');
    expect(out).toContain('body: JSON.stringify({})');
  });

  it('fetches identity alongside the preview via the shared socialIdentity() core helper', () => {
    const out = discussionsTriageJs();
    expect(out).toContain('socialIdentity(),');
    expect(out).toContain('discussionsTriageCanExecute(identity, plans)');
  });

  it('gates the execute button on discussionsTriageCanExecute, not a hand-rolled role check', () => {
    const out = discussionsTriageJs();
    expect(out).toContain('if (canExecute) {');
  });

  it('tags the execute button data-i18n and tip/aria with one shared key', () => {
    const out = discussionsTriageJs();
    expect(out).toContain("execBtn.setAttribute('data-i18n', 'discussionsTriageExecute');");
    expect(out).toContain("execBtn.setAttribute('data-i18n-tip', 'discussionsTriageExecuteTip');");
    expect(out).toContain("execBtn.setAttribute('data-i18n-aria', 'discussionsTriageExecuteTip');");
  });

  it('paints the confirm + transient states via tr()', () => {
    const out = discussionsTriageJs();
    expect(out).toContain(
      'window.confirm(discussionsTriageConfirmMessage(discussionsTriagePlans))',
    );
    expect(out).toContain("b.textContent = tr('discussionsTriageExecuting');");
    expect(out).toContain("resultEl.textContent = tr('discussionsTriageRequestFailed');");
  });

  it('posts to /api/discussions-triage/execute on click', () => {
    const out = discussionsTriageJs();
    expect(out).toContain("e.target.closest('[data-discussions-triage-execute]')");
    expect(out).toContain("ritualFetch('discussions-triage', '/api/discussions-triage/execute'");
  });

  it('reloads the panel on a clean run instead of leaving a stale result message', () => {
    const out = discussionsTriageJs();
    expect(out).toContain('loadDiscussionsTriageBody(body);');
  });

  it('sweeps freshly built DOM after every async render', () => {
    const out = discussionsTriageJs();
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      3,
    );
  });
});
