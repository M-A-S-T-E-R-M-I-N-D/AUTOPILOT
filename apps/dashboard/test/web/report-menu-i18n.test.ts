// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The right-click "🚩 Report from here" menu + dialog's own static text
 * (board web-msnsndki-dz3vn1): `web/features/report-menu.ts` is the one
 * report surface that stays live dashboard-wide (epic 0015's REPORT
 * UNIFICATION), yet every string it paints — the menu's aria-label and
 * item, the dialog title, the ✕'s aria-label and tip, the two field labels
 * and the description tip, the Preview/Execute buttons and their tips, and
 * the three client-written status lines (preview unavailable, nothing to
 * file, request failed) — was an English literal. All of it is built fresh
 * inside `openReportMenu()`/`paintReportDialog()` on every open, so `tr()`
 * at build time is the right sweep — there is no persistent DOM node for
 * `translateDom()` to revisit, the same reasoning the browse-folder modal
 * followed (fly-browse-i18n.test.ts). The "Nothing to file" line is a
 * template with a `{reasoning}` slot so a locale decides where the server's
 * own reasoning lands; that reasoning itself stays as sent, by the
 * server-message stance every prior slice took.
 *
 * Out of scope here, by the same split the CONNECT popover took: the
 * spliced `reportActionLabel`/`reportExecuteResult`/`reportExecuteTip`
 * helpers (`web/report-panel.ts`, reached via `.toString()`) still compose
 * English — they need the injected-`tr` route and are the remaining
 * follow-up. `reportConfirmMessage` took that route in this same slice (own
 * coverage in `report-panel.test.ts`); the assertion below just pins that
 * the call site here passes the bundle's `tr` through. `client-tr-keys.test.ts`
 * resolves every key asserted here (and `reportConfirmMessage`'s own) against
 * STRINGS.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { reportMenuJs } from '../../src/web/features/report-menu.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

describe('the Report-from-here menu + dialog read their static text from STRINGS', () => {
  const out = reportMenuJs();

  it('translates the context menu aria-label and its one item', () => {
    expect(out).toContain("reportMenuEl.setAttribute('aria-label', tr('reportFromHere'));");
    expect(out).toContain("reportMenuAddItem(tr('reportFromHereTitle'), tr('reportFromHere')");
    expect(out).not.toContain("'🚩 Report from here'");
    expect(out).not.toContain("'Report from here'");
  });

  it('translates the dialog title and the ✕ close control (label + tip)', () => {
    expect(out).toContain("el('h2', 'report-dialog-title', tr('reportFromHereTitle'))");
    expect(out).toContain("closeBtn.setAttribute('aria-label', tr('close'));");
    expect(out).toContain("closeBtn.setAttribute('data-tip', tr('reportDialogCloseTip'));");
    expect(out).not.toContain("'Closes this dialog without filing anything.'");
  });

  it('translates both field labels and the description tip', () => {
    expect(out).toContain("descLabel.textContent = tr('reportDescLabel');");
    expect(out).toContain("desc.setAttribute('data-tip', tr('reportDescTip'));");
    expect(out).toContain("actionLabel.textContent = tr('reportActionPrompt');");
    expect(out).not.toContain("'What is wrong or missing here?'");
    expect(out).not.toContain("'One click files a…'");
  });

  it('translates the Preview button and its tip', () => {
    expect(out).toContain("previewBtn.textContent = tr('reportPreview');");
    expect(out).toContain("previewBtn.setAttribute('data-tip', tr('reportPreviewTip'));");
    expect(out).not.toContain("'Preview'");
  });

  it('translates the Execute button in all three states (idle, executing, restored)', () => {
    const idle = out.match(/execBtn\.textContent = tr\('reportExecute'\);/g) ?? [];
    expect(idle).toHaveLength(3);
    expect(out).toContain("execBtn.textContent = tr('reportExecuting');");
    expect(out).not.toContain("'Execute'");
    expect(out).not.toContain("'Executing…'");
  });

  it('passes the bundle tr through to the spliced reportConfirmMessage', () => {
    expect(out).toContain('window.confirm(reportConfirmMessage(previewedPlan, tr))');
  });

  it('translates the three client-written status lines, templating the server reasoning', () => {
    expect(out).toContain("el('p', 'muted', tr('reportPreviewUnavailable'))");
    expect(out).toContain(
      "el('p', 'muted', tr('reportNothingToFile', { reasoning: plan.reasoning }))",
    );
    expect(out).toContain("resultEl.textContent = tr('reportRequestFailed');");
    expect(out).not.toContain("'Preview unavailable — try again shortly.'");
    expect(out).not.toContain("'Nothing to file — '");
    expect(out).not.toContain("'✗ Request failed — try again shortly.'");
  });
});

describe('STRINGS carries the report dialog keys', () => {
  it('keeps the English byte-identical to the old literals', () => {
    expect(STRINGS.en.reportFromHere).toBe('Report from here');
    expect(STRINGS.en.reportFromHereTitle).toBe('🚩 Report from here');
    expect(STRINGS.en.reportDescLabel).toBe('What is wrong or missing here?');
    expect(STRINGS.en.reportActionPrompt).toBe('One click files a…');
    expect(STRINGS.en.reportPreview).toBe('Preview');
    expect(STRINGS.en.reportExecute).toBe('Execute');
    expect(STRINGS.en.reportExecuting).toBe('Executing…');
    expect(STRINGS.en.reportPreviewUnavailable).toBe('Preview unavailable — try again shortly.');
    expect(STRINGS.en.reportNothingToFile).toBe('Nothing to file — {reasoning}');
    expect(STRINGS.en.reportRequestFailed).toBe('✗ Request failed — try again shortly.');
  });

  it('keeps the 🚩 and ✗ glyphs literal in every locale, like ghIssueRequestFailed', () => {
    for (const table of Object.values(STRINGS)) {
      expect(table.reportFromHereTitle.startsWith('🚩 ')).toBe(true);
      expect(table.reportRequestFailed.startsWith('✗ ')).toBe(true);
    }
  });
});

describe('the Report-from-here dialog paints in the active locale (live, full bundle)', () => {
  // Mirrors report-menu.test.ts's boot: document.write() resets content but
  // not listeners bound to `document` itself, so this file keeps to ONE live
  // test rather than tracking/removing listeners across several.
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

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
    try {
      localStorage.removeItem('ap-locale');
    } catch {
      /* jsdom without storage */
    }
  });

  it('switching to Hebrew renders the menu item, title, labels and Preview in Hebrew', async () => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(document.documentElement.lang).toBe('he');

    const target = document.createElement('div');
    document.body.appendChild(target);
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = document.querySelector('.report-ctx-menu')!;
    expect(menu.getAttribute('aria-label')).toBe(STRINGS.he.reportFromHere);
    const item = menu.querySelector('.report-ctx-menu-item') as HTMLButtonElement;
    expect(item.textContent).toBe(STRINGS.he.reportFromHereTitle);

    item.click();

    expect(document.getElementById('report-dialog-title')?.textContent).toBe(
      STRINGS.he.reportFromHereTitle,
    );
    expect(document.querySelector('label[for="report-dialog-desc"]')?.textContent).toBe(
      STRINGS.he.reportDescLabel,
    );
    expect(document.querySelector('label[for="report-dialog-action"]')?.textContent).toBe(
      STRINGS.he.reportActionPrompt,
    );
    expect(document.querySelector('.report-preview')?.textContent).toBe(STRINGS.he.reportPreview);
    expect(document.querySelector('.report-dialog-close')?.getAttribute('aria-label')).toBe(
      STRINGS.he.close,
    );
  });
});
