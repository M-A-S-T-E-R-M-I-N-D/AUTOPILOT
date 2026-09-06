// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit coverage for `handleReportCompose`'s request guard (method,
 * Content-Type, body size, JSON parse, description/contextJson/moduleSources
 * validation, rate limit, missing api) — same shape `test/server/ask.test.ts`
 * exercises for the sibling `/api/ask` guard.
 */

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { handleReportCompose, type ReportComposeApi } from '../../src/server/report-compose.js';
import type { RateLimiter } from '../../src/server/rate-limit.js';

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

describe('handleReportCompose', () => {
  const call = (
    req: ReturnType<typeof fakeRequest>,
    res: ReturnType<typeof fakeResponse>,
    api: ReportComposeApi | undefined,
    limiter: RateLimiter,
  ): Promise<void> => handleReportCompose(req as never, res as never, api, {}, limiter);

  it('returns 404 when no api is wired', async () => {
    const res = fakeResponse();
    await call(fakeRequest({ method: 'POST' }), res, undefined, fakeLimiter(true));
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('returns 429 when the rate limit is exceeded, without calling the api', async () => {
    const api: ReportComposeApi = vi.fn();
    const res = fakeResponse();
    await call(fakeRequest({ method: 'POST' }), res, api, fakeLimiter(false));
    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 405 for a non-POST method', async () => {
    const api: ReportComposeApi = vi.fn();
    const res = fakeResponse();
    await call(fakeRequest({ method: 'GET' }), res, api, fakeLimiter(true));
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 415 for a non-JSON Content-Type', async () => {
    const api: ReportComposeApi = vi.fn();
    const res = fakeResponse();
    await call(
      fakeRequest({ method: 'POST', contentType: 'text/plain' }),
      res,
      api,
      fakeLimiter(true),
    );
    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: ReportComposeApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    const pending = call(req, res, api, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(64 * 1024 + 1)));
    req.emit('end');
    await pending;
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
  });

  it('returns 400 on malformed JSON', async () => {
    const api: ReportComposeApi = vi.fn();
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
  });

  it('returns 400 when description is blank', async () => {
    const api: ReportComposeApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: '   ',
    });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'a description is required' });
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when description exceeds the length cap', async () => {
    const api: ReportComposeApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'x'.repeat(4001),
    });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });

  it('returns 400 when moduleSources is not an array of short strings', async () => {
    const api: ReportComposeApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'note',
      moduleSources: [1, 2, 3],
    });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 when contextJson exceeds the length cap', async () => {
    const api: ReportComposeApi = vi.fn();
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'note',
      contextJson: 'x'.repeat(8001),
    });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
  });

  it('passes description, contextJson, and moduleSources through to the api and returns its result', async () => {
    const api: ReportComposeApi = vi.fn().mockResolvedValue({
      ok: true,
      title: 't',
      body: 'b',
      labels: ['bug'],
      action: 'issue',
      language: 'en',
    });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'note',
      contextJson: '{"selector":"#x"}',
      moduleSources: ['a.ts'],
    });
    expect(api).toHaveBeenCalledWith('note', '{"selector":"#x"}', ['a.ts']);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toMatchObject({ ok: true, title: 't' });
  });

  it('defaults an absent moduleSources to an empty array', async () => {
    const api: ReportComposeApi = vi.fn().mockResolvedValue({ ok: false, reasoning: 'x' });
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'note',
    });
    expect(api).toHaveBeenCalledWith('note', undefined, []);
  });

  it('returns 500 when the api throws', async () => {
    const api: ReportComposeApi = vi.fn().mockRejectedValue(new Error('boom'));
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson((r, s) => call(r as never, s as never, api, fakeLimiter(true)), req, res, {
      description: 'note',
    });
    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'boom' });
  });
});
