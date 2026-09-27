// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseGeminiJsonOutput } from '../../src/adapters/gemini-cli.js';

const SESSION = '5c1d2a8e-3f4b-4e9a-9b7c-0d6e1f2a3b4c';

/** One model's `SessionMetrics.models[name]` entry (uiTelemetry.ts). */
function modelMetrics(tokens: Record<string, number>): unknown {
  return {
    api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 8123 },
    tokens: {
      input: 0,
      prompt: 0,
      candidates: 0,
      total: 0,
      cached: 0,
      thoughts: 0,
      tool: 0,
      ...tokens,
    },
    roles: {},
  };
}

function stats(models: Record<string, unknown>): unknown {
  return {
    models,
    tools: { totalCalls: 2, totalSuccess: 2, totalFail: 0, totalDurationMs: 40, byName: {} },
    files: { totalLinesAdded: 4, totalLinesRemoved: 1 },
  };
}

/** What `JsonFormatter.format` writes: one object, pretty-printed with 2 spaces. */
function pretty(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

describe('parseGeminiJsonOutput', () => {
  it('maps a finished run into a passing envelope with the response as its result', () => {
    const stdout = pretty({
      session_id: SESSION,
      response: 'Added the missing test and the gate is green.',
      stats: stats({
        'gemini-2.5-pro': modelMetrics({
          input: 1_200,
          prompt: 31_200,
          candidates: 410,
          total: 32_050,
          cached: 30_000,
          thoughts: 440,
        }),
      }),
    });

    const response = parseGeminiJsonOutput(stdout, 0, 'gemini-2.5-pro');

    expect(response.exitCode).toBe(0);
    expect(response.stdout).toBe(stdout);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toEqual({
      result: 'Added the missing test and the gate is green.',
      isError: false,
      apiErrorStatus: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: 'gemini-2.5-pro',
      tokensIn: 1_200, // the CLI's own uncached share: prompt − cached
      tokensOut: 410,
      cacheRead: 30_000,
      cacheCreate: null,
      sessionId: SESSION,
    });
  });

  it('never invents a cost, even when the run reported token usage', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'ok',
        stats: stats({
          'gemini-2.5-pro': modelMetrics({ input: 1_000_000, candidates: 1_000_000 }),
        }),
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope?.costUsd).toBeNull();
    expect(response.envelope?.tokensIn).toBe(1_000_000);
  });

  it('sums tokens over every model the run used and names the requested model when there are several', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'routed',
        stats: stats({
          'gemini-2.5-flash-lite': modelMetrics({ input: 90, candidates: 5, cached: 0 }),
          'gemini-2.5-pro': modelMetrics({ input: 700, candidates: 200, cached: 3_000 }),
        }),
      }),
      0,
      'auto',
    );
    expect(response.envelope).toMatchObject({
      modelUsed: 'auto',
      tokensIn: 790,
      tokensOut: 205,
      cacheRead: 3_000,
    });
  });

  it('reads a fatal error from stderr, behind its [ERROR] prefix, when stdout has no object', () => {
    const stderr = `[ERROR] ${pretty({
      session_id: SESSION,
      error: {
        type: 'FatalTurnLimitedError',
        message: 'Reached max session turns for this session.',
        code: 53,
      },
    })}\n`;

    const response = parseGeminiJsonOutput('', 53, 'gemini-2.5-pro', stderr);

    expect(response.stdout).toBe('');
    expect(response.exitCode).toBe(53);
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({
      result: 'Reached max session turns for this session.',
      isError: true,
      apiErrorStatus: '53',
      costUsd: null,
      modelUsed: 'gemini-2.5-pro',
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
    });
  });

  it('prefers the stdout object over stderr when both carry one', () => {
    const response = parseGeminiJsonOutput(
      pretty({ session_id: SESSION, response: 'from stdout' }),
      0,
      'gemini-2.5-pro',
      `[ERROR] ${pretty({ error: { type: 'Error', message: 'from stderr' } })}`,
    );
    expect(response.envelope).toMatchObject({ isError: false, result: 'from stdout' });
  });

  it('treats an error riding next to a partial response as a failure carrying the error message', () => {
    const response = parseGeminiJsonOutput(
      pretty({
        session_id: SESSION,
        response: 'half an ans',
        stats: stats({ 'gemini-2.5-pro': modelMetrics({ input: 10, candidates: 3 }) }),
        error: { type: 'INVALID_STREAM', message: 'Model stream ended with an invalid chunk.' },
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      result: 'Model stream ended with an invalid chunk.',
      apiErrorStatus: null,
      tokensIn: 10,
      tokensOut: 3,
    });
  });

  it('carries a string error code through as the api error status', () => {
    const response = parseGeminiJsonOutput(
      '',
      1,
      'gemini-2.5-pro',
      `[ERROR] ${pretty({ error: { type: 'Error', message: 'Quota exceeded', code: 'RESOURCE_EXHAUSTED' } })}`,
    );
    expect(response.envelope).toMatchObject({
      isError: true,
      apiErrorStatus: 'RESOURCE_EXHAUSTED',
      result: 'Quota exceeded',
    });
    expect(response.sessionId).toBeNull();
  });

  it('returns no envelope and no session for empty, non-JSON, or unrelated JSON output', () => {
    for (const [stdout, stderr] of [
      ['', ''],
      ['Error: Unknown argument: output-format\n', 'Usage: gemini [options]\n'],
      ['[1,2]\n"text"\n', ''],
      ['{"level":"info","msg":"starting"}\n', ''],
    ] as const) {
      const response = parseGeminiJsonOutput(stdout, 1, 'gemini-2.5-pro', stderr);
      expect(response.envelope).toBeNull();
      expect(response.sessionId).toBeNull();
      expect(response.stdout).toBe(stdout);
    }
  });

  it('returns no envelope for an object torn by a kill mid-write', () => {
    const whole = pretty({ session_id: SESSION, response: 'never finished {' });
    const response = parseGeminiJsonOutput(whole.slice(0, whole.length - 3), 143, 'gemini-2.5-pro');
    expect(response.envelope).toBeNull();
    expect(response.exitCode).toBe(143);
  });

  it('skips log lines before the object, CRLF endings, and a stray JSON log line', () => {
    const stdout = [
      'Loaded cached credentials.',
      '{"level":"debug","msg":"not the output"}',
      ...pretty({ session_id: SESSION, response: 'done' }).split('\n'),
      '',
    ].join('\r\n');
    const response = parseGeminiJsonOutput(stdout, 0, 'gemini-2.5-pro');
    expect(response.sessionId).toBe(SESSION);
    expect(response.envelope).toMatchObject({ isError: false, result: 'done' });
  });

  it('reads compact single-line JSON as well as the pretty-printed form', () => {
    const response = parseGeminiJsonOutput(
      `${JSON.stringify({ session_id: SESSION, response: 'compact' })}\n`,
      0,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ result: 'compact', sessionId: SESSION });
  });

  it('keeps tokens null without stats, and when any model lacks a number rather than under-counting', () => {
    const bare = parseGeminiJsonOutput(pretty({ response: 'no stats' }), 0, 'gemini-2.5-pro');
    expect(bare.envelope).toMatchObject({
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      modelUsed: 'gemini-2.5-pro',
    });

    const partial = parseGeminiJsonOutput(
      pretty({
        response: 'one model is malformed',
        stats: stats({
          'gemini-2.5-pro': modelMetrics({ input: 50, candidates: 9, cached: 1 }),
          'gemini-2.5-flash': { tokens: { input: 'lots', candidates: 2 } },
        }),
      }),
      0,
      'gemini-2.5-pro',
    );
    expect(partial.envelope).toMatchObject({ tokensIn: null, tokensOut: 11, cacheRead: null });
  });

  it('ignores malformed fields rather than trusting them', () => {
    const response = parseGeminiJsonOutput(
      pretty({ session_id: 42, response: ['not', 'a', 'string'], stats: 'not-an-object' }),
      0,
      'gemini-2.5-pro',
    );
    expect(response.sessionId).toBeNull();
    expect(response.envelope).toMatchObject({ result: null, isError: false, tokensIn: null });

    const emptySession = parseGeminiJsonOutput(
      pretty({ session_id: '', response: 'x' }),
      0,
      'gemini-2.5-pro',
    );
    expect(emptySession.sessionId).toBeNull();

    const arrayError = parseGeminiJsonOutput(
      pretty({ response: 'fine', error: ['not', 'an', 'object'] }),
      0,
      'gemini-2.5-pro',
    );
    expect(arrayError.envelope).toMatchObject({ isError: false, result: 'fine' });
  });

  it('reports a failure with no message as a null result, still an error', () => {
    const response = parseGeminiJsonOutput(
      pretty({ error: { type: 'Error' } }),
      1,
      'gemini-2.5-pro',
    );
    expect(response.envelope).toMatchObject({ isError: true, result: null, apiErrorStatus: null });
  });

  it('reports no model when none was requested and stats name none', () => {
    const response = parseGeminiJsonOutput(pretty({ response: 'x' }), 0, '');
    expect(response.envelope?.modelUsed).toBeNull();
  });
});
