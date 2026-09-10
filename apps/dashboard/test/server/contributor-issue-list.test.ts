// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  handleContributorIssueList,
  type ContributorIssueListPreviewApi,
} from '../../src/server/contributor-issue-list.js';

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

describe('handleContributorIssueList', () => {
  it('returns 404 when the contributor issue list API is unavailable', async () => {
    const res = fakeResponse();

    await handleContributorIssueList(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      undefined,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'contributor issue list unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: ContributorIssueListPreviewApi = vi.fn();
    const res = fakeResponse();

    await handleContributorIssueList(
      fakeRequest({ method: 'POST' }) as never,
      res as never,
      api,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'method not allowed' });
    expect(api).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const entries = [
      {
        number: 42,
        title: 'Fix the thing',
        url: 'https://github.com/octocat/hello-world/issues/42',
        tier: 'good first issue' as const,
      },
    ];
    const api: ContributorIssueListPreviewApi = vi.fn().mockResolvedValue(entries);
    const res = fakeResponse();

    await handleContributorIssueList(
      fakeRequest({ method: undefined }) as never,
      res as never,
      api,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries });
  });

  it('previews the contributor issue list on GET', async () => {
    const entries = [
      {
        number: 7,
        title: 'Docs typo',
        url: 'https://github.com/octocat/hello-world/issues/7',
        tier: 'help wanted' as const,
      },
    ];
    const api: ContributorIssueListPreviewApi = vi.fn().mockResolvedValue(entries);
    const res = fakeResponse();

    await handleContributorIssueList(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries });
  });

  it('degrades to { entries: [] } instead of crashing when the read throws', async () => {
    const api: ContributorIssueListPreviewApi = vi
      .fn()
      .mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handleContributorIssueList(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      api,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries: [] });
  });
});
