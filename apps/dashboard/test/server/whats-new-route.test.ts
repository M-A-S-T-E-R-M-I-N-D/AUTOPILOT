// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT'S NEW (operator, 2026-09-24): the endpoint behind the once-per-version
 * message, and the chunk and stylesheet the dashboard serves for it.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleWhatsNew } from '../../src/server/whats-new-route.js';
import { handleRoute } from '../../src/server/routes.js';
import type { WhatsNewApi, WhatsNewPayload } from '../../src/read/whats-new.js';

function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

function readBody(res: { end: ReturnType<typeof vi.fn> }): unknown {
  const [body] = res.end.mock.calls[0] ?? [];
  return JSON.parse(body as string);
}

const PAYLOAD: WhatsNewPayload = {
  version: '0.54.0',
  release: null,
  round: null,
  github: { repo: 'o/r', openIssues: 1, openPrs: 0 },
  ci: null,
};

describe('handleWhatsNew', () => {
  it('is 404 when the dashboard has no what-is-new source', async () => {
    const res = fakeResponse();
    await handleWhatsNew({ method: 'GET' } as never, res as never, undefined, {});
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('is read-only', async () => {
    const api: WhatsNewApi = vi.fn();
    const res = fakeResponse();
    await handleWhatsNew({ method: 'POST' } as never, res as never, api, {});
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('answers GET with the payload', async () => {
    const res = fakeResponse();
    await handleWhatsNew({ method: 'GET' } as never, res as never, async () => PAYLOAD, {});
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual(PAYLOAD);
  });

  it('answers a failed read with every part empty, never a 500', async () => {
    const res = fakeResponse();
    await handleWhatsNew(
      { method: 'GET' } as never,
      res as never,
      async () => {
        throw new Error('boom');
      },
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(readBody(res)).toEqual({
      version: null,
      release: null,
      round: null,
      github: null,
      ci: null,
    });
  });
});

describe("the what's-new chunk and its styles", () => {
  // The CSP is default-src 'self', so the dialog's styles must ride the
  // served stylesheet: an injected <style> is blocked in a real browser.
  it('rides /tokens.css', () => {
    const css = String(handleRoute('/tokens.css').body);
    expect(css).toContain('.wn-overlay {');
    expect(css).toContain('.wn-dialog {');
  });

  it('is served as its own script', () => {
    const res = handleRoute('/whats-new.js');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('javascript');
    expect(String(res.body)).toContain('ap-motd-seen');
  });

  it('is loaded, deferred, after the panels chunk on every page', () => {
    const html = String(handleRoute('/').body);
    expect(html).toMatch(/<script src="\/whats-new\.js\?v=[a-z0-9]+" defer><\/script>/);
    expect(html.indexOf('/whats-new.js')).toBeGreaterThan(html.indexOf('/panels.js'));
  });
});
