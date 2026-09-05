// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the REPORT-FROM-HERE panel's pure formatting
 * math (`web/report-panel.ts`) — the operator-panel formatting core for
 * `POST /api/report-from-here` + `POST /api/report-from-here/execute`
 * (BOARD web-mss50ia8-nthtf3, "PLATFORM 5/7"), the slice
 * `flight/report-from-here.ts`'s header comment deferred.
 *
 * i18n (board web-msnsndki-dz3vn1): `reportConfirmMessage` stays spliced
 * into the bundle via `.toString()` (see `web/features/report-menu.ts`), so
 * — the same route `releaseConfirmMessage`/`prReviewConfirmMessage` took —
 * it now takes the bundle's `tr()` as its second parameter instead of
 * composing English literals directly. Every English assertion below passes
 * a STRINGS.en-backed translator and is byte-for-byte what the old literals
 * produced; the Hebrew case proves the server-sent summary lands untouched
 * inside the translated wrapper.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  reportActionLabel,
  reportConfirmMessage,
  reportExecuteResult,
  reportExecuteTip,
  type ReportPanelTranslator,
} from '../../src/web/report-panel.js';

/** A translator over one real STRINGS table — the same shape the bundle's
 *  `tr()` (`web/features/locale.ts`) resolves a bare key to. */
function translatorFor(locale: 'en' | 'he'): ReportPanelTranslator {
  return (key) => STRINGS[locale][key];
}
const trEn = translatorFor('en');
const trHe = translatorFor('he');

describe('reportActionLabel', () => {
  it('labels each of the four report actions', () => {
    expect(reportActionLabel('issue')).toBe('🐛 bug issue');
    expect(reportActionLabel('quick-fix-pr')).toBe('🔧 quick-fix PR');
    expect(reportActionLabel('local-task')).toBe('📋 local task');
    expect(reportActionLabel('pool-offer')).toBe('🤝 pool offer');
  });

  it('echoes back an unrecognized action verbatim rather than throwing', () => {
    expect(reportActionLabel('mystery')).toBe('mystery');
  });
});

describe('reportConfirmMessage', () => {
  it('warns an issue plan files a real GitHub issue this dashboard cannot recall', () => {
    const msg = reportConfirmMessage(
      {
        ok: true,
        action: 'issue',
        summary: 'gh issue create — bug issue "fly bar overlaps" (label "bug")',
      },
      trEn,
    );
    expect(msg).toContain('Execute this report?');
    expect(msg).toContain('gh issue create — bug issue "fly bar overlaps" (label "bug")');
    expect(msg).toContain('REAL GitHub issue');
    expect(msg).toContain('re-derived fresh from the capture at execute time');
  });

  it('gives a pool offer the same real-issue clause — it also files upstream', () => {
    const msg = reportConfirmMessage(
      {
        ok: true,
        action: 'pool-offer',
        summary: 'gh issue create — pool offer "[pool] fly bar overlaps" (label "pool: ux")',
      },
      trEn,
    );
    expect(msg).toContain('REAL GitHub issue');
    expect(msg).not.toContain('board task');
  });

  it('notes a local task plan is retry-safe via its content-addressed id', () => {
    const msg = reportConfirmMessage(
      {
        ok: true,
        action: 'local-task',
        summary: 'board task "Report: fly bar overlaps [from Fly bar]" (queued)',
      },
      trEn,
    );
    expect(msg).toContain('queued board task');
    expect(msg).toContain('content-addressed');
    expect(msg).not.toContain('REAL GitHub issue');
  });

  it('treats a quick-fix-pr plan as task-shaped too', () => {
    const msg = reportConfirmMessage(
      {
        ok: true,
        action: 'quick-fix-pr',
        summary: 'board task "QUICK-FIX (deliver as PR): fly bar overlaps [from Fly bar]" (queued)',
      },
      trEn,
    );
    expect(msg).toContain('queued board task');
  });

  it('reads its clauses from the injected locale table, keeping the server summary as sent', () => {
    const msg = reportConfirmMessage(
      {
        ok: true,
        action: 'issue',
        summary: 'gh issue create — bug issue "fly bar overlaps" (label "bug")',
      },
      trHe,
    );
    expect(msg).toContain(STRINGS.he.reportConfirmExecute);
    expect(msg).toContain(STRINGS.he.reportConfirmEffectIssue);
    expect(msg).toContain(STRINGS.he.reportConfirmSuffix);
    expect(msg).toContain('gh issue create — bug issue "fly bar overlaps" (label "bug")');
  });
});

