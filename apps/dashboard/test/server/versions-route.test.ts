// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE VERSIONS SCREEN (board ap-mui2h3s1-1, slice 2): `GET /api/versions`
 * serves one project's MYTH / LEGACY / flight-log timeline.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { handleVersions } from '../../src/server/versions-route.js';
import { createServer } from '../../src/server/server.js';
import type { VersionsTimeline } from '../../src/read/versions.js';

function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function bodyOf(res: ReturnType<typeof fakeResponse>): unknown {
  return JSON.parse(res.end.mock.calls[0]![0] as string);
}

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const TIMELINE: VersionsTimeline = {
  myth: { kind: 'myth', sha: SHA_A, committedAt: '2026-09-01T10:00:00+03:00', subject: 'init' },
  legacy: { kind: 'legacy', sha: SHA_A, committedAt: '2026-09-01T10:00:00+03:00', subject: 'init' },
  flight: [
    { kind: 'flight', sha: SHA_B, committedAt: '2026-09-02T10:00:00+03:00', subject: 'fix: x' },
  ],
  truncated: false,
};

describe('handleVersions', () => {
  it('is 404 when the dashboard has no versions source', async () => {
    const res = fakeResponse();
    await handleVersions(
      { method: 'GET', url: '/api/versions?project=p1' } as never,
      res as never,
      undefined,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('is read-only: a non-GET never reaches the reader', async () => {
    const api = vi.fn(() => TIMELINE);
    const res = fakeResponse();
    await handleVersions(
      { method: 'POST', url: '/api/versions?project=p1' } as never,
      res as never,
      api,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('asks for a project id before reading anything', async () => {
    const api = vi.fn(() => TIMELINE);
    const res = fakeResponse();
    await handleVersions({ method: 'GET', url: '/api/versions' } as never, res as never, api, {});
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('answers GET with the timeline of the project it names', async () => {
    const api = vi.fn(() => TIMELINE);
    const res = fakeResponse();
    await handleVersions(
      { method: 'GET', url: '/api/versions?project=my%20repo' } as never,
      res as never,
      api,
      {},
    );
    expect(api).toHaveBeenCalledWith('my repo');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(bodyOf(res)).toEqual({ versions: TIMELINE });
  });

  it('answers an unknown project with a null timeline, not an empty one', async () => {
    const res = fakeResponse();
    await handleVersions(
      { method: 'GET', url: '/api/versions?project=nope' } as never,
      res as never,
      async () => null,
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(bodyOf(res)).toEqual({ versions: null });
  });

  it('answers a failed read with 503, never a timeline that looks like an unlocked repo', async () => {
    const res = fakeResponse();
    await handleVersions(
      { method: 'GET', url: '/api/versions?project=p1' } as never,
      res as never,
      () => {
        throw new Error('boom');
      },
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
    expect(bodyOf(res)).toEqual({ error: 'versions read failed' });
  });
});

describe('the /api/versions route', () => {
  let server: Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  async function start(versions?: (projectId: string) => VersionsTimeline | null): Promise<string> {
    server = createServer(versions ? { versions } : {});
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('reaches the injected reader through the real server', async () => {
    const base = await start((pid) => (pid === 'p1' ? TIMELINE : null));
    const res = await fetch(`${base}/api/versions?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versions: TIMELINE });
    expect(await (await fetch(`${base}/api/versions?project=nope`)).json()).toEqual({
      versions: null,
    });
  });

  it('is 404 when no reader is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/versions?project=p1`)).status).toBe(404);
  });
});
