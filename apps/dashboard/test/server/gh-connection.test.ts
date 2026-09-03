// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  handleGhStatus,
  handleGhLts,
  type GhApi,
  type GhLtsApi,
} from '../../src/server/gh-connection.js';
import type { RateLimiter } from '../../src/server/rate-limit.js';
import { ltsChipMeta } from '@autopilot/engine';

/** Minimal `IncomingMessage` stand-in: the handlers only touch `.method`,
 *  `.headers`, and (via `clientKey`) `.socket.remoteAddress`. */
function fakeRequest(opts: {
  method?: string | undefined;
  contentType?: string;
  remoteAddress?: string;
}): {
  method: string | undefined;
  headers: Record<string, string | undefined>;
  socket: { remoteAddress: string | undefined };
} {
  return {
    method: opts.method,
    headers: opts.contentType === undefined ? {} : { 'content-type': opts.contentType },
    socket: { remoteAddress: opts.remoteAddress ?? '203.0.113.7' },
  };
}

/** Minimal `ServerResponse` stand-in: the handlers only call `.writeHead()`/`.end()` via `sendJson`. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

describe('handleGhStatus', () => {
  it('returns 404 when the gh API is unavailable', async () => {
    const res = fakeResponse();

    await handleGhStatus(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'gh API unavailable' });
  });

  it('returns 405 for a non-GET method', async () => {
    const api: GhApi = { getStatus: vi.fn() };
    const res = fakeResponse();

    await handleGhStatus(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const status = { present: true, version: '2.60.0', authenticated: true, login: 'octocat' };
    const api: GhApi = { getStatus: vi.fn().mockResolvedValue(status) };
    const res = fakeResponse();

    await handleGhStatus(fakeRequest({ method: undefined }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(status);
  });

  it('serves the status on GET', async () => {
    const status = { present: false, version: null, authenticated: false, login: null };
    const api: GhApi = { getStatus: vi.fn().mockResolvedValue(status) };
    const res = fakeResponse();

    await handleGhStatus(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(status);
  });
});

describe('handleGhLts', () => {
  function fakeLimiter(allow: boolean): RateLimiter {
    return { allow: vi.fn().mockReturnValue(allow) };
  }

  const cached = {
    checkedAt: null,
    latestTag: null,
    runningVersion: '0.11.0',
    chip: ltsChipMeta('0.11.0', null),
  };
  const checked = {
    checkedAt: '2026-08-23T00:00:00.000Z',
    latestTag: 'v0.12.0',
    runningVersion: '0.11.0',
    chip: ltsChipMeta('0.11.0', 'v0.12.0'),
  };

  it('returns 404 when the gh LTS API is unavailable', async () => {
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      undefined,
      {},
      fakeLimiter(true),
    );

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'gh LTS API unavailable' });
  });

  it('serves the cached result on GET without consuming the rate limit', async () => {
    const api: GhLtsApi = { getCached: vi.fn().mockReturnValue(cached), check: vi.fn() };
    const limiter = fakeLimiter(true);
    const res = fakeResponse();

    await handleGhLts(fakeRequest({ method: 'GET' }) as never, res as never, api, {}, limiter);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(cached);
    expect(limiter.allow).not.toHaveBeenCalled();
    expect(api.check).not.toHaveBeenCalled();
  });

  it('returns 405 for a method that is neither GET nor POST', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn() };
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'PUT' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(true),
    );

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
  });

  it('rejects a POST without an application/json Content-Type', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn() };
    const limiter = fakeLimiter(true);
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'POST', contentType: 'text/plain' }) as never,
      res as never,
      api,
      {},
      limiter,
    );

    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'Content-Type must be application/json' });
    expect(limiter.allow).not.toHaveBeenCalled();
    expect(api.check).not.toHaveBeenCalled();
  });

  it('rejects a POST with no Content-Type at all', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn() };
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'POST' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(true),
    );

    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
  });

  it('returns 429 once the rate limiter denies the request', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn() };
    const limiter = fakeLimiter(false);
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'POST', contentType: 'application/json' }) as never,
      res as never,
      api,
      {},
      limiter,
    );

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(readBody(res)).toEqual({
      error: 'Too many GitHub LTS check requests — slow down and try again shortly.',
    });
    expect(api.check).not.toHaveBeenCalled();
  });

  it('runs the check and serves its result on an allowed POST', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn().mockResolvedValue(checked) };
    const limiter = fakeLimiter(true);
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({ method: 'POST', contentType: 'application/json; charset=utf-8' }) as never,
      res as never,
      api,
      {},
      limiter,
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(checked);
    expect(api.check).toHaveBeenCalledTimes(1);
  });

  it('keys the rate limiter off the request client address', async () => {
    const api: GhLtsApi = { getCached: vi.fn(), check: vi.fn().mockResolvedValue(checked) };
    const limiter = fakeLimiter(true);
    const res = fakeResponse();

    await handleGhLts(
      fakeRequest({
        method: 'POST',
        contentType: 'application/json',
        remoteAddress: '198.51.100.9',
      }) as never,
      res as never,
      api,
      {},
      limiter,
    );

    expect(limiter.allow).toHaveBeenCalledWith('198.51.100.9', expect.any(Number));
  });
});
