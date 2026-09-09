// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's KEEPER issue-triage panel
 * client (`web/features/issue-triage.ts`) — a whole assembler function
 * extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import {
  issueTriageDecisionLabel,
  issueTriageConfirmMessage,
  issueTriageExecuteResult,
  issueTriageExecuteTip,
  issueTriageGuestNote,
} from '../../../src/web/issue-triage-panel.js';
import { issueTriageJs } from '../../../src/web/features/issue-triage.js';

describe('issueTriageJs', () => {
  it('embeds issueTriageDecisionLabel/issueTriageConfirmMessage/issueTriageExecuteResult/issueTriageExecuteTip/issueTriageGuestNote real compiled source via .toString()', () => {
    const out = issueTriageJs();
    expect(out).toContain(issueTriageDecisionLabel.toString());
    expect(out).toContain(issueTriageConfirmMessage.toString());
    expect(out).toContain(issueTriageExecuteResult.toString());
    expect(out).toContain(issueTriageExecuteTip.toString());
    expect(out).toContain(issueTriageGuestNote.toString());
  });

  it('role-gates the execute button behind a confirmed non-owner check (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899)', () => {
    const out = issueTriageJs();
    expect(out).toContain("identity && identity.role === 'user'");
    // A confirmed guest gets the note instead of the execute button.
    expect(out).toContain(
      "el('p', 'muted issue-triage-guest-note', issueTriageGuestNote(identity))",
    );
  });

  it('does not re-splice decisionItemHeadMeta — it relies on shell.ts hoisting it', () => {
    const out = issueTriageJs();
    expect(out).toContain('decisionItemHeadMeta(');
    expect(out).not.toContain('function decisionItemHeadMeta(');
  });

  it('declares issueTriageSection, renderIssueTriageBody, and loadIssueTriageBody', () => {
    const out = issueTriageJs();
    expect(out).toContain('function issueTriageSection(pid) {');
    expect(out).toContain('function renderIssueTriageBody(body, plans, pid, identity) {');
    expect(out).toContain('function loadIssueTriageBody(body, pid) {');
  });

  it('keeps its own pid-keyed plan cache for the execute click handler', () => {
    expect(issueTriageJs()).toContain('var issueTriagePlansByProject = {};');
  });

  it('fetches on demand rather than folding into the polled /api/state', () => {
    expect(issueTriageJs()).toContain(
      "fetch('/api/issue-triage?project=' + encodeURIComponent(pid))",
    );
  });

  it('degrades to an honest unavailable message on fetch failure', () => {
    const out = issueTriageJs();
    expect(out).toContain("var unavailableMsg = el('p', 'muted', 'Issue triage unavailable.');");
    expect(out).toContain('body.replaceChildren(unavailableMsg);');
  });

  it('tags its own literal text data-i18n and sweeps freshly built DOM (board web-msnsndki-dz3vn1)', () => {
    const out = issueTriageJs();
    expect(out).toContain("title.setAttribute('data-i18n', 'issueTriageTitle');");
    expect(out).toContain("loadingMsg.setAttribute('data-i18n', 'issueTriageLoading');");
    expect(out).toContain("emptyMsg.setAttribute('data-i18n', 'issueTriageEmpty');");
    expect(out).toContain("unavailableMsg.setAttribute('data-i18n', 'issueTriageUnavailable');");
    expect(out).toContain("execBtn.setAttribute('data-i18n', 'issueTriageExecute');");
    // One sweep per ASYNC tagged-DOM creation site — the empty state, the
    // guest-note state (epic 0019 law 1 extended to the UI, board
    // web-mtt3f7j6-3bj899), the fetch-failure state, and the non-empty/
    // execute-button state, all built inside /api/issue-triage handlers that
    // can resolve after the page-level sweep. The title and the loading
    // placeholder are built synchronously at mount and ride
    // renderProjectPage()'s own sweep, the same split flight-console.ts uses.
    expect(out.match(/translateDom\(document\.documentElement\.lang \|\| 'en'\);/g)?.length).toBe(
      4,
    );
  });

  it('paints its two transient states via tr() rather than a literal (board web-msnsndki-dz3vn1)', () => {
    const out = issueTriageJs();
    expect(out).toContain("b.textContent = tr('issueTriageExecuting');");
    expect(out).toContain("resultEl.textContent = tr('issueTriageRequestFailed');");
    expect(out).not.toContain("b.textContent = 'Triaging…';");
    expect(out).not.toContain("resultEl.textContent = '✗ Request failed — try again shortly.';");
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = issueTriageJs();
    expect(out).toBe(out.trim());
  });
});
