// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { handleCiStatus } from '../../src/server/ci-status-route.js';
import type { CiStatusApi } from '../../src/control/ci-status.js';

/** Minimal `IncomingMessage` stand-in: the handler only touches `.method`. */
function fakeRequest(opts: { method?: string | undefined }): {
  method: string | undefined;
} {
  return { method: opts.method };
}

/** Minimal `ServerResponse` stand-in: the handler only calls `.writeHead()`/`.end()` via `sendJson`. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

describe('handleCiStatus', () => {
  it('returns 404 when the ci-status API is unavailable', async () => {
    const res = fakeResponse();

    await handleCiStatus(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'ci-status unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: CiStatusApi = vi.fn();
    const res = fakeResponse();

    await handleCiStatus(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('reports the workflow list on GET', async () => {
    const workflows = [
      {
        workflow: 'ci.yml',
        conclusion: 'success',
        ageLabel: '5m ago',
        createdAtMs: 123,
        ok: true,
        detail: 'success (5m ago)',
      },
    ];
    const api: CiStatusApi = vi.fn().mockResolvedValue(workflows);
    const res = fakeResponse();

    await handleCiStatus(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ workflows });
  });

  it('degrades to { workflows: [] } instead of crashing when the read throws', async () => {
    const api: CiStatusApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handleCiStatus(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ workflows: [] });
  });
});
