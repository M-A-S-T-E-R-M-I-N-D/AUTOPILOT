// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  parseOllamaResponse,
  OllamaModel,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  type OllamaFetch,
} from '../../src/adapters/ollama.js';

describe('parseOllamaResponse', () => {
  it('maps a successful non-streaming response into a passing envelope', () => {
    const result = parseOllamaResponse(
      200,
      {
        model: 'llama3.2',
        response: 'the sky is blue because of Rayleigh scattering',
        done: true,
        total_duration: 5_043_500_667,
        prompt_eval_count: 26,
        eval_count: 290,
      },
      'llama3.2',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('the sky is blue because of Rayleigh scattering');
    expect(result.envelope).toEqual({
      result: 'the sky is blue because of Rayleigh scattering',
      isError: false,
      apiErrorStatus: null,
      costUsd: 0,
      numTurns: 1,
      durationMs: 5044, // 5_043_500_667ns rounded to ms
      stopReason: 'end_turn',
      modelUsed: 'llama3.2',
      tokensIn: 26,
      tokensOut: 290,
      cacheRead: null,
      cacheCreate: null,
    });
  });

  it('falls back to the requested model name when the response omits `model`', () => {
    const result = parseOllamaResponse(200, { response: 'ok', done: true }, 'ollama-local');
    expect(result.envelope?.modelUsed).toBe('ollama-local');
  });

  it("prefers the response body's own `model` field over the requested name", () => {
    const result = parseOllamaResponse(
      200,
      { model: 'llama3.2:latest', response: 'ok', done: true },
      'llama3.2',
    );
    expect(result.envelope?.modelUsed).toBe('llama3.2:latest');
  });

  it('reports stopReason null when `done` is not true', () => {
    const result = parseOllamaResponse(200, { response: 'partial', done: false }, 'llama3.2');
    expect(result.envelope?.stopReason).toBeNull();
  });

  it('reports durationMs null when total_duration is absent', () => {
    const result = parseOllamaResponse(200, { response: 'ok', done: true }, 'llama3.2');
    expect(result.envelope?.durationMs).toBeNull();
  });

  it('reports durationMs null when total_duration is a number but not finite', () => {
    const result = parseOllamaResponse(
      200,
      { response: 'ok', done: true, total_duration: NaN },
      'llama3.2',
    );
    expect(result.envelope?.durationMs).toBeNull();
  });

  it('reports stdout as an empty string when a passing response omits `response`', () => {
    const result = parseOllamaResponse(200, { done: true }, 'llama3.2');
    expect(result.stdout).toBe('');
  });

  it('treats a non-2xx status as a failed envelope using the body error message', () => {
    const result = parseOllamaResponse(404, { error: "model 'ghost' not found" }, 'ghost');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("model 'ghost' not found");
    expect(result.envelope).toEqual({
      result: null,
      isError: true,
      apiErrorStatus: '404',
      costUsd: 0,
      numTurns: null,
      durationMs: null,
      stopReason: null,
      modelUsed: 'ghost',
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      cacheCreate: null,
    });
  });

  it('falls back to a generic message when a non-2xx body carries no `error` field', () => {
    const result = parseOllamaResponse(503, {}, 'llama3.2');
    expect(result.stdout).toBe('Ollama HTTP 503');
  });

  it('falls back to a generic message when `error` is present but not a string', () => {
    const result = parseOllamaResponse(503, { error: 12345 }, 'llama3.2');
    expect(result.stdout).toBe('Ollama HTTP 503');
  });

  it('treats a below-200 status as an error even though it is also below 300', () => {
    const result = parseOllamaResponse(100, {}, 'llama3.2');
    expect(result.exitCode).toBe(1);
    expect(result.envelope?.isError).toBe(true);
  });

  it('treats status 300 itself as an error (the 2xx range is exclusive of it)', () => {
    const result = parseOllamaResponse(300, {}, 'llama3.2');
    expect(result.exitCode).toBe(1);
    expect(result.envelope?.isError).toBe(true);
  });

  it('treats status 299 as success, the last status inside the 2xx range', () => {
    const result = parseOllamaResponse(299, { response: 'ok', done: true }, 'llama3.2');
    expect(result.exitCode).toBe(0);
    expect(result.envelope?.isError).toBe(false);
  });

  it('treats a non-object body as a failed envelope instead of throwing', () => {
    const result = parseOllamaResponse(200, null, 'llama3.2');
    expect(result.exitCode).toBe(1);
    expect(result.envelope?.isError).toBe(true);
  });

  it('treats a primitive body as malformed instead of throwing', () => {
    const result = parseOllamaResponse(200, 'not json', 'llama3.2');
    expect(result.exitCode).toBe(1);
    expect(result.envelope?.isError).toBe(true);
  });
});

describe('ollama default constants', () => {
  it('DEFAULT_OLLAMA_BASE_URL points at the local Ollama server', () => {
    expect(DEFAULT_OLLAMA_BASE_URL).toBe('http://127.0.0.1:11434');
  });

  it('DEFAULT_OLLAMA_TIMEOUT_MS is five minutes', () => {
    expect(DEFAULT_OLLAMA_TIMEOUT_MS).toBe(300_000);
  });
});

describe('OllamaModel.invoke', () => {
  function fakeFetch(status: number, body: unknown): OllamaFetch {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it('POSTs model/prompt/stream:false to /api/generate against the default base URL', async () => {
    const fetchImpl = fakeFetch(200, { model: 'llama3.2', response: 'hi', done: true });
    const model = new OllamaModel({ fetchImpl });
    await model.invoke('llama3.2', 'say hi');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/api/generate`);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ model: 'llama3.2', prompt: 'say hi', stream: false });
  });

  it('honors a caller-supplied baseUrl', async () => {
    const fetchImpl = fakeFetch(200, { response: 'hi', done: true });
    const model = new OllamaModel({ fetchImpl, baseUrl: 'http://192.168.1.50:11434' });
    await model.invoke('llama3.2', 'hi');
    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('http://192.168.1.50:11434/api/generate');
  });

  it('resolves a passing ModelResponse on a successful call', async () => {
    const fetchImpl = fakeFetch(200, { model: 'llama3.2', response: 'hi there', done: true });
    const model = new OllamaModel({ fetchImpl });
    const result = await model.invoke('llama3.2', 'hi');
    expect(result.exitCode).toBe(0);
    expect(result.envelope?.result).toBe('hi there');
  });

  it('turns a network rejection into a failed ModelResponse instead of throwing', async () => {
    const fetchImpl: OllamaFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const model = new OllamaModel({ fetchImpl });
    const result = await model.invoke('llama3.2', 'hi');
    expect(result.exitCode).toBe(1);
    expect(result.envelope).not.toBeNull();
    expect(result.envelope?.isError).toBe(true);
    expect(result.stdout).toBe('ECONNREFUSED');
    expect(result.envelope?.modelUsed).toBe('llama3.2');
  });

  it('stringifies a non-Error rejection instead of crashing on `.message`', async () => {
    const fetchImpl: OllamaFetch = vi.fn().mockRejectedValue('connection reset');
    const model = new OllamaModel({ fetchImpl });
    const result = await model.invoke('llama3.2', 'hi');
    expect(result.stdout).toBe('connection reset');
  });

  it('aborts and reports failure when the request exceeds the timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: OllamaFetch = vi.fn(
        (_url, init) =>
          new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>(
            (_resolve, reject) => {
              init.signal?.addEventListener('abort', () =>
                reject(new Error('The operation was aborted')),
              );
            },
          ),
      );
      const model = new OllamaModel({ fetchImpl, timeoutMs: 1000 });
      const resultPromise = model.invoke('llama3.2', 'hi');
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;
      expect(result.exitCode).toBe(1);
      expect(result.envelope?.isError).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the abort timer after a successful call, leaving no dangling timer', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = fakeFetch(200, { response: 'hi', done: true });
      const model = new OllamaModel({ fetchImpl, timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS });
      await model.invoke('llama3.2', 'hi');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults the timeout to DEFAULT_OLLAMA_TIMEOUT_MS when unspecified', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: OllamaFetch = vi.fn(
        (_url, init) =>
          new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>(
            (_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            },
          ),
      );
      const model = new OllamaModel({ fetchImpl });
      const resultPromise = model.invoke('llama3.2', 'hi');
      await vi.advanceTimersByTimeAsync(DEFAULT_OLLAMA_TIMEOUT_MS - 1);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await resultPromise;
      expect(result.exitCode).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the global fetch when no fetchImpl is injected', () => {
    const model = new OllamaModel({});
    expect(model).toBeInstanceOf(OllamaModel);
  });
});
