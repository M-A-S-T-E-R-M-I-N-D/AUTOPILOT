// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { handleSocialIdentity, type SocialIdentityApi } from '../../src/server/social-identity.js';

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

describe('handleSocialIdentity', () => {
  it('returns 404 when the social identity API is unavailable', async () => {
    const res = fakeResponse();

    await handleSocialIdentity(
      fakeRequest({ method: 'GET' }) as never,
      res as never,
      undefined,
      {},
    );

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'social identity unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: SocialIdentityApi = vi.fn();
    const res = fakeResponse();

    await handleSocialIdentity(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('resolves the identity on GET', async () => {
    const identity = {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer' as const,
    };
    const api: SocialIdentityApi = vi.fn().mockResolvedValue(identity);
    const res = fakeResponse();

    await handleSocialIdentity(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ identity });
  });

  it('reports { identity: null } rather than a raw undefined when unresolved', async () => {
    const api: SocialIdentityApi = vi.fn().mockResolvedValue(undefined);
    const res = fakeResponse();

    await handleSocialIdentity(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(readBody(res)).toEqual({ identity: null });
  });

  it('degrades to { identity: null } instead of crashing when the read throws', async () => {
    const api: SocialIdentityApi = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    const res = fakeResponse();

    await handleSocialIdentity(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ identity: null });
  });
});
