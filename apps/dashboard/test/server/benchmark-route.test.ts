// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK (operator, 2026-09-26): the endpoint behind `/benchmark`,
 * and the page, chunk and stylesheet the dashboard serves for it.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleBenchmark } from '../../src/server/benchmark-route.js';
import { handleRoute } from '../../src/server/routes.js';
import type { BenchmarkPayload } from '../../src/read/benchmark.js';

function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

const PAYLOAD: BenchmarkPayload = {
  generatedAt: 1,
  windowDays: 90,
  models: [],
  points: [],
  tiers: [],
  rule: { minFirings: 15, shipRateTolerance: 0.05, watchOneIn: 5 },
};

describe('handleBenchmark', () => {
  it('is 404 when the dashboard has no benchmark source', async () => {
    const res = fakeResponse();
    await handleBenchmark({ method: 'GET' } as never, res as never, undefined, {});
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('is read-only', async () => {
    const api = vi.fn(() => PAYLOAD);
    const res = fakeResponse();
    await handleBenchmark({ method: 'POST' } as never, res as never, api, {});
    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
    expect(api).not.toHaveBeenCalled();
  });

  it('answers GET with the payload', async () => {
    const res = fakeResponse();
    await handleBenchmark({ method: 'GET' } as never, res as never, () => PAYLOAD, {});
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(JSON.parse(res.end.mock.calls[0]![0] as string)).toEqual(PAYLOAD);
  });

  it('answers a failed read with 503, never empty charts that look like no model ever flew', async () => {
    const res = fakeResponse();
    await handleBenchmark(
      { method: 'GET' } as never,
      res as never,
      () => {
        throw new Error('boom');
      },
      {},
    );
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
  });
});

describe('the benchmark page routes', () => {
  it('serves the page with its own chunk and no inline style', () => {
    const page = handleRoute('/benchmark');
    expect(page.status).toBe(200);
    expect(page.contentType).toMatch(/text\/html/);
    const html = String(page.body);
    expect(html).toMatch(/<script src="\/benchmark\.js\?v=[a-z0-9]+" defer><\/script>/);
    expect(html).toContain('<main id="benchmark"');
    expect(html).not.toContain('/app.js');
    expect(html).not.toMatch(/<style|style="/);
  });

  it('serves the chunk as script, and its styles in the shared stylesheet', () => {
    const js = handleRoute('/benchmark.js');
    expect(js.status).toBe(200);
    expect(js.contentType).toMatch(/javascript/);
    expect(String(js.body)).toContain('/api/benchmark');
    expect(String(handleRoute('/tokens.css').body)).toContain('.bm-page');
  });
});
