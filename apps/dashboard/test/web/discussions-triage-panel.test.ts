// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  discussionsTriageDecisionLabel,
  discussionsTriageItems,
  discussionsTriageCanExecute,
  discussionsTriageConfirmMessage,
  discussionsTriageExecuteResultMessage,
} from '../../src/web/discussions-triage-panel.js';

describe('discussionsTriageDecisionLabel', () => {
  it('labels accept and skip', () => {
    expect(discussionsTriageDecisionLabel('accept')).toBe('✓ accept — reply + label');
    expect(discussionsTriageDecisionLabel('skip')).toBe('⏭ skip');
  });

  it('echoes back an unrecognized decision verbatim rather than throwing', () => {
    expect(discussionsTriageDecisionLabel('mystery')).toBe('mystery');
  });
});

describe('discussionsTriageItems', () => {
  it('includes both accept and skip plans, unlike mirror-pass\'s finding-only filter', () => {
    const items = discussionsTriageItems([
      {
        discussion: { number: 5, title: 'How do I configure X?' },
        decision: { decision: 'accept', reasoning: '#5 "How do I configure X?" has no answer yet.' },
      },
      {
        discussion: { number: 6, title: 'Already answered' },
        decision: { decision: 'skip', reasoning: '#6 "Already answered" already has an answer.' },
      },
    ]);
    expect(items).toEqual([
      { text: '✓ accept — reply + label — #5 "How do I configure X?" has no answer yet.' },
      { text: '⏭ skip — #6 "Already answered" already has an answer.' },
    ]);
  });

  it('returns an empty list for no open discussions', () => {
    expect(discussionsTriageItems([])).toEqual([]);
  });
});

describe('discussionsTriageCanExecute', () => {
  const withAccept = [
    { discussion: { number: 1, title: 'x' }, decision: { decision: 'accept', reasoning: 'x' } },
  ];
  const allSkip = [
    { discussion: { number: 1, title: 'x' }, decision: { decision: 'skip', reasoning: 'x' } },
  ];

  it('hides the execute button for a confirmed non-maintainer, even with an accept', () => {
    expect(discussionsTriageCanExecute({ role: 'user' }, withAccept)).toBe(false);
  });

  it('shows the execute button for a confirmed maintainer with an accept', () => {
    expect(discussionsTriageCanExecute({ role: 'maintainer' }, withAccept)).toBe(true);
  });

  it('shows the execute button when identity is unresolved — not a known guest', () => {
    expect(discussionsTriageCanExecute(undefined, withAccept)).toBe(true);
    expect(discussionsTriageCanExecute(null, withAccept)).toBe(true);
  });

  it('hides the execute button when there is nothing to accept, even for the maintainer', () => {
    expect(discussionsTriageCanExecute({ role: 'maintainer' }, allSkip)).toBe(false);
    expect(discussionsTriageCanExecute({ role: 'maintainer' }, [])).toBe(false);
    expect(discussionsTriageCanExecute({ role: 'maintainer' }, null)).toBe(false);
  });
});

describe('discussionsTriageConfirmMessage', () => {
  it('states the accept/skip split and the re-fetch-fresh caveat', () => {
    const message = discussionsTriageConfirmMessage([
      { discussion: { number: 1, title: 'a' }, decision: { decision: 'accept', reasoning: 'a' } },
      { discussion: { number: 2, title: 'b' }, decision: { decision: 'accept', reasoning: 'b' } },
      { discussion: { number: 3, title: 'c' }, decision: { decision: 'skip', reasoning: 'c' } },
    ]);
    expect(message).toContain('3 open discussions');
    expect(message).toContain('2 discussions will get a signed reply posted and a pool label applied');
    expect(message).toContain('1 discussion (already answered, locked, or already labeled) will be skipped');
    expect(message).toContain('re-fetched fresh from gh at execute time');
  });

  it('uses singular grammar for exactly one discussion', () => {
    const message = discussionsTriageConfirmMessage([
      { discussion: { number: 1, title: 'a' }, decision: { decision: 'accept', reasoning: 'a' } },
    ]);
    expect(message).toContain('1 open discussion?');
    expect(message).toContain('1 discussion will get a signed reply posted');
  });
});

describe('discussionsTriageExecuteResultMessage', () => {
  it('reports a generic failure for a non-200 response or missing body', () => {
    expect(discussionsTriageExecuteResultMessage(500, { outcomes: [] })).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: 'Discussions triage failed to run.',
    });
    expect(discussionsTriageExecuteResultMessage(200, null)).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: 'Discussions triage failed to run.',
    });
  });

  it('reports the guest skip reason', () => {
    expect(discussionsTriageExecuteResultMessage(200, { skippedReason: 'guest' })).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    });
  });

  it('reports the identity-unresolved skip reason', () => {
    expect(
      discussionsTriageExecuteResultMessage(200, { skippedReason: 'identity-unresolved' }),
    ).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    });
  });

  it('reports a clean run with real outcomes as ok', () => {
    expect(
      discussionsTriageExecuteResultMessage(200, {
        outcomes: [
          { replyResult: { code: 0 }, labelResult: { code: 0 } },
          { replyResult: { code: 0 }, labelResult: null },
        ],
      }),
    ).toEqual({
      className: 'discussions-triage-result discussions-triage-result-ok',
      text: '✓ Replied to 2 discussions.',
    });
  });

  it('reports a clean run with zero outcomes as ok but empty', () => {
    expect(discussionsTriageExecuteResultMessage(200, { outcomes: [] })).toEqual({
      className: 'discussions-triage-result discussions-triage-result-ok',
      text: 'Nothing to run — every open discussion is already triaged.',
    });
  });

  it('reports a partial reply-post failure by count, never stopping at the first', () => {
    expect(
      discussionsTriageExecuteResultMessage(200, {
        outcomes: [
          { replyResult: { code: 0 }, labelResult: { code: 0 } },
          { replyResult: { code: 1 }, labelResult: null },
        ],
      }),
    ).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: '✗ 1 of 2 replies failed to post.',
    });
  });

  it('uses singular grammar for a single failed reply', () => {
    expect(
      discussionsTriageExecuteResultMessage(200, {
        outcomes: [{ replyResult: { code: 1 }, labelResult: null }],
      }),
    ).toEqual({
      className: 'discussions-triage-result discussions-triage-result-fail',
      text: '✗ 1 of 1 reply failed to post.',
    });
  });
});
