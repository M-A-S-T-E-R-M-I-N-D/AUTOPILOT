// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Ask feature's SSE frame-decode math
 * (`web/ask-stream.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2, thirty-seventh cut. Previously this logic was only exercised
 * indirectly (`ask-markdown.test.ts`, `ask-sources-tooltip.test.ts`) by
 * driving the real client bundle through a mocked `ReadableStream` — neither
 * test ever hit the malformed-frame-is-ignored paths or the buffer-split
 * case directly, a genuine coverage gap this closes.
 */

import { describe, it, expect } from 'vitest';
import { splitSseFrames, applyAskStreamFrame } from '../../src/web/ask-stream.js';

describe('splitSseFrames', () => {
  it('splits complete frames from the trailing partial one', () => {
    const result = splitSseFrames('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3');

    expect(result.frames).toEqual(['data: {"a":1}', 'data: {"b":2}']);
    expect(result.rest).toBe('data: {"c":3');
  });

  it('returns no frames and the whole buffer as rest when nothing is complete yet', () => {
    const result = splitSseFrames('data: {"partial"');

    expect(result.frames).toEqual([]);
    expect(result.rest).toBe('data: {"partial"');
  });

  it('returns an empty rest when the buffer ends exactly on a frame boundary', () => {
    const result = splitSseFrames('data: {"a":1}\n\n');

    expect(result.frames).toEqual(['data: {"a":1}']);
    expect(result.rest).toBe('');
  });
});

describe('applyAskStreamFrame', () => {
  it('appends a delta frame to the accumulated answer', () => {
    const update = applyAskStreamFrame('data: {"delta":"hello "}', 'so far: ');

    expect(update).toEqual({
      answered: 'so far: hello ',
      sources: null,
      activity: null,
      proposal: null,
    });
  });

  it("replaces the answer with the terminal frame's answer field when present", () => {
    const update = applyAskStreamFrame(
      'data: {"done":true,"answer":"final text","sources":["a.ts"]}',
      'streamed-in text',
    );

    expect(update).toEqual({
      answered: 'final text',
      sources: ['a.ts'],
      activity: null,
      proposal: null,
    });
  });

  it('keeps the streamed-in text when the terminal frame omits answer', () => {
    const update = applyAskStreamFrame(
      'data: {"done":true,"sources":["b.ts"]}',
      'streamed-in text',
    );

    expect(update).toEqual({
      answered: 'streamed-in text',
      sources: ['b.ts'],
      activity: null,
      proposal: null,
    });
  });

  it('carries one activity entry (epic 0012 slice 3) without touching the accumulated answer', () => {
    const update = applyAskStreamFrame(
      'data: {"activity":{"tool":"Read","target":"src/cart.ts"}}',
      'so far: ',
    );

    expect(update).toEqual({
      answered: 'so far: ',
      sources: null,
      activity: { tool: 'Read', target: 'src/cart.ts' },
      proposal: null,
    });
  });

  it("carries the terminal frame's ARCHITECT-mode control-tool proposal (epic 0011 slice 3)", () => {
    const update = applyAskStreamFrame(
      'data: {"done":true,"answer":"done","proposal":{"tool":"tasks_list","args":{"projectId":"p1"},"safety":"read"}}',
      'streamed-in text',
    );

    expect(update).toEqual({
      answered: 'done',
      sources: undefined,
      activity: null,
      proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
    });
  });

  it('carries proposal: null on a terminal frame with no proposal', () => {
    const update = applyAskStreamFrame('data: {"done":true,"answer":"done"}', 'streamed-in text');

    expect(update?.proposal).toBeNull();
  });

  it('ignores a non-data line', () => {
    const update = applyAskStreamFrame(': keep-alive', 'unchanged');

    expect(update).toBeNull();
  });

  it('ignores an unparsable frame', () => {
    const update = applyAskStreamFrame('data: {not json', 'unchanged');

    expect(update).toBeNull();
  });

  it('ignores a payload with none of delta, activity, nor done', () => {
    const update = applyAskStreamFrame('data: {"ok":true}', 'unchanged');

    expect(update).toBeNull();
  });
});
