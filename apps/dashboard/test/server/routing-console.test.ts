// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { handleRoutingConsole, type RoutingConsoleApi } from '../../src/server/routing-console.js';
import {
  UNREADABLE_ROUTING_CONSOLE,
  type RoutingConsoleSnapshot,
} from '../../src/flight/routing-console.js';
import { MirrorPassRepoMismatchError } from '../../src/flight/mirror-pass-execute.js';

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

  it('names both repositories, and no queues, when the project is a checkout of another repo', async () => {
    const api: RoutingConsoleApi = vi
      .fn()
      .mockRejectedValue(new MirrorPassRepoMismatchError('someone/theirs', 'octocat/hello-world'));
    const res = fakeResponse();

    await handleRoutingConsole(
      fakeRequest({ method: 'GET', url: '/api/routing-console?project=p1' }) as never,
      res as never,
      api,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({
      skippedReason: 'repo-mismatch',
      projectRepo: 'someone/theirs',
      ghRepo: 'octocat/hello-world',
    });
  });
});
