// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit coverage for the onboarding routes' request guards (api missing,
 * method, Content-Type, body size, JSON parse, rate limit) and success/
 * failure payload shapes — same shape `test/server/report-compose-tasks.test.ts`
 * exercises for its sibling POST route.
 */

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  handleOnboardingSample,
  handleOnboardingContributions,
  type OnboardingApi,
  type SampleAddResult,
} from '../../src/server/onboarding-route.js';
import type { RateLimiter } from '../../src/server/rate-limit.js';
import { NO_CONTRIBUTIONS } from '../../src/flight/contributions.js';

function fakeRequest(opts: { method?: string | undefined; contentType?: string }): {
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
    socket: { remoteAddress: '203.0.113.7' },
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
  req: ReturnType<typeof fakeRequest>,
  res: ReturnType<typeof fakeResponse>,
  api: OnboardingApi | undefined,
  limiter: RateLimiter,
  body: unknown,
): Promise<void> {
  const pending = handleOnboardingSample(req as never, res as never, api, {}, limiter);
  req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  req.emit('end');
  await pending;
}

describe('handleOnboardingSample', () => {
  it('returns 404 when no onboarding api is wired', async () => {
    const res = fakeResponse();
    await handleOnboardingSample(
      fakeRequest({ method: 'POST' }) as never,
      res as never,
      undefined,
      {},
      fakeLimiter(true),
    );
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'onboarding API unavailable' });
  });

  it('returns 405 for a non-POST method', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const res = fakeResponse();
    await handleOnboardingSample(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(true),
    );
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api.addSample).not.toHaveBeenCalled();
  });

  it('returns 415 for a non-JSON Content-Type', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const res = fakeResponse();
    await handleOnboardingSample(
      fakeRequest({ method: 'POST', contentType: 'text/plain' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(true),
    );
    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
    expect(api.addSample).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit is exceeded, without calling the api', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const res = fakeResponse();
    await handleOnboardingSample(
      fakeRequest({ method: 'POST', contentType: 'application/json' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(false),
    );
    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(api.addSample).not.toHaveBeenCalled();
  });

  it('returns 413 when the body exceeds the size limit', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    const pending = handleOnboardingSample(req as never, res as never, api, {}, fakeLimiter(true));
    req.emit('data', Buffer.from('x'.repeat(4 * 1024 + 1)));
    req.emit('end');
    await pending;
    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(api.addSample).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson(req, res, api, fakeLimiter(true), '{not json');
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'invalid JSON' });
    expect(api.addSample).not.toHaveBeenCalled();
  });

  it('passes the sample name through and returns the api result on success', async () => {
    const result: SampleAddResult = { ok: true, folder: '/tmp/x', projectId: 'p1', message: 'ok' };
    const api: OnboardingApi = {
      addSample: vi.fn().mockResolvedValue(result),
      contributions: vi.fn(),
    };
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson(req, res, api, fakeLimiter(true), { sample: 'demo-repo' });
    expect(api.addSample).toHaveBeenCalledWith('demo-repo');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(result);
  });

  it('defaults a missing sample field to an empty string', async () => {
    const api: OnboardingApi = {
      addSample: vi.fn().mockResolvedValue({ ok: false, message: 'no sample' }),
      contributions: vi.fn(),
    };
    const req = fakeRequest({ method: 'POST', contentType: 'application/json' });
    const res = fakeResponse();
    await postJson(req, res, api, fakeLimiter(true), {});
    expect(api.addSample).toHaveBeenCalledWith('');
  });
});

describe('handleOnboardingContributions', () => {
  it('returns 404 when no onboarding api is wired', async () => {
    const res = fakeResponse();
    await handleOnboardingContributions(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      undefined,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'onboarding API unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: OnboardingApi = { addSample: vi.fn(), contributions: vi.fn() };
    const res = fakeResponse();
    await handleOnboardingContributions(
      fakeRequest({ method: 'POST' }) as never,
      res as never,
      api,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api.contributions).not.toHaveBeenCalled();
  });

  it('answers GET with the api result', async () => {
    const counts = { hasIssue: true, hasPr: true, hasMergedPr: false };
    const api: OnboardingApi = {
      addSample: vi.fn(),
      contributions: vi.fn().mockResolvedValue(counts),
    };
    const res = fakeResponse();
    await handleOnboardingContributions(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(counts);
  });

  it('degrades to NO_CONTRIBUTIONS with a 200, never a 500, when the read throws', async () => {
    const api: OnboardingApi = {
      addSample: vi.fn(),
      contributions: vi.fn().mockRejectedValue(new Error('gh unavailable')),
    };
    const res = fakeResponse();
    await handleOnboardingContributions(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(NO_CONTRIBUTIONS);
  });
});
