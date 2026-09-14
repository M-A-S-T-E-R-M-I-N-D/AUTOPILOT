// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the CONNECT popover client (`web/features/connect.ts`)
 * — the second assembler function extracted out of `shell.ts` into its own file
 * under `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK B's
 * real extraction; `web/features/switcher.ts` was the first).
 */

import { describe, it, expect } from 'vitest';
import {
  connectModeMeta,
  connectStatusMeta,
  connectTestResultMeta,
  ghStatusMeta,
  ghLtsMeta,
  githubIssueConfirmMessage,
  githubIssueExecuteResult,
  reportComposeStatusMeta,
} from '../../../src/web/connect-panel.js';
import { connectJs } from '../../../src/web/features/connect.js';

describe('connectJs', () => {
  it('embeds connectModeMeta/connectStatusMeta/connectTestResultMeta/ghStatusMeta real compiled source via .toString()', () => {
    const out = connectJs();
    expect(out).toContain(connectModeMeta.toString());
    expect(out).toContain(connectStatusMeta.toString());
    expect(out).toContain(connectTestResultMeta.toString());
    expect(out).toContain(ghStatusMeta.toString());
  });

  it('embeds ghLtsMeta real compiled source via .toString()', () => {
    expect(connectJs()).toContain(ghLtsMeta.toString());
  });

  it('embeds githubIssueConfirmMessage/githubIssueExecuteResult real compiled source via .toString()', () => {
    const out = connectJs();
    expect(out).toContain(githubIssueConfirmMessage.toString());
    expect(out).toContain(githubIssueExecuteResult.toString());
  });

  it('confirms before POSTing a "report to upstream" issue — never a silent write', () => {
    const out = connectJs();
    // The spliced helper composes the dialog through the bundle's injected tr
    // (i18n, board web-msnsndki-dz3vn1) — connect-i18n.test.ts pins the key.
    expect(out).toContain('if (!window.confirm(githubIssueConfirmMessage(title, tr))) return;');
    expect(out).toContain("ritualFetch('github-issue', '/api/github-issue/execute'");
  });

  describe('LLM ISSUE COMPOSER 2/3 (board web-mtpzdruu-vf25ry)', () => {
    it('embeds reportComposeStatusMeta real compiled source via .toString()', () => {
      expect(connectJs()).toContain(reportComposeStatusMeta.toString());
    });

    it('POSTs only the free-text note to /api/report/compose — one field, description', () => {
      const out = connectJs();
      expect(out).toContain("ritualFetch('compose', '/api/report/compose'");
      expect(out).toContain('body: JSON.stringify({ description: note })');
    });

    it('never sends the raw note to the GitHub issue execute endpoint', () => {
      const out = connectJs();
      // The submit handler's request body is built from the title/body
      // fields only — the note variable never appears inside it.
      const submitBodyLine = 'body: JSON.stringify({ title: title, body: body })';
      expect(out).toContain(submitBodyLine);
      expect(out).not.toContain('note: note');
    });

    it('fills the visible title/body fields from the composed result — the rendered preview', () => {
      const out = connectJs();
      expect(out).toContain('var m = reportComposeStatusMeta(j, tr);');
      expect(out).toContain('if (m.title && ghIssueTitle) ghIssueTitle.value = m.title;');
      expect(out).toContain('if (m.body && ghIssueBody) ghIssueBody.value = m.body;');
    });

    it('shows a composing status and disables the button while the request is in flight', () => {
      const out = connectJs();
      expect(out).toContain('ghIssueComposeBtn.disabled = true;');
      expect(out).toContain("ghIssueComposeStatus.textContent = tr('reportComposing');");
      expect(out).toContain('ghIssueComposeBtn.disabled = false;');
    });

    it('does nothing when the note is blank — no request, no state change', () => {
      const out = connectJs();
      expect(out).toContain(
        "var note = ghIssueNote ? ghIssueNote.value.trim() : '';\n    if (!note) return;",
      );
    });

    it('reports a generic failure line when the compose request itself fails', () => {
      const out = connectJs();
      expect(out).toContain("ghIssueComposeStatus.textContent = tr('reportComposeRequestFailed');");
    });

    it('tips the Compose button explaining the raw-note-stays-local guarantee', () => {
      expect(connectJs()).toContain("setTip(ghIssueComposeBtn, 'reportComposeTip');");
    });
  });

  it('fetches /api/connection/gh on init; the three auth verbs POST one fixed route each — a terminal opens, nothing is done on the operator’s behalf (epic 0029 slice 2)', () => {
    const out = connectJs();
    expect(out).toContain("fetch('/api/connection/gh'");
    expect(out).toContain(
      "fetch('/api/connection/gh/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' } })",
    );
    expect(out).toContain("ghAuth('login')");
    expect(out).toContain("ghAuth('switch')");
    expect(out).toContain("ghAuth('logout')");
    // Switch and log out only once someone is logged in; all three only when gh exists.
    expect(out).toContain('if (ghAuthEl) ghAuthEl.hidden = !present;');
    expect(out).toContain('if (ghLoginBtn) ghLoginBtn.hidden = authed;');
    expect(out).toContain('if (ghSwitchBtn) ghSwitchBtn.hidden = !authed;');
    expect(out).toContain('if (ghLogoutBtn) ghLogoutBtn.hidden = !authed;');
    // The identity line re-reads itself after the flow has plausibly finished in the terminal.
    expect(out).toContain('setTimeout(loadGh, 30000);');
  });

  it('fetches the cached /api/connection/gh-lts chip on init — read-only, no gh call', () => {
    const out = connectJs();
    expect(out).toContain('function loadLts() {');
    expect(out).toContain(
      "fetch('/api/connection/gh-lts', { headers: { accept: 'application/json' } })",
    );
    expect(out).toContain('loadLts();');
  });

  it('POSTs /api/connection/gh-lts as application/json when the operator clicks "Check for updates"', () => {
    const out = connectJs();
    expect(out).toContain("var ghLtsCheckBtn = document.getElementById('gh-lts-check');");
    expect(out).toContain(
      "fetch('/api/connection/gh-lts', { method: 'POST', headers: { 'content-type': 'application/json' } })",
    );
  });

  it('defines and immediately calls connectInit()', () => {
    const out = connectJs();
    expect(out).toContain('function connectInit() {');
    expect(out.trimEnd().endsWith('connectInit();')).toBe(true);
  });

  it('bails out early when the #connect panel is not on the page', () => {
    expect(connectJs()).toContain(
      "var panel = document.getElementById('connect');\n  if (!panel) return;",
    );
  });

  it('POSTs credentials as application/json, not a cross-site-forgeable form submit', () => {
    expect(connectJs()).toContain(
      "fetch('/api/connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = connectJs();
    expect(out).toBe(out.trim());
  });

  it('gives the LTS chip a data-tip + tabindex explaining its status on hover/focus (interactivity audit v2)', () => {
    const out = connectJs();
    expect(out).toContain('function paintLts(m) {');
    expect(out).toContain("ghLtsEl.setAttribute('tabindex', '0');");
    expect(out).toContain("ghLtsEl.setAttribute('data-tip', m.statusTip);");
    // The spliced helper reads its tips through the bundle's injected tr
    // (i18n, board web-msnsndki-dz3vn1) — connect-i18n.test.ts pins the keys.
    expect(out).toContain('paintLts(ghLtsMeta(s, tr));');
  });
});
