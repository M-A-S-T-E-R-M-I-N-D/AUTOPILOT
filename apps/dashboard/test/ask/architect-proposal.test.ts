// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStore, migrate } from '@autopilot/store';
import {
  ARCHITECT_PROPOSAL_FENCE,
  buildArchitectAddendum,
  parseArchitectProposal,
} from '../../src/ask/architect-proposal.js';
import { CONTROL_TOOLS, createControlExecuteApi } from '../../src/flight/control-execute.js';

function fenced(json: string): string {
  return '```' + ARCHITECT_PROPOSAL_FENCE + '\n' + json + '\n```';
}

/** The REQUIRED arg keys the addendum documents for `tool` — its
 *  `- tool: {"a","b"?}` line, optional (`?`-suffixed) keys left out. */
function documentedRequiredArgs(addendum: string, tool: string): string[] {
  const line = addendum.split('\n').find((l) => l.startsWith(`- ${tool}: {`));
  if (line === undefined) return [];
  const braces = line.slice(line.indexOf('{') + 1, line.indexOf('}'));
  return [...braces.matchAll(/"(\w+)"(\?)?/g)]
    .filter((m) => m[2] === undefined)
    .map((m) => m[1] ?? '');
}

/** A plausible value per documented key, so a proposal built straight from
 *  the addendum reaches the executor exactly as a prompt-faithful model
 *  would send it. */
const SAMPLE_ARG: Record<string, unknown> = {
  projectId: 'proj1',
  taskId: 't1',
  status: 'queued',
  title: 'Fix login',
  orderedIds: ['t1'],
};

describe('buildArchitectAddendum', () => {
  it('names every control tool and the proposal fence tag', () => {
    const addendum = buildArchitectAddendum();
    expect(addendum).toContain('```' + ARCHITECT_PROPOSAL_FENCE);
    for (const tool of CONTROL_TOOLS) expect(addendum).toContain(tool);
  });

  it('forbids claiming the action already ran', () => {
    expect(buildArchitectAddendum()).toContain('Never claim the action ran');
  });

  it("documents every tool's args so the executor accepts a prompt-faithful proposal", () => {
    // The addendum is the model's ONLY description of each tool's args, and
    // control-execute.ts's per-tool validation is the only judge of them. A
    // tool whose documented args miss a key the executor requires (tasks_delete
    // lost its projectId when delete became project-scoped) fails EVERY
    // proposal the model builds by the book, after the operator's confirm click.
    const dir = mkdtempSync(join(tmpdir(), 'ap-architect-args-'));
    try {
      const dbPath = join(dir, 'a.db');
      const store = openStore(dbPath);
      migrate(store);
      store.close();
      const api = createControlExecuteApi(dbPath);
      const addendum = buildArchitectAddendum();
      for (const tool of CONTROL_TOOLS) {
        const keys = documentedRequiredArgs(addendum, tool);
        expect(keys, `${tool} has a documented args line`).not.toHaveLength(0);
        const args = Object.fromEntries(keys.map((k) => [k, SAMPLE_ARG[k]]));
        expect(api(tool, args), `${tool} with ${JSON.stringify(args)}`).toMatchObject({
          ok: true,
        });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
      parseArchitectProposal(
        fenced('{"tool":"tasks_delete","args":{"taskId":"t1","projectId":"p1"}}'),
      ).proposal?.safety,
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
      fenced('{"tool":"tasks_delete","args":{"taskId":"t1","projectId":"p1"}}');
    const result = parseArchitectProposal(answer);
    expect(result.proposal?.tool).toBe('tasks_list');
    expect(result.prose).toContain('tasks_delete');
  });
});
