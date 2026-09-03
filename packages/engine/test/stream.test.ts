// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseStreamLine,
  activitiesFromEvent,
  isResultEvent,
  usageFromEvent,
  textDeltaFromEvent,
  foldOrientSpan,
  INITIAL_ORIENT_SPAN,
  guardDenialsFromEvent,
  guardDenialDetailsFromEvent,
} from '../src/stream.js';

describe('parseStreamLine', () => {
  it('parses a JSON object line', () => {
    expect(parseStreamLine('{"type":"system"}')).toEqual({ type: 'system' });
  });

  it('returns null for non-JSON / non-object lines', () => {
    expect(parseStreamLine('not json')).toBeNull();
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('[1,2,3]')).toBeNull();
  });

  it('returns null when a line starts with { but is not valid JSON (catches the parse throw)', () => {
    expect(parseStreamLine('{not valid json')).toBeNull();
    expect(parseStreamLine('{"unterminated": ')).toBeNull();
  });

  it('trims surrounding whitespace before checking for the leading brace', () => {
    expect(parseStreamLine('  {"type":"init"}  ')).toEqual({ type: 'init' });
    expect(parseStreamLine('\t{"type":"init"}\n')).toEqual({ type: 'init' });
  });
});

describe('activitiesFromEvent', () => {
  function assistant(content: unknown): Record<string, unknown> {
    return { type: 'assistant', message: { content } };
  }

  it('extracts a Bash command as a command activity', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git commit -m x' } },
      ]),
    );
    expect(acts).toEqual([
      {
        tool: 'Bash',
        target: 'git commit -m x',
        kind: 'command',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('extracts a file path from Read/Write/Edit (file_path or path)', () => {
    expect(
      activitiesFromEvent(
        assistant([{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/a.ts' } }]),
      ),
    ).toEqual([
      {
        tool: 'Edit',
        target: 'src/a.ts',
        kind: 'file',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
    expect(
      activitiesFromEvent(
        assistant([{ type: 'tool_use', name: 'Read', input: { path: 'README.md' } }]),
      ),
    ).toEqual([
      {
        tool: 'Read',
        target: 'README.md',
        kind: 'file',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('extracts a search query (pattern) from Grep/Glob', () => {
    expect(
      activitiesFromEvent(
        assistant([{ type: 'tool_use', name: 'Grep', input: { pattern: 'TODO' } }]),
      ),
    ).toEqual([
      {
        tool: 'Grep',
        target: 'TODO',
        kind: 'search',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('extracts the description from an Agent/Task tool call (no command/path/pattern)', () => {
    const acts = activitiesFromEvent(
      assistant([
        {
          type: 'tool_use',
          name: 'Agent',
          input: {
            description: 'Locate board/task sorting logic',
            prompt: 'long brief…',
            subagent_type: 'Explore',
          },
        },
      ]),
    );
    expect(acts).toEqual([
      {
        tool: 'Agent',
        target: 'Locate board/task sorting logic',
        kind: 'other',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('falls back to an empty target when a tool has no known input field', () => {
    const acts = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'ExitPlanMode', input: { plan: 'do the thing' } }]),
    );
    expect(acts[0]).toMatchObject({ tool: 'ExitPlanMode', target: '', kind: 'other' });
  });

  it('collapses whitespace and truncates a long command', () => {
    const long = 'echo ' + 'x'.repeat(300);
    const [act] = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'Bash', input: { command: long } }]),
    );
    expect(act!.target.length).toBeLessThanOrEqual(160);
    expect(act!.target.endsWith('…')).toBe(true);
  });

  it('collapses runs of whitespace to a single space and trims the ends', () => {
    const [act] = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'Bash', input: { command: '  git   status  ' } }]),
    );
    expect(act!.target).toBe('git status');
  });

  it('does not truncate a command whose collapsed length is exactly the 160 cap', () => {
    const command = 'x'.repeat(160);
    const [act] = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'Bash', input: { command } }]),
    );
    expect(act!.target).toBe(command);
    expect(act!.target.endsWith('…')).toBe(false);
  });

  it('extracts a notebook path (notebook_path) when file_path/path are absent', () => {
    const [act] = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'NotebookEdit', input: { notebook_path: 'nb.ipynb' } }]),
    );
    expect(act).toMatchObject({ tool: 'NotebookEdit', target: 'nb.ipynb', kind: 'file' });
  });

  it('extracts a search query field (query) when pattern is absent', () => {
    const [act] = activitiesFromEvent(
      assistant([{ type: 'tool_use', name: 'WebSearch', input: { query: 'stryker mutants' } }]),
    );
    expect(act).toMatchObject({ tool: 'WebSearch', target: 'stryker mutants', kind: 'search' });
  });

  it('skips a tool_use block whose name is missing or non-string', () => {
    expect(
      activitiesFromEvent(assistant([{ type: 'tool_use', input: { command: 'ls' } }])),
    ).toEqual([]);
    expect(
      activitiesFromEvent(assistant([{ type: 'tool_use', name: 42, input: { command: 'ls' } }])),
    ).toEqual([]);
  });

  it('is defensive against non-object/falsy entries in the content array', () => {
    expect(
      activitiesFromEvent(
        assistant([
          null,
          'not-a-block',
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
        ]),
      ),
    ).toEqual([
      {
        tool: 'Bash',
        target: 'ls',
        kind: 'command',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('never processes content when the event type is not assistant, even if content looks tool_use-shaped', () => {
    expect(
      activitiesFromEvent({
        type: 'user',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      }),
    ).toEqual([]);
  });

  it('treats message as the activity container only when it is a genuine object, not just any truthy value', () => {
    const acts = activitiesFromEvent({
      type: 'assistant',
      message: 'not-an-object',
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
    });
    expect(acts).toEqual([
      {
        tool: 'Bash',
        target: 'ls',
        kind: 'command',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('never treats a non-object truthy value as a text/tool_use block, even carrying a matching type field', () => {
    // A function is truthy and can carry arbitrary own properties, but
    // `typeof fn === 'function'`, never `'object'` — Object.assign can't be
    // used here since Function.prototype.name is non-writable (only
    // configurable), so properties are defined explicitly instead.
    function fakeBlock(props: Record<string, unknown>): unknown {
      const fn = () => {};
      for (const [key, value] of Object.entries(props)) {
        Object.defineProperty(fn, key, { value, configurable: true });
      }
      return fn;
    }
    const fakeTextBlock = fakeBlock({ type: 'text', text: 'leaked-reasoning' });
    const fakeToolUseBlock = fakeBlock({
      type: 'tool_use',
      name: 'Bash',
      input: { command: 'leaked-activity' },
    });
    const acts = activitiesFromEvent(
      assistant([
        fakeTextBlock,
        fakeToolUseBlock,
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts).toEqual([
      {
        tool: 'Bash',
        target: 'ls',
        kind: 'command',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('never treats an object block as text/tool_use when its type field does not match', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'tool_result', text: 'leaked-reasoning' },
        { type: 'other', name: 'Bash', input: { command: 'leaked-activity' } },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts).toEqual([
      {
        tool: 'Bash',
        target: 'ls',
        kind: 'command',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('returns an empty list without throwing when content is missing or not an array', () => {
    expect(activitiesFromEvent(assistant(undefined))).toEqual([]);
    expect(activitiesFromEvent(assistant(null))).toEqual([]);
    expect(activitiesFromEvent(assistant('not-an-array'))).toEqual([]);
  });

  it('ignores text/thinking blocks and non-assistant events', () => {
    expect(activitiesFromEvent(assistant([{ type: 'text', text: 'hello' }]))).toEqual([]);
    expect(activitiesFromEvent({ type: 'result', total_cost_usd: 1 })).toEqual([]);
    expect(activitiesFromEvent({ type: 'user', message: { content: [] } })).toEqual([]);
  });

  it('handles the flat content shape too (no message wrapper)', () => {
    expect(
      activitiesFromEvent({
        type: 'assistant',
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'x.js' } }],
      }),
    ).toEqual([
      {
        tool: 'Write',
        target: 'x.js',
        kind: 'file',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('attaches the preceding text block as reasoning on the tool call', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: "I'll check the config file first." },
        { type: 'tool_use', name: 'Read', input: { path: 'config.json' } },
      ]),
    );
    expect(acts).toEqual([
      {
        tool: 'Read',
        target: 'config.json',
        kind: 'file',
        reasoning: "I'll check the config file first.",
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ]);
  });

  it('attaches the same reasoning to every tool call in one message', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: 'Reading two files.' },
        { type: 'tool_use', name: 'Read', input: { path: 'a.ts' } },
        { type: 'tool_use', name: 'Read', input: { path: 'b.ts' } },
      ]),
    );
    expect(acts.map((a) => a.reasoning)).toEqual(['Reading two files.', 'Reading two files.']);
  });

  it('joins multiple text blocks and truncates a long reasoning excerpt', () => {
    const long = 'x'.repeat(300);
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: long },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts[0]!.reasoning!.length).toBeLessThanOrEqual(240);
    expect(acts[0]!.reasoning!.endsWith('…')).toBe(true);
  });

  it('joins two separate text blocks with a space', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts[0]!.reasoning).toBe('Hello World');
  });

  it('ignores a text block whose text field is missing or non-string', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: 42 },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts[0]!.reasoning).toBeNull();
  });

  it('ignores empty/whitespace-only text blocks (reasoning stays null)', () => {
    const acts = activitiesFromEvent(
      assistant([
        { type: 'text', text: '   ' },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
      ]),
    );
    expect(acts[0]!.reasoning).toBeNull();
  });

  it('reads model + token usage from message.model / message.usage (MICRO-ACTION TELEMETRY)', () => {
    const acts = activitiesFromEvent({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-5',
        usage: { input_tokens: 120, output_tokens: 45 },
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    expect(acts).toEqual([
      {
        tool: 'Bash',
        target: 'ls',
        kind: 'command',
        reasoning: null,
        model: 'claude-sonnet-5',
        tokensIn: 120,
        tokensOut: 45,
      },
    ]);
  });

  it('attaches the same model + usage to every tool call in one message', () => {
    const acts = activitiesFromEvent({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-8',
        usage: { input_tokens: 10, output_tokens: 5 },
        content: [
          { type: 'tool_use', name: 'Read', input: { path: 'a.ts' } },
          { type: 'tool_use', name: 'Read', input: { path: 'b.ts' } },
        ],
      },
    });
    expect(acts.map((a) => [a.model, a.tokensIn, a.tokensOut])).toEqual([
      ['claude-opus-4-8', 10, 5],
      ['claude-opus-4-8', 10, 5],
    ]);
  });

  it('is defensive against a missing/malformed usage object', () => {
    const withoutUsage = activitiesFromEvent({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-5',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    expect(withoutUsage[0]).toMatchObject({
      model: 'claude-sonnet-5',
      tokensIn: null,
      tokensOut: null,
    });

    const malformed = activitiesFromEvent({
      type: 'assistant',
      message: {
        usage: 'not-an-object',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    expect(malformed[0]).toMatchObject({ model: null, tokensIn: null, tokensOut: null });

    const nonFiniteTokens = activitiesFromEvent({
      type: 'assistant',
      message: {
        usage: { input_tokens: 'many', output_tokens: NaN },
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    expect(nonFiniteTokens[0]).toMatchObject({ tokensIn: null, tokensOut: null });

    const nullUsage = activitiesFromEvent({
      type: 'assistant',
      message: {
        usage: null,
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    expect(nullUsage[0]).toMatchObject({ tokensIn: null, tokensOut: null });
  });
});

describe('isResultEvent', () => {
  it('is true only for the terminal result event', () => {
    expect(isResultEvent({ type: 'result' })).toBe(true);
    expect(isResultEvent({ type: 'assistant' })).toBe(false);
  });
});

describe('usageFromEvent', () => {
  it('returns null for a non-assistant event (DEATH-COST capture only tracks assistant turns)', () => {
    expect(usageFromEvent({ type: 'result' })).toBeNull();
    expect(usageFromEvent({ type: 'user' })).toBeNull();
  });

  it('reads model + token usage from message.model / message.usage', () => {
    const event = {
      type: 'assistant',
      message: {
        model: 'claude-sonnet-5',
        usage: { input_tokens: 120, output_tokens: 45 },
      },
    };
    expect(usageFromEvent(event)).toEqual({
      model: 'claude-sonnet-5',
      tokensIn: 120,
      tokensOut: 45,
    });
  });

  it('treats message as the usage container only when it is a genuine object, not just any truthy value', () => {
    const event = {
      type: 'assistant',
      message: 'not-an-object',
      model: 'top-level-model',
    };
    expect(usageFromEvent(event)).toEqual({
      model: 'top-level-model',
      tokensIn: null,
      tokensOut: null,
    });
  });

  it('falls back to the event itself as the container when message is absent', () => {
    const event = { type: 'assistant', model: 'fallback-model' };
    expect(usageFromEvent(event)).toEqual({
      model: 'fallback-model',
      tokensIn: null,
      tokensOut: null,
    });
  });
});

describe('textDeltaFromEvent', () => {
  // Fixtures below are byte-for-byte the shape captured from a real
  // `claude -p --output-format stream-json --include-partial-messages` run —
  // not a guess at the wire format.
  it('extracts the text from a content_block_delta/text_delta event', () => {
    const event = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'hello world' },
      },
      session_id: 's1',
    };
    expect(textDeltaFromEvent(event)).toBe('hello world');
  });

  it('ignores thinking_delta — extended thinking is never part of the answer', () => {
    const event = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'the user wants', estimated_tokens: null },
      },
    };
    expect(textDeltaFromEvent(event)).toBeNull();
  });

  it('ignores non-stream_event event types (assistant, result, system)', () => {
    expect(textDeltaFromEvent({ type: 'assistant', message: { content: [] } })).toBeNull();
    expect(textDeltaFromEvent({ type: 'result', total_cost_usd: 1 })).toBeNull();
    expect(textDeltaFromEvent({ type: 'system', subtype: 'init' })).toBeNull();
  });

  it('never inspects `event` when the outer type is not stream_event, even if it is delta-shaped', () => {
    expect(
      textDeltaFromEvent({
        type: 'assistant',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'leaked' } },
      }),
    ).toBeNull();
  });

  it('never inspects `delta` when the inner type is not content_block_delta, even if it is delta-shaped', () => {
    expect(
      textDeltaFromEvent({
        type: 'stream_event',
        event: { type: 'message_start', delta: { type: 'text_delta', text: 'leaked' } },
      }),
    ).toBeNull();
  });

  it('returns null without throwing when delta is explicitly null', () => {
    expect(
      textDeltaFromEvent({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: null },
      }),
    ).toBeNull();
  });

  it('never reads `text` off a delta whose own type is not text_delta, even if a text field is present', () => {
    expect(
      textDeltaFromEvent({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', text: 'leaked' },
        },
      }),
    ).toBeNull();
  });

  it('ignores other stream_event sub-types (message_start, content_block_start/stop)', () => {
    expect(
      textDeltaFromEvent({ type: 'stream_event', event: { type: 'message_start' } }),
    ).toBeNull();
    expect(
      textDeltaFromEvent({
        type: 'stream_event',
        event: { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
      }),
    ).toBeNull();
    expect(
      textDeltaFromEvent({ type: 'stream_event', event: { type: 'content_block_stop', index: 1 } }),
    ).toBeNull();
  });

  it('is defensive against malformed or missing nested fields', () => {
    expect(textDeltaFromEvent({ type: 'stream_event' })).toBeNull();
    expect(textDeltaFromEvent({ type: 'stream_event', event: null })).toBeNull();
    expect(textDeltaFromEvent({ type: 'stream_event', event: 'not-an-object' })).toBeNull();
    expect(
      textDeltaFromEvent({ type: 'stream_event', event: { type: 'content_block_delta' } }),
    ).toBeNull();
    expect(
      textDeltaFromEvent({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 42 } },
      }),
    ).toBeNull();
  });
});

describe('foldOrientSpan', () => {
  function turnWithTool(name: string): Record<string, unknown> {
    return {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't', name, input: { file_path: 'a.ts' } }] },
    };
  }
  const textTurn: Record<string, unknown> = {
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'thinking about the repo' }] },
  };

  it('starts with zero turns and no first edit', () => {
    expect(INITIAL_ORIENT_SPAN).toEqual({ turns: 0, turnsBeforeFirstEdit: null });
  });

  it('counts assistant turns (tool or text-only) and ignores every other event type', () => {
    let span = INITIAL_ORIENT_SPAN;
    span = foldOrientSpan(span, turnWithTool('Read'));
    span = foldOrientSpan(span, textTurn);
    span = foldOrientSpan(span, { type: 'user' });
    span = foldOrientSpan(span, { type: 'result' });
    span = foldOrientSpan(span, { type: 'stream_event' });
    expect(span).toEqual({ turns: 2, turnsBeforeFirstEdit: null });
  });

  it('records how many turns passed before the first edit, then latches', () => {
    let span = INITIAL_ORIENT_SPAN;
    for (const tool of ['Read', 'Grep', 'Glob']) span = foldOrientSpan(span, turnWithTool(tool));
    span = foldOrientSpan(span, turnWithTool('Edit'));
    expect(span).toEqual({ turns: 4, turnsBeforeFirstEdit: 3 });
    span = foldOrientSpan(span, turnWithTool('Edit'));
    expect(span.turnsBeforeFirstEdit).toBe(3);
    expect(span.turns).toBe(5);
  });

  it.each(['Edit', 'Write', 'NotebookEdit'])('%s counts as the first edit', (tool) => {
    const span = foldOrientSpan(INITIAL_ORIENT_SPAN, turnWithTool(tool));
    expect(span).toEqual({ turns: 1, turnsBeforeFirstEdit: 0 });
  });

  it('does NOT count Bash as an edit — running git/gate commands is orientation, not editing', () => {
    const bashTurn = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'git log' } }],
      },
    };
    const span = foldOrientSpan(INITIAL_ORIENT_SPAN, bashTurn);
    expect(span).toEqual({ turns: 1, turnsBeforeFirstEdit: null });
  });

  it('is immutable — folding returns a new span and never mutates the input', () => {
    const before = INITIAL_ORIENT_SPAN;
    const after = foldOrientSpan(before, turnWithTool('Write'));
    expect(before).toEqual({ turns: 0, turnsBeforeFirstEdit: null });
    expect(after).not.toBe(before);
  });
});

