// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  handleGithubSyncExecute,
  handleGithubIssueExecute,
  handleGithubPrExecute,
  type GithubSyncExecuteApi,
  type GithubIssueExecuteApi,
  type GithubPrExecuteApi,
} from '../../src/server/github-execute.js';
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

describe('handleGithubSyncExecute', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: GithubSyncExecuteApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleGithubSyncExecute(req as never, res as never, api, {}, limiter);

  it('returns 404 when the sync execute API is unavailable', async () => {
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST' }), res, undefined, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'github sync execute unavailable' });
  });

  it('returns 405 for a non-POST method', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'GET' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('rejects a request without an application/json Content-Type', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
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
    const api: GithubSyncExecuteApi = vi.fn();
    const limiter = fakeLimiter(false);
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST', contentType: 'application/json' }), res, api, limiter);

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
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

  it('returns 400 for an invalid visibility value', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      visibility: 'internal',
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'visibility must be "private" or "public"' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when the project id is missing', async () => {
    const api: GithubSyncExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {});

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a project id is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('defaults visibility to private when omitted', async () => {
    const api: GithubSyncExecuteApi = vi
      .fn()
      .mockResolvedValue({ ok: true, action: 'create', details: 'created' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
    });

    expect(api).toHaveBeenCalledWith('p1', 'private');
  });

  it('accepts an explicit public visibility', async () => {
    const api: GithubSyncExecuteApi = vi
      .fn()
      .mockResolvedValue({ ok: true, action: 'create', details: 'created' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      visibility: 'public',
    });

    expect(api).toHaveBeenCalledWith('p1', 'public');
  });

  it('returns 404 for an unknown project', async () => {
    const api: GithubSyncExecuteApi = vi.fn().mockResolvedValue(null);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'nope',
    });

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'unknown project' });
  });

  it('returns 200 with the result when the sync succeeds', async () => {
    const result = { ok: true, action: 'push', details: 'pushed 3 commits' };
    const api: GithubSyncExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('returns 409 when the sync command refuses', async () => {
    const result = { ok: false, action: 'push', details: 'git push rejected' };
    const api: GithubSyncExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
    });

    expect(res.writeHead).toHaveBeenCalledWith(409, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('returns 500 with the error message when the API throws', async () => {
    const api: GithubSyncExecuteApi = vi.fn().mockRejectedValue(new Error('gh not found'));
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
    });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ ok: false, error: 'gh not found' });
  });
});

describe('handleGithubIssueExecute', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: GithubIssueExecuteApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleGithubIssueExecute(req as never, res as never, api, {}, limiter);

  it('returns 404 when the issue execute API is unavailable', async () => {
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST' }), res, undefined, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'github issue execute unavailable' });
  });

  it('returns 405 for a non-POST method', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'DELETE' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('rejects a request without an application/json Content-Type', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 429 once the rate limiter denies the request', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(
      fakeRequest({ method: 'POST', contentType: 'application/json' }),
      res,
      api,
      fakeLimiter(false),
    );

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(readBody(res)).toEqual({
      error: 'Too many GitHub issue requests — slow down and try again shortly.',
    });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson(
      (r, s) => call(r as never, s as never, api, fakeLimiter(true)),
      req,
      res,
      '{bad',
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is missing', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {});

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a non-empty title is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is only whitespace', async () => {
    const api: GithubIssueExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: '   ',
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('defaults body to an empty string when omitted', async () => {
    const api: GithubIssueExecuteApi = vi.fn().mockResolvedValue({ ok: true, details: 'opened' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: 'a bug',
    });

    expect(api).toHaveBeenCalledWith('a bug', '');
  });

  it('returns 200 with the result when the issue is created', async () => {
    const result = { ok: true, details: 'created', url: 'https://github.com/x/y/issues/1' };
    const api: GithubIssueExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: 'a bug',
      body: 'details',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('returns 409 when the issue command refuses', async () => {
    const result = { ok: false, details: 'gh issue create failed' };
    const api: GithubIssueExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: 'a bug',
    });

    expect(res.writeHead).toHaveBeenCalledWith(409, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('returns 500 with the error message when the API throws', async () => {
    const api: GithubIssueExecuteApi = vi.fn().mockRejectedValue(new Error('no network'));
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: 'a bug',
    });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ ok: false, error: 'no network' });
  });
});