describe('reportExecuteResult', () => {
  it('reports a missing response as a plain failure', () => {
    expect(reportExecuteResult(null)).toEqual({
      className: 'report-result report-result-fail',
      text: '✗ report execute failed.',
    });
  });

  it('surfaces the server error text when the response carries one', () => {
    const result = reportExecuteResult({
      error: 'Too many report-from-here requests — slow down and try again shortly.',
    });
    expect(result.className).toBe('report-result report-result-fail');
    expect(result.text).toContain('Too many report-from-here requests');
  });

  it('reports a rejected plan with its reasoning — nothing was applied', () => {
    const result = reportExecuteResult({
      plan: { ok: false, reasoning: 'regionId is blank.' },
      commandResults: [],
      taskCreated: false,
    });
    expect(result.className).toBe('report-result report-result-fail');
    expect(result.text).toBe('✗ nothing applied — regionId is blank.');
  });

  it('reports a freshly created board task with the plan summary', () => {
    const result = reportExecuteResult({
      plan: {
        ok: true,
        action: 'local-task',
        summary: 'board task "Report: fly bar overlaps [from Fly bar]" (queued)',
      },
      commandResults: [],
      taskCreated: true,
    });
    expect(result.className).toBe('report-result report-result-ok');
    expect(result.text).toBe('✓ board task "Report: fly bar overlaps [from Fly bar]" (queued).');
  });

  it('reports an un-created task as the content-addressed retry no-op, honestly', () => {
    const result = reportExecuteResult({
      plan: { ok: true, action: 'quick-fix-pr', summary: 'board task "QUICK-FIX ..." (queued)' },
      commandResults: [],
      taskCreated: false,
    });
    expect(result.className).toBe('report-result report-result-ok');
    expect(result.text).toContain('already on the board');
    expect(result.text).not.toContain('QUICK-FIX');
  });

  it('reports the first failing gh command with its exit code', () => {
    const result = reportExecuteResult({
      plan: { ok: true, action: 'issue', summary: 'gh issue create — bug issue "x" (label "bug")' },
      commandResults: [{ command: { details: 'filing "x" as a "bug" issue upstream' }, code: 1 }],
      taskCreated: false,
    });
    expect(result.className).toBe('report-result report-result-fail');
    expect(result.text).toBe('✗ filing "x" as a "bug" issue upstream failed (exit 1).');
  });

  it('joins every gh command detail on success', () => {
    const result = reportExecuteResult({
      plan: {
        ok: true,
        action: 'pool-offer',
        summary: 'gh issue create — pool offer "[pool] x" (label "pool: ux")',
      },
      commandResults: [
        {
          command: { details: 'offering "[pool] x" to the pool under the "pool: ux" label' },
          code: 0,
        },
      ],
      taskCreated: false,
    });
    expect(result.className).toBe('report-result report-result-ok');
    expect(result.text).toBe('✓ offering "[pool] x" to the pool under the "pool: ux" label.');
  });

  it('fails closed when an upstream plan resolved but no command ran', () => {
    const result = reportExecuteResult({
      plan: { ok: true, action: 'issue', summary: 'gh issue create — bug issue "x" (label "bug")' },
      commandResults: [],
      taskCreated: false,
    });
    expect(result.className).toBe('report-result report-result-fail');
    expect(result.text).toContain('no gh command ran');
  });
});

describe('reportExecuteTip', () => {
  it('previews the real-issue clause for an upstream plan', () => {
    const tip = reportExecuteTip({
      ok: true,
      action: 'issue',
      summary: 'gh issue create — bug issue "x" (label "bug")',
    });
    expect(tip).toContain('gh issue create — bug issue "x" (label "bug")');
    expect(tip).toContain('real GitHub issue');
  });

  it('previews the retry-safe clause for a task-shaped plan', () => {
    const tip = reportExecuteTip({
      ok: true,
      action: 'local-task',
      summary: 'board task "Report: x [from Fly bar]" (queued)',
    });
    expect(tip).toContain('board task');
    expect(tip).toContain('retry is harmless');
  });
});