describe('guardDenialsFromEvent', () => {
  function user(content: unknown): Record<string, unknown> {
    return { type: 'user', message: { content } };
  }

  function toolResult(overrides: Record<string, unknown>): Record<string, unknown> {
    return { type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'x', ...overrides };
  }

  it('counts a CONTAINMENT denial (string content)', () => {
    expect(
      guardDenialsFromEvent(
        user([toolResult({ content: 'CONTAINMENT: this flight is confined to /repo — blocked.' })]),
      ),
    ).toBe(1);
  });

  it('counts a READ HYGIENE denial (string content)', () => {
    expect(
      guardDenialsFromEvent(
        user([toolResult({ content: 'READ HYGIENE: generated/vendored path — blocked.' })]),
      ),
    ).toBe(1);
  });

  it('counts a denial whose content is an array of text blocks (the other documented tool_result shape)', () => {
    expect(
      guardDenialsFromEvent(
        user([
          toolResult({
            content: [{ type: 'text', text: 'CONTAINMENT: this flight is confined to /repo.' }],
          }),
        ]),
      ),
    ).toBe(1);
  });

  it('sums multiple denials in one event', () => {
    expect(
      guardDenialsFromEvent(
        user([
          toolResult({ content: 'CONTAINMENT: blocked one.' }),
          toolResult({ content: 'READ HYGIENE: blocked two.' }),
        ]),
      ),
    ).toBe(2);
  });

  it('ignores a successful tool_result even if its text happens to start with a guard prefix', () => {
    expect(
      guardDenialsFromEvent(user([toolResult({ is_error: false, content: 'CONTAINMENT: nope' })])),
    ).toBe(0);
  });

  it('ignores an error tool_result whose text is not a guard denial', () => {
    expect(guardDenialsFromEvent(user([toolResult({ content: 'command not found: foo' })]))).toBe(
      0,
    );
  });

  it('ignores non-tool_result blocks and non-object blocks', () => {
    expect(
      guardDenialsFromEvent(
        user([{ type: 'text', text: 'CONTAINMENT: not a tool_result' }, null, 42, 'str']),
      ),
    ).toBe(0);
  });

  it('returns 0 for non-user events, even if shaped like a denial', () => {
    expect(
      guardDenialsFromEvent({
        type: 'assistant',
        message: { content: [toolResult({ content: 'CONTAINMENT: nope' })] },
      }),
    ).toBe(0);
  });

  it('returns 0 when content is missing or not an array, without throwing', () => {
    expect(guardDenialsFromEvent(user(undefined))).toBe(0);
    expect(guardDenialsFromEvent(user(null))).toBe(0);
    expect(guardDenialsFromEvent(user('not-an-array'))).toBe(0);
  });

  it('handles the flat content shape too (no message wrapper)', () => {
    expect(
      guardDenialsFromEvent({
        type: 'user',
        content: [toolResult({ content: 'CONTAINMENT: blocked.' })],
      }),
    ).toBe(1);
  });
});

