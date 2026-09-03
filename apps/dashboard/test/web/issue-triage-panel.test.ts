// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the KEEPER ISSUE TRIAGE panel's pure formatting
 * math (`web/issue-triage-panel.ts`) — the dashboard UI surface for `GET
 * /api/issue-triage` + `POST /api/issue-triage/execute` (BOARD
 * web-mss50i9u-ldv513, "PLATFORM 3/7"), the follow-up slice
 * `flight/issue-triage-execute.ts`'s header comment flagged as deferred.
 */

import { describe, it, expect } from 'vitest';
import {
  issueTriageDecisionLabel,
  issueTriageConfirmMessage,
  issueTriageExecuteResult,
} from '../../src/web/issue-triage-panel.js';

describe('issueTriageDecisionLabel', () => {
  it('labels an accept decision', () => {
    expect(issueTriageDecisionLabel('accept')).toBe('✓ accept');
  });

  it('labels a duplicate decision', () => {
    expect(issueTriageDecisionLabel('duplicate')).toBe('⧉ duplicate');
  });

  it('labels a skip decision', () => {
    expect(issueTriageDecisionLabel('skip')).toBe('⏭ skip');
  });

  it('echoes back an unrecognized decision verbatim rather than throwing', () => {
    expect(issueTriageDecisionLabel('mystery')).toBe('mystery');
  });
});

describe('issueTriageConfirmMessage', () => {
  it('states the accept/duplicate/skip split for a mixed batch', () => {
    const plans = [
      {
        issue: { number: 1, title: 'a11y: nav is unreachable' },
        decision: { decision: 'accept', reasoning: 'new' },
      },
      {
        issue: { number: 2, title: 'nav broken' },
        decision: { decision: 'duplicate', reasoning: 'dup of #1' },
      },
      {
        issue: { number: 3, title: 'flaky test' },
        decision: { decision: 'accept', reasoning: 'new' },
      },
      {
        issue: { number: 4, title: 'already triaged' },
        decision: { decision: 'skip', reasoning: 'already carries a pool label' },
      },
    ];
    const msg = issueTriageConfirmMessage(plans);
    expect(msg).toContain('Run KEEPER triage on 4 open issues?');
    expect(msg).toContain('2 issues will be labeled, commented, and turned into a new board task');
    expect(msg).toContain(
      '1 issue already matching open work will be labeled duplicate and commented',
    );
    expect(msg).toContain('1 issue already triaged in a previous pass will be skipped');
    expect(msg).toContain('re-fetched fresh from gh at execute time');
  });

  it('uses singular phrasing for a single-issue batch', () => {
    const plans = [
      {
        issue: { number: 1, title: 'a11y: nav is unreachable' },
        decision: { decision: 'accept', reasoning: 'new' },
      },
    ];
    const msg = issueTriageConfirmMessage(plans);
    expect(msg).toContain('Run KEEPER triage on 1 open issue?');
    expect(msg).toContain('1 issue will be labeled, commented, and turned into a new board task');
    expect(msg).toContain(
      '0 issues already matching open work will be labeled duplicate and commented',
    );
  });

  it('handles an all-duplicate batch with zero accepts', () => {
    const plans = [
      {
        issue: { number: 1, title: 'nav broken' },
        decision: { decision: 'duplicate', reasoning: 'dup' },
      },
    ];
    const msg = issueTriageConfirmMessage(plans);
    expect(msg).toContain('0 issues will be labeled, commented, and turned into a new board task');
    expect(msg).toContain('1 issue already matching open work');
    expect(msg).toContain('0 issues already triaged in a previous pass will be skipped');
  });
});

describe('issueTriageExecuteResult', () => {
  it('reports every command ran plus tasks created on success', () => {
    const result = issueTriageExecuteResult({
      commandResults: [
        { command: { details: 'labeling #1 "pool: accessibility"' }, code: 0 },
        { command: { details: "posting KEEPER's triage reasoning as a comment on #1" }, code: 0 },
      ],
      tasksCreated: 1,
    });
    expect(result.text).toBe('✓ Ran 2 gh commands. 1 new board task created.');
    expect(result.className).toBe('issue-triage-result issue-triage-result-ok');
  });

  it('omits the tasks-created note when nothing was created', () => {
    const result = issueTriageExecuteResult({
      commandResults: [{ command: { details: 'posting a comment on #2' }, code: 0 }],
      tasksCreated: 0,
    });
    expect(result.text).toBe('✓ Ran 1 gh command.');
  });

  it('uses singular phrasing for exactly one task created', () => {
    const result = issueTriageExecuteResult({
      commandResults: [{ command: { details: 'labeling #1' }, code: 0 }],
      tasksCreated: 1,
    });
    expect(result.text).toContain('1 new board task created.');
  });

  it('reports the failure count and the first failing command, not just one detail', () => {
    const result = issueTriageExecuteResult({
      commandResults: [
        { command: { details: 'labeling #1' }, code: 1 },
        { command: { details: 'commenting on #1' }, code: 0 },
        { command: { details: 'commenting on #2' }, code: 1 },
      ],
      tasksCreated: 0,
    });
    expect(result.text).toBe('✗ 2 of 3 gh command(s) failed — first: labeling #1 (exit 1).');
    expect(result.className).toBe('issue-triage-result issue-triage-result-fail');
  });

  it('falls back to the error field when there are no command results', () => {
    expect(issueTriageExecuteResult({ error: 'unknown project' }).text).toBe('✗ unknown project');
  });

  it('falls back to a generic message when neither results nor error are present', () => {
    expect(issueTriageExecuteResult({}).text).toBe('✗ Issue triage execute failed.');
  });

  it('treats a null/undefined response as a failure', () => {
    expect(issueTriageExecuteResult(null).text).toBe('✗ Issue triage execute failed.');
    expect(issueTriageExecuteResult(undefined).className).toBe(
      'issue-triage-result issue-triage-result-fail',
    );
  });
});
