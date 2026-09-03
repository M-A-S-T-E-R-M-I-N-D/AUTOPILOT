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
} from '../../../src/web/issue-triage-panel.js';
import { issueTriageJs } from '../../../src/web/features/issue-triage.js';

describe('issueTriageJs', () => {
  it('embeds issueTriageDecisionLabel/issueTriageConfirmMessage/issueTriageExecuteResult/issueTriageExecuteTip real compiled source via .toString()', () => {
    const out = issueTriageJs();
    expect(out).toContain(issueTriageDecisionLabel.toString());
    expect(out).toContain(issueTriageConfirmMessage.toString());
    expect(out).toContain(issueTriageExecuteResult.toString());
    expect(out).toContain(issueTriageExecuteTip.toString());
  });

  it('does not re-splice decisionItemHeadMeta — it relies on shell.ts hoisting it', () => {
    const out = issueTriageJs();
    expect(out).toContain('decisionItemHeadMeta(');
    expect(out).not.toContain('function decisionItemHeadMeta(');
  });

  it('declares issueTriageSection, renderIssueTriageBody, and loadIssueTriageBody', () => {
    const out = issueTriageJs();
    expect(out).toContain('function issueTriageSection(pid) {');
    expect(out).toContain('function renderIssueTriageBody(body, plans, pid) {');
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
    expect(issueTriageJs()).toContain(
      "body.replaceChildren(el('p', 'muted', 'Issue triage unavailable.'));",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = issueTriageJs();
    expect(out).toBe(out.trim());
  });
});
