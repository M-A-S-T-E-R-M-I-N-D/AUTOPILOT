// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import {
  handleRoutingConsole,
  handleRoutingConsoleRoute,
  type RoutingConsoleApi,
  type RoutingConsoleRouteApi,
} from '../../src/server/routing-console.js';
import type { RateLimiter } from '../../src/server/rate-limit.js';
import {
  UNREADABLE_ROUTING_CONSOLE,
  type RoutingConsoleSnapshot,
} from '../../src/flight/routing-console.js';

/** Minimal `IncomingMessage` stand-in: the handler only touches `.method` and `.url`. */
function fakeRequest(opts: { method?: string | undefined; url?: string }): {
  method: string | undefined;
  url: string | undefined;
} {
  return { method: opts.method, url: opts.url };
}

/** Minimal `ServerResponse` stand-in: the handler only calls `.writeHead()`/`.end()` via `sendJson`. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

const snapshot: RoutingConsoleSnapshot = {
  milestones: [
    { title: 'V1', openIssues: 1, closedIssues: 3, dueOn: null, url: null, percentDone: 75 },
  ],
  labelQueues: [{ label: 'priority: high', issues: [4] }],
  unprioritized: [2],
  claims: [{ login: 'amy', issues: [4] }],
  unclaimed: [2],
};

describe('handleRoutingConsole', () => {
  it('returns 404 when the routing console API is unwired', async () => {
    const res = fakeResponse();

    await handleRoutingConsole(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      undefined,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'routing console unavailable' });
  });

  it('returns 405 for a non-GET method and never reads (read-only endpoint)', async () => {
    const api: RoutingConsoleApi = vi.fn();
    const res = fakeResponse();

    await handleRoutingConsole(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const api: RoutingConsoleApi = vi.fn().mockResolvedValue(snapshot);
    const res = fakeResponse();

    await handleRoutingConsole(fakeRequest({ method: undefined }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(snapshot);
  });

  it('returns the console on GET', async () => {
    const api: RoutingConsoleApi = vi.fn().mockResolvedValue(snapshot);
    const res = fakeResponse();

    await handleRoutingConsole(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(snapshot);
  });

  it('answers the unreadable console, milestones unknown, when the read throws', async () => {
    const api: RoutingConsoleApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handleRoutingConsole(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(UNREADABLE_ROUTING_CONSOLE);
    expect((readBody(res) as RoutingConsoleSnapshot).milestones).toBeNull();
  });

  it("hands the read a project page's ?project= id, and none for the home page", async () => {
    const api = vi.fn<RoutingConsoleApi>().mockResolvedValue(snapshot);

    await handleRoutingConsole(
      fakeRequest({ method: 'GET', url: '/api/routing-console?project=p1' }) as never,
      fakeResponse() as never,
      api,
      {},
    );
    await handleRoutingConsole(
      fakeRequest({ method: 'GET', url: '/api/routing-console?project=' }) as never,
      fakeResponse() as never,
      api,
      {},
    );
    await handleRoutingConsole(
      fakeRequest({ method: 'GET', url: '/api/routing-console' }) as never,
      fakeResponse() as never,
      api,
      {},
    );

    expect(api.mock.calls).toEqual([['p1'], [undefined], [undefined]]);
  });
});

/** A POST `IncomingMessage` stand-in: `readBody` listens on it and
 *  `clientKey` reads its socket. */
function fakePost(contentType: string | undefined = 'application/json') {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    method: 'POST',
    headers: contentType === undefined ? {} : { 'content-type': contentType },
    socket: { remoteAddress: '203.0.113.7' },
  });
}

function fakeLimiter(allow: boolean): RateLimiter {
  return { allow: vi.fn().mockReturnValue(allow) };
}

/** Runs the route handler with `body` sent as the request's one chunk. */
async function postRoute(
  api: RoutingConsoleRouteApi | undefined,
  body: unknown,
  opts: { limiter?: RateLimiter; contentType?: string } = {},
): Promise<ReturnType<typeof fakeResponse>> {
  const req = fakePost(opts.contentType);
  const res = fakeResponse();
  const pending = handleRoutingConsoleRoute(
    req as never,
    res as never,
    api,
    {},
    opts.limiter ?? fakeLimiter(true),
  );
  req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
  req.emit('end');
  await pending;
  return res;
}

describe('handleRoutingConsoleRoute — the console steers', () => {
  const routed = { issue: 7, label: 'priority: high', routed: true };

  it('hands the issue, label and project to the route and answers what it did', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>().mockResolvedValue(routed);

    const res = await postRoute(api, { issue: 7, label: 'priority: high', project: 'p1' });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(routed);
    expect(api.mock.calls).toEqual([[7, 'priority: high', 'p1']]);
  });

  it('routes for the home page when no project is named', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>().mockResolvedValue(routed);

    await postRoute(api, { issue: 7, label: 'priority: high', project: '' });

    expect(api.mock.calls).toEqual([[7, 'priority: high', undefined]]);
  });

  it('answers a refusal as a 200 carrying its reason, never a 403', async () => {
    const refused = { issue: 7, label: 'priority: high', routed: false, refusedReason: 'guest' };
    const api = vi.fn<RoutingConsoleRouteApi>().mockResolvedValue(refused as never);

    const res = await postRoute(api, { issue: 7, label: 'priority: high' });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(refused);
  });

  it('returns 404 when the route is unwired', async () => {
    const res = await postRoute(undefined, { issue: 7, label: 'priority: high' });

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'routing console route unavailable' });
  });

  it('returns 405 for a GET and never routes', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>();
    const res = fakeResponse();

    await handleRoutingConsoleRoute(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
      fakeLimiter(true),
    );

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('refuses a cross-site form post (415) before the limiter or the route', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>();
    const limiter = fakeLimiter(true);

    const res = await postRoute(api, 'issue=7', {
      limiter,
      contentType: 'application/x-www-form-urlencoded',
    });

    expect(res.writeHead).toHaveBeenCalledWith(415, expect.any(Object));
    expect(limiter.allow).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 429 when rate-limited', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>();

    const res = await postRoute(
      api,
      { issue: 7, label: 'priority: high' },
      { limiter: fakeLimiter(false) },
    );

    expect(res.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON, a missing or non-positive issue, or no label', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>();
    const bodies: unknown[] = [
      '{not json',
      'null',
      { label: 'priority: high' },
      { issue: '7', label: 'priority: high' },
      { issue: 0, label: 'priority: high' },
      { issue: 1.5, label: 'priority: high' },
      { issue: 7 },
      { issue: 7, label: '' },
    ];

    for (const body of bodies) {
      const res = await postRoute(api, body);
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    }
    expect(api).not.toHaveBeenCalled();
  });

  it('returns 500 with the error message when the route throws', async () => {
    const api = vi.fn<RoutingConsoleRouteApi>().mockRejectedValue(new Error('store gone'));

    const res = await postRoute(api, { issue: 7, label: 'priority: high' });

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'store gone' });
  });
});
