// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { handleDonations } from '../../src/server/donations.js';
import type { DonationsPreviewApi } from '../../src/flight/donations.js';

/** Minimal `IncomingMessage` stand-in — mirrors `pool-client.test.ts`'s. */
function fakeRequest(opts: { method?: string | undefined }): {
  method: string | undefined;
  headers: Record<string, string | undefined>;
  socket: { remoteAddress: string | undefined };
  on: EventEmitter['on'];
  emit: EventEmitter['emit'];
} {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    method: opts.method,
    headers: {},
    socket: { remoteAddress: '203.0.113.7' },
  });
}

/** Minimal `ServerResponse` stand-in — the handler only calls `.writeHead()`/`.end()` via `sendJson`. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

describe('handleDonations', () => {
  it('returns 404 when the donations API is unavailable', async () => {
    const res = fakeResponse();

    await handleDonations(fakeRequest({ method: 'GET' }) as never, res as never, undefined, {});

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(readBody(res)).toEqual({ error: 'donations unavailable' });
  });

  it('returns 405 for a non-GET method (read-only endpoint)', async () => {
    const api: DonationsPreviewApi = vi.fn();
    const res = fakeResponse();

    await handleDonations(fakeRequest({ method: 'POST' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('treats an undefined method as GET', async () => {
    const entries = [{ chain: 'btc' as const, address: 'bc1qexampleaddress' }];
    const api: DonationsPreviewApi = vi.fn().mockResolvedValue(entries);
    const res = fakeResponse();

    await handleDonations(fakeRequest({ method: undefined }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries });
  });

  it('previews the donation entries on GET', async () => {
    const entries = [
      { chain: 'btc' as const, address: 'bc1qexampleaddress' },
      { chain: 'evm' as const, address: '0xExampleAddress', label: 'Operations' },
    ];
    const api: DonationsPreviewApi = vi.fn().mockResolvedValue(entries);
    const res = fakeResponse();

    await handleDonations(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries });
  });

  it('degrades to { entries: [] } instead of crashing when the read throws', async () => {
    const api: DonationsPreviewApi = vi.fn().mockRejectedValue(new Error('file unreadable'));
    const res = fakeResponse();

    await handleDonations(fakeRequest({ method: 'GET' }) as never, res as never, api, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({ entries: [] });
  });
});
