// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  handlePoolClient,
  handlePublicity,
  handlePoolClientExecute,
  type PoolClientApi,
  type PublicityApi,
  type PoolClientExecuteApi,
} from '../../src/server/pool-client.js';
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

/** Minimal `ServerResponse` stand-in: the handlers only call `.writeHead()`/`.end()` via `sendJson`. */
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

describe('handlePoolClient', () => {
  it('returns 404 when the pool client API is unavailable', async () => {
    const res = fakeResponse();

    await handlePoolClient(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'pool client unavailable' });
  });

  it('returns 405 for a non-GET method', async () => {
    const api: PoolClientApi = vi.fn();
    const res = fakeResponse();

    await handlePoolClient(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const entries = [
      {
        number: 42,
        title: 'fix the thing',
        url: 'https://github.com/octocat/hello-world/issues/42',
        decision: 'claim' as const,
        reasoning: 'unclaimed and open',
      },
    ];
    const api: PoolClientApi = vi.fn().mockResolvedValue(entries);
    const res = fakeResponse();

    await handlePoolClient(fakeRequest({ method: undefined }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries });
  });

  it('degrades to { entries: [] } instead of crashing when the read throws', async () => {
    const api: PoolClientApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handlePoolClient(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries: [] });
  });
});

describe('handlePublicity', () => {
  it('returns 404 when the publicity API is unavailable', async () => {
    const res = fakeResponse();

    await handlePublicity(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'publicity unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: PublicityApi = vi.fn();
    const res = fakeResponse();

    await handlePublicity(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('previews the publicity affordances on GET', async () => {
    const affordances = [
      {
        id: 'repo' as const,
        label: 'View repo',
        url: 'https://github.com/octocat/hello-world',
        dormant: false,
        reasoning: 'octocat/hello-world is public — publicity affordances are live',
      },
    ];
    const api: PublicityApi = vi.fn().mockResolvedValue(affordances);
    const res = fakeResponse();

    await handlePublicity(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ affordances });
  });

  it('degrades to { affordances: [] } instead of crashing when the read throws', async () => {
    const api: PublicityApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handlePublicity(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ affordances: [] });
  });
});

describe('handlePoolClientExecute', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: PoolClientExecuteApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handlePoolClientExecute(req as never, res as never, api, {}, limiter);

  const claimResult = {
    number: 42,
    decision: 'claim' as const,
    reasoning: 'unclaimed and open',
    commandResults: [{ command: 'gh issue edit 42 --add-assignee @me', ok: true }],
    taskQueued: false,
  };

  it('returns 404 when the pool client execute API is unavailable', async () => {
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST' }), res, undefined, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'pool client execute unavailable' });
  });

  it('returns 405 for a non-POST method', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'GET' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('rejects a request without an application/json Content-Type', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(
      fakeRequest({ method: 'POST', contentType: 'text/plain' }),
      res,
      api,
      fakeLimiter(true),
    );

    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 429 once the rate limiter denies the request', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const limiter = fakeLimiter(false);
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST', contentType: 'application/json' }), res, api, limiter);

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(readBody(res)).toEqual({
      error: 'Too many pool client requests — slow down and try again shortly.',
    });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: PoolClientExecuteApi = vi.fn();
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

  it('returns 400 when the issue number is missing', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {});

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a positive integer issue number is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive-integer issue number', async () => {
    const api: PoolClientExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      number: -1,
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a positive integer issue number is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('omits the project id when it is not a non-empty string', async () => {
    const api: PoolClientExecuteApi = vi.fn().mockResolvedValue(claimResult);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      number: 42,
      project: '',
    });

    expect(api).toHaveBeenCalledWith(42, undefined);
  });

  it('claims the issue and serves the result on a valid request', async () => {
    const api: PoolClientExecuteApi = vi.fn().mockResolvedValue(claimResult);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      number: 42,
      project: 'p1',
    });

    expect(api).toHaveBeenCalledWith(42, 'p1');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(claimResult);
  });

  it('returns 500 with the error message when the API rejects', async () => {
    const api: PoolClientExecuteApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      number: 42,
    });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'gh unavailable' });
  });
});