describe('guardDenialDetailsFromEvent', () => {
  function user(content: unknown): Record<string, unknown> {
    return { type: 'user', message: { content } };
  }

  function toolResult(overrides: Record<string, unknown>): Record<string, unknown> {
    return { type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'x', ...overrides };
  }

  it('extracts kind + target from a real-shape CONTAINMENT denial (boilerplate stripped)', () => {
    expect(
      guardDenialDetailsFromEvent(
        user([
          toolResult({
            content:
              'CONTAINMENT: this flight is confined to /repo — Read of a path outside the ' +
              'target repo: /etc/passwd. Work only inside the target repository.',
          }),
        ]),
      ),
    ).toEqual([
      { kind: 'containment', target: 'Read of a path outside the target repo: /etc/passwd.' },
    ]);
  });

  it('extracts kind + target from a real-shape READ HYGIENE denial (boilerplate stripped)', () => {
    expect(
      guardDenialDetailsFromEvent(
        user([
          toolResult({
            content:
              'READ HYGIENE: generated/vendored output: dist/index.js. ' +
              'Consult the repo source or official docs.',
          }),
        ]),
      ),
    ).toEqual([{ kind: 'read-hygiene', target: 'generated/vendored output: dist/index.js.' }]);
  });

  it('degrades to the prefix-stripped whole text when the containment shape has no em-dash lead-in', () => {
    expect(
      guardDenialDetailsFromEvent(user([toolResult({ content: 'CONTAINMENT: blocked.' })])),
    ).toEqual([{ kind: 'containment', target: 'blocked.' }]);
  });

  it('reads the text-block array content shape (the other documented tool_result shape)', () => {
    expect(
      guardDenialDetailsFromEvent(
        user([
          toolResult({
            content: [
              {
                type: 'text',
                text: 'READ HYGIENE: nope. Consult the repo source or official docs.',
              },
            ],
          }),
        ]),
      ),
    ).toEqual([{ kind: 'read-hygiene', target: 'nope.' }]);
  });

  it('yields multiple denials in wire order', () => {
    const details = guardDenialDetailsFromEvent(
      user([
        toolResult({
          content:
            'CONTAINMENT: this flight is confined to /r — first. Work only inside the target repository.',
        }),
        toolResult({ content: 'READ HYGIENE: second. Consult the repo source or official docs.' }),
      ]),
    );
    expect(details.map((d) => d.target)).toEqual(['first.', 'second.']);
    expect(details.map((d) => d.kind)).toEqual(['containment', 'read-hygiene']);
  });

  it('caps a runaway target at 300 chars', () => {
    const long = 'x'.repeat(1000);
    const [detail] = guardDenialDetailsFromEvent(
      user([toolResult({ content: `CONTAINMENT: this flight is confined to /r — ${long}` })]),
    );
    expect(detail?.target).toHaveLength(300);
    expect(detail?.target).toBe('x'.repeat(300));
  });

  it('yields [] for successful results, non-denial errors, and non-user events', () => {
    expect(
      guardDenialDetailsFromEvent(
        user([toolResult({ is_error: false, content: 'CONTAINMENT: nope' })]),
      ),
    ).toEqual([]);
    expect(
      guardDenialDetailsFromEvent(user([toolResult({ content: 'command not found: foo' })])),
    ).toEqual([]);
    expect(
      guardDenialDetailsFromEvent({
        type: 'assistant',
        message: { content: [toolResult({ content: 'CONTAINMENT: nope' })] },
      }),
    ).toEqual([]);
  });

  it('keeps guardDenialsFromEvent in lockstep — the count IS the details length', () => {
    const event = user([
      toolResult({ content: 'CONTAINMENT: one.' }),
      toolResult({ content: 'READ HYGIENE: two.' }),
    ]);
    expect(guardDenialsFromEvent(event)).toBe(guardDenialDetailsFromEvent(event).length);
  });
});
