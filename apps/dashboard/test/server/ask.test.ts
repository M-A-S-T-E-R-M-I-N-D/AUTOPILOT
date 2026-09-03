// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit coverage for `handleAsk`/`handleAskStream`'s shared `parseAskRequest`
 * guard (method, Content-Type, body size, JSON parse, persona) — the
 * higher-level `server.test.ts` integration suite exercises the
 * question/history/view validation branches extensively but never drives a
 * non-POST method, an oversized body, malformed JSON, or an invalid persona
 * through `/api/ask` itself (only `/api/ask/stream` gets a persona-validation
 * case), leaving those branches of the shared guard unverified for `handleAsk`.
 */

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  handleAsk,
  handleAskStream,
  type AskApi,
  type AskStreamApi,
} from '../../src/server/ask.js';
import type { RateLimiter } from '../../src/server/rate-limit.js';

/** Minimal `IncomingMessage` stand-in: the handlers touch `.method`,
 *  `.headers`, `.on()`/`.socket.remoteAddress` (via `readBody`/`clientKey`). */
function fakeRequest(opts: {
  method?: string | undefined;
  contentType?: string;
  remoteAddress?: string;
}): {
  method: string | undefined;
  headers: Record<string, string | undefined>;
  socket: { remoteAddress: string | undefined };
  on: EventEmitter['on'];
  emit: EventEmitter['emit'];
} {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    method: opts.method,
    headers: opts.contentType === undefined ? {} : { 'content-type': opts.contentType },
    socket: { remoteAddress: opts.remoteAddress ?? '203.0.113.7' },
  });
}

/** Minimal `ServerResponse` stand-in: these tests only exercise the guard's
 *  early-return `sendJson` calls, so `.writeHead()`/`.end()` is enough. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

function fakeLimiter(allow: boolean): RateLimiter {
  return { allow: vi.fn().mockReturnValue(allow) };
}

/** Sends a POST request with a JSON body: emits the body chunk then 'end'
 *  on the same tick the handler starts listening, since `readBody` attaches
 *  its listeners synchronously before the first `await`. */
async function postJson(
  handler: (req: unknown, res: unknown) => Promise<void>,
  req: ReturnType<typeof fakeRequest>,
  res: ReturnType<typeof fakeResponse>,
  body: unknown,
): Promise<void> {
  const pending = handler(req, res);
  req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  req.emit('end');
  await pending;
}

describe('handleAsk', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: AskApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleAsk(req as never, res as never, api, {}, limiter);

  it('returns 405 for a non-POST method', async () => {
    const api: AskApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'GET' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: AskApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'request body too large' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: AskApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson(
      (r, s) => call(r as never, s as never, api, fakeLimiter(true)),
      req,
      res,
      '{not json',
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'invalid JSON' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid persona without calling the model', async () => {
    const api: AskApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      question: 'how does this work?',
      persona: 'admin',
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'persona must be one of: genius, architect' });
    expect(api).not.toHaveBeenCalled();
  });
});

describe('handleAskStream', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: AskStreamApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleAskStream(req as never, res as never, api, {}, limiter);

  it('returns 405 for a non-POST method', async () => {
    const api: AskStreamApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'DELETE' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: AskStreamApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'request body too large' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: AskStreamApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson(
      (r, s) => call(r as never, s as never, api, fakeLimiter(true)),
      req,
      res,
      'nope{',
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'invalid JSON' });
    expect(api).not.toHaveBeenCalled();
  });
});