describe('handleGithubPrExecute', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: GithubPrExecuteApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleGithubPrExecute(req as never, res as never, api, {}, limiter);

  it('returns 404 when the PR execute API is unavailable', async () => {
    const res = fakeResponse();

    await call(fakeRequest({ method: 'POST' }), res, undefined, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'github pr execute unavailable' });
  });

  it('returns 405 for a non-POST method', async () => {
    const api: GithubPrExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(fakeRequest({ method: 'PATCH' }), res, api, fakeLimiter(true));

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('rejects a request without an application/json Content-Type', async () => {
    const api: GithubPrExecuteApi = vi.fn();
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
    const api: GithubPrExecuteApi = vi.fn();
    const res = fakeResponse();

    await call(
      fakeRequest({ method: 'POST', contentType: 'application/json' }),
      res,
      api,
      fakeLimiter(false),
    );

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: GithubPrExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    await pending;

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const api: GithubPrExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson(
      (r, s) => call(r as never, s as never, api, fakeLimiter(true)),
      req,
      res,
      'nope{',
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when the project id is missing', async () => {
    const api: GithubPrExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      title: 'a fix',
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a project id is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is missing', async () => {
    const api: GithubPrExecuteApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a non-empty title is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown project', async () => {
    const api: GithubPrExecuteApi = vi.fn().mockResolvedValue(null);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'nope',
      title: 'a fix',
    });

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'unknown project' });
  });

  it('returns 200 with the result when the PR is created', async () => {
    const result = { ok: true, details: 'created', url: 'https://github.com/x/y/pull/2' };
    const api: GithubPrExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
      body: 'details',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(result);
    expect(api).toHaveBeenCalledWith('p1', 'a fix', 'details', undefined);
  });

  it('defaults body to an empty string when omitted', async () => {
    const api: GithubPrExecuteApi = vi.fn().mockResolvedValue({ ok: true, details: 'created' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
    });

    expect(api).toHaveBeenCalledWith('p1', 'a fix', '', undefined);
  });

  it('threads a valid issueNumber through to the API (epic 0007 "PLATFORM 6/7" delivery leg)', async () => {
    const api: GithubPrExecuteApi = vi.fn().mockResolvedValue({ ok: true, details: 'created' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
      body: 'details',
      issueNumber: 42,
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(api).toHaveBeenCalledWith('p1', 'a fix', 'details', 42);
  });

  it('returns 400 for a zero, negative, or fractional issueNumber without calling the API', async () => {
    for (const bad of [0, -1, 1.5]) {
      const api: GithubPrExecuteApi = vi.fn();
      const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
      const res = fakeResponse();

      await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
        project: 'p1',
        title: 'a fix',
        issueNumber: bad,
      });

      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
      expect(readBody(res)).toEqual({ error: 'issueNumber must be a positive integer' });
      expect(api).not.toHaveBeenCalled();
    }
  });

  it('returns 409 when the PR command refuses', async () => {
    const result = { ok: false, details: 'gh pr create failed' };
    const api: GithubPrExecuteApi = vi.fn().mockResolvedValue(result);
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
    });

    expect(res.writeHead).toHaveBeenCalledWith(409, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('returns 500 with the error message when the API throws', async () => {
    const api: GithubPrExecuteApi = vi.fn().mockRejectedValue(new Error('fork failed'));
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
    });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ ok: false, error: 'fork failed' });
  });

  it('returns a generic message when the thrown error is not an Error instance', async () => {
    const api: GithubPrExecuteApi = vi.fn().mockRejectedValue('boom');
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();

    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      project: 'p1',
      title: 'a fix',
    });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ ok: false, error: 'github pr execute failed' });
  });
});
