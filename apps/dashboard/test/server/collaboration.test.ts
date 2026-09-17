// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { handleCollaboration, type CollaborationApi } from '../../src/server/collaboration.js';

/** Minimal `IncomingMessage` stand-in: the handler only touches `.method`. */
function fakeRequest(opts: { method?: string | undefined }): { method: string | undefined } {
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

describe('handleCollaboration', () => {
  it('returns 404 when the collaboration API is unavailable', async () => {
    const res = fakeResponse();

    await handleCollaboration(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'collaboration data unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: CollaborationApi = vi.fn();
    const res = fakeResponse();

    await handleCollaboration(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const snapshot = { roadmap: [], helpWanted: [] };
    const api: CollaborationApi = vi.fn().mockResolvedValue(snapshot);
    const res = fakeResponse();

    await handleCollaboration(fakeRequest({ method: undefined }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(snapshot);
  });

  it('returns the combined snapshot on GET', async () => {
    const snapshot = {
      roadmap: [
        {
          number: 16,
          title: 'Full dashboard i18n',
          url: 'https://github.com/example/repo/issues/16',
          labels: ['roadmap'],
          assignees: ['octocat'],
        },
      ],
      helpWanted: [
        {
          number: 42,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/42',
          labels: ['help wanted'],
          assignees: [],
        },
      ],
    };
    const api: CollaborationApi = vi.fn().mockResolvedValue(snapshot);
    const res = fakeResponse();

    await handleCollaboration(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(snapshot);
  });

  it('degrades to an empty snapshot instead of crashing when the read throws', async () => {
    const api: CollaborationApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handleCollaboration(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ roadmap: [], helpWanted: [] });
  });
});
