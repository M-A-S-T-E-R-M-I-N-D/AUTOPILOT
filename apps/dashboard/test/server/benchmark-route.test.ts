// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE BENCHMARK (operator, 2026-09-26): the endpoint behind `/benchmark`,
 * and the page, chunk and stylesheet the dashboard serves for it.
 */
import { describe, it, expect, vi } from 'vitest';
import { benchmarkScopeOf, handleBenchmark } from '../../src/server/benchmark-route.js';
import { handleRoute } from '../../src/server/routes.js';
import type { BenchmarkPayload } from '../../src/read/benchmark.js';

function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

const PAYLOAD: BenchmarkPayload = {
  generatedAt: 1,
  scope: null,
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

  it('passes a plain ?project= through as the scope, and drops anything else', async () => {
    const api = vi.fn(() => PAYLOAD);
    await handleBenchmark(
      { method: 'GET', url: '/api/benchmark?project=fly-autopilot' } as never,
      fakeResponse() as never,
      api,
      {},
    );
    expect(api).toHaveBeenCalledWith('fly-autopilot');
    expect(benchmarkScopeOf('/api/benchmark')).toBeUndefined();
    expect(benchmarkScopeOf('/api/benchmark?project=../../etc')).toBeUndefined();
    expect(benchmarkScopeOf("/api/benchmark?project=a'b")).toBeUndefined();
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
  it('forwards /benchmark to the one benchmark inside the dashboard (2026-09-27)', () => {
    const page = handleRoute('/benchmark');
    expect(page.status).toBe(200);
    expect(page.contentType).toMatch(/text\/html/);
    const html = String(page.body);
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/#benchmark-panel" />');
    expect(html).toContain('<a href="/#benchmark-panel">');
    expect(html).not.toMatch(/<script|<style|style="/);
  });

  it('serves the chunk as script, and its styles in the shared stylesheet', () => {
    const js = handleRoute('/benchmark.js');
    expect(js.status).toBe(200);
    expect(js.contentType).toMatch(/javascript/);
    expect(String(js.body)).toContain('/api/benchmark');
    expect(String(handleRoute('/tokens.css').body)).toContain('.bm-page');
  });
});
