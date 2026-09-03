// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  ARCHITECT_PROPOSAL_FENCE,
  buildArchitectAddendum,
  parseArchitectProposal,
} from '../../src/ask/architect-proposal.js';
import { CONTROL_TOOLS } from '../../src/flight/control-execute.js';

function fenced(json: string): string {
  return '```' + ARCHITECT_PROPOSAL_FENCE + '\n' + json + '\n```';
}

describe('buildArchitectAddendum', () => {
  it('names every control tool and the proposal fence tag', () => {
    const addendum = buildArchitectAddendum();
    expect(addendum).toContain('```' + ARCHITECT_PROPOSAL_FENCE);
    for (const tool of CONTROL_TOOLS) expect(addendum).toContain(tool);
  });

  it('forbids claiming the action already ran', () => {
    expect(buildArchitectAddendum()).toContain('Never claim the action ran');
  });
});

describe('parseArchitectProposal', () => {
  it('lifts a valid proposal out and strips its block from the prose', () => {
    const answer =
      'I will add that task.\n\n' +
      fenced('{"tool":"tasks_create","args":{"projectId":"p1","title":"Fix login"}}');
    const result = parseArchitectProposal(answer);
    expect(result.prose).toBe('I will add that task.');
    expect(result.proposal).toEqual({
      tool: 'tasks_create',
      args: { projectId: 'p1', title: 'Fix login' },
      safety: 'write',
    });
  });

  it('maps safety tiers per tool: read auto-runs, destructive needs a click', () => {
    expect(
      parseArchitectProposal(fenced('{"tool":"tasks_list","args":{"projectId":"p1"}}')).proposal
        ?.safety,
    ).toBe('read');
    expect(
      parseArchitectProposal(fenced('{"tool":"tasks_delete","args":{"taskId":"t1"}}')).proposal
        ?.safety,
    ).toBe('destructive');
  });

  it('defaults absent args to an empty object', () => {
    const result = parseArchitectProposal(fenced('{"tool":"tasks_list"}'));
    expect(result.proposal).toEqual({ tool: 'tasks_list', args: {}, safety: 'read' });
  });

  it('returns no proposal when the answer has no block', () => {
    const result = parseArchitectProposal('Just an answer, no action needed.');
    expect(result.proposal).toBeNull();
    expect(result.prose).toBe('Just an answer, no action needed.');
  });

  it('leaves an unknown tool visible in the prose and returns no proposal', () => {
    const answer = fenced('{"tool":"rm_rf_everything","args":{}}');
    const result = parseArchitectProposal(answer);
    expect(result.proposal).toBeNull();
    expect(result.prose).toBe(answer);
  });

  it('leaves malformed JSON visible in the prose and returns no proposal', () => {
    const answer = 'Trying:\n' + fenced('{"tool": tasks_create');
    const result = parseArchitectProposal(answer);
    expect(result.proposal).toBeNull();
    expect(result.prose).toBe(answer);
  });

  it('rejects a non-object args value', () => {
    const result = parseArchitectProposal(fenced('{"tool":"tasks_list","args":[1,2]}'));
    expect(result.proposal).toBeNull();
  });

  it('parses only the first block and leaves later ones in the prose', () => {
    const answer =
      fenced('{"tool":"tasks_list","args":{"projectId":"p1"}}') +
      '\n\n' +
      fenced('{"tool":"tasks_delete","args":{"taskId":"t1"}}');
    const result = parseArchitectProposal(answer);
    expect(result.proposal?.tool).toBe('tasks_list');
    expect(result.prose).toContain('tasks_delete');
  });
});
