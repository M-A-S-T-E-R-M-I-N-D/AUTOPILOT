// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer, type ServerDeps } from '../../src/server/server.js';
import { request as httpRequest, type Server } from 'node:http';

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function start(deps: ServerDeps = {}): Promise<string> {
  server = createServer(deps);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

/** `fetch` silently normalizes an explicit `Host` header to the connection's real
 *  authority, so it cannot exercise the DNS-rebind guard — use `node:http`
 *  directly, which sends whatever `Host` header it is given. */
function requestWithHost(base: string, host: string): Promise<{ status: number; body: string }> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: url.hostname, port: url.port, path: '/', method: 'GET', headers: { Host: host } },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('createServer (live loopback)', () => {
  it('serves the shell with security headers over a real socket', async () => {
    const base = await start();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await res.text()).toContain('AUTOPILOT');
  });

  it('serves the health probe and 404s unknown paths', async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ ok: true });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it('rejects a request whose Host header is not loopback (DNS-rebind guard)', async () => {
    const base = await start();
    const res = await requestWithHost(base, 'evil.example.com');
    expect(res.status).toBe(403);
    expect(res.body).toBe('forbidden host');
  });

  it('allows a request whose Host header is loopback by name', async () => {
    const base = await start();
    const res = await requestWithHost(base, 'localhost');
    expect(res.status).toBe(200);
  });

  it('serves the injected live fleet state over the socket', async () => {
    const base = await start({
      readState: () => ({
        generatedAt: 123,
        totals: {
          projects: 0,
          flying: 0,
          needsYou: 0,
          firings: 0,
          shipped: 0,
          openFindings: 0,
          cost: 0,
          realCost: null,
          costPerShipped: null,
          shipRate: null,
          currentStreak: 0,
          avgTurns: null,
          cacheReadShare: null,
        },
        projects: [],
        recentFirings: [],
        empty: true,
      }),
    });
    const state = await (await fetch(`${base}/api/state`)).json();
    expect(state).toMatchObject({ generatedAt: 123, empty: true });
  });

  it('streams the fleet state as SSE at /api/stream', async () => {
    const base = await start({
      readState: () => ({
        generatedAt: 5,
        totals: {
          projects: 0,
          flying: 0,
          needsYou: 0,
          firings: 0,
          shipped: 0,
          openFindings: 0,
          cost: 0,
          realCost: null,
          costPerShipped: null,
          shipRate: null,
          currentStreak: 0,
          avgTurns: null,
          cacheReadShare: null,
        },
        projects: [],
        recentFirings: [],
        empty: true,
      }),
    });
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ac.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('data:');
    expect(text).toContain('"generatedAt":5');
    await reader.cancel();
    ac.abort();
  });

  it('does NOT re-push when only the timestamp changes (SSE dedupe — no flash)', async () => {
    let n = 0;
    const base = await start({
      // generatedAt moves every read, but the fleet itself never changes.
      readState: () => ({
        generatedAt: (n += 1),
        totals: {
          projects: 0,
          flying: 0,
          needsYou: 0,
          firings: 0,
          shipped: 0,
          openFindings: 0,
          cost: 0,
          realCost: null,
          costPerShipped: null,
          shipRate: null,
          currentStreak: 0,
          avgTurns: null,
          cacheReadShare: null,
        },
        projects: [],
        recentFirings: [],
        empty: true,
      }),
    });
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ac.signal });
    const reader = res.body!.getReader();
    await reader.read(); // the initial payload

    // Over the next stream interval the data is unchanged, so nothing new is sent.
    const outcome = await Promise.race([
      reader.read().then(() => 'GOT_CHUNK'),
      new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 1800)),
    ]);
    expect(outcome).toBe('TIMEOUT');
    await reader.cancel();
    ac.abort();
  });

  const FAKE_STATUS = {
    mode: 'subscription' as const,
    hasCredential: false,
    cliPresent: true,
    cliVersion: '1.2.3',
    loggedIn: true,
    ready: true,
    description: 'Claude subscription (Claude Code login)',
  };
  const noopLogin = () => Promise.resolve({ launched: true, message: 'terminal opened' });
  const noopTest = () => Promise.resolve({ authenticated: true, detail: 'ok' });

  it('GET /api/connection returns the injected status', async () => {
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: () => Promise.reject(new Error('no')),
        login: noopLogin,
        test: noopTest,
      },
    });
    const status = await (await fetch(`${base}/api/connection`)).json();
    expect(status).toMatchObject({ mode: 'subscription', cliPresent: true, ready: true });
  });

  it('POST /api/connection/test runs the definitive probe', async () => {
    let tested = false;
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: () => Promise.reject(new Error('no')),
        login: noopLogin,
        test: () => {
          tested = true;
          return Promise.resolve({ authenticated: true, detail: 'fable' });
        },
      },
    });
    const res = await fetch(`${base}/api/connection/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(tested).toBe(true);
    expect(await res.json()).toMatchObject({ authenticated: true });
  });

  it('POST /api/connection/login launches the login', async () => {
    let launched = false;
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: () => Promise.reject(new Error('no')),
        login: () => {
          launched = true;
          return Promise.resolve({ launched: true, message: 'terminal opened' });
        },
        test: noopTest,
      },
    });
    const res = await fetch(`${base}/api/connection/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(launched).toBe(true);
    expect(await res.json()).toMatchObject({ launched: true });
  });

  it('POST /api/connection applies a choice when sent as application/json', async () => {
    let received: unknown = null;
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: (input) => {
          received = input;
          return Promise.resolve({ ...FAKE_STATUS, mode: 'api-key', hasCredential: true });
        },
        login: noopLogin,
        test: noopTest,
      },
    });
    const res = await fetch(`${base}/api/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'api-key', apiKey: 'sk-ant-test' }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual({ mode: 'api-key', apiKey: 'sk-ant-test' });
    expect(await res.json()).toMatchObject({ mode: 'api-key', hasCredential: true });
  });

  it('POST /api/connection rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: () => Promise.reject(new Error('should not be called')),
        login: noopLogin,
        test: noopTest,
      },
    });
    const res = await fetch(`${base}/api/connection`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'mode=api-key',
    });
    expect(res.status).toBe(415);
  });

  it('404s /api/connection when no connection API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/connection`)).status).toBe(404);
  });

  it('GET /api/connection/gh returns the injected gh status', async () => {
    const base = await start({
      gh: {
        getStatus: () =>
          Promise.resolve({
            present: true,
            version: '2.86.0',
            authenticated: true,
            login: 'octocat',
          }),
      },
    });
    const status = await (await fetch(`${base}/api/connection/gh`)).json();
    expect(status).toEqual({
      present: true,
      version: '2.86.0',
      authenticated: true,
      login: 'octocat',
    });
  });

  it('404s /api/connection/gh when no gh API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/connection/gh`)).status).toBe(404);
  });

  it('405s a non-GET /api/connection/gh request', async () => {
    const base = await start({
      gh: {
        getStatus: () =>
          Promise.resolve({ present: false, version: null, authenticated: false, login: null }),
      },
    });
    const res = await fetch(`${base}/api/connection/gh`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('POST /api/connection rejects a body over the 64KB cap (413, DoS guard)', async () => {
    let called = false;
    const base = await start({
      connection: {
        getStatus: () => Promise.resolve(FAKE_STATUS),
        connect: () => {
          called = true;
          return Promise.resolve(FAKE_STATUS);
        },
        login: noopLogin,
        test: noopTest,
      },
    });
    const oversized = JSON.stringify({ mode: 'api-key', apiKey: 'x'.repeat(64 * 1024 + 1) });
    const res = await fetch(`${base}/api/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversized,
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'request body too large' });
    expect(called).toBe(false);
  });

  const IDLE_FLIGHT = {
    running: false,
    folder: null,
    firings: null,
    totalBudgetUsd: null,
    startedAt: null,
    pid: null,
    paused: false,
    queued: false,
    initiatedBy: null,
    instanceId: null,
  };
  const STOP_IDLE = { stopping: false, message: 'no flight is running', status: IDLE_FLIGHT };
  const noopStop = () => STOP_IDLE;
  const PAUSE_IDLE = { pausing: false, message: 'no flight is running', status: IDLE_FLIGHT };
  const noopPause = () => PAUSE_IDLE;

  it('GET /api/fly returns the flight status', async () => {
    const base = await start({
      flight: {
        status: () => ({ ...IDLE_FLIGHT, running: true, folder: '/work/a', firings: 2 }),
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const status = await (await fetch(`${base}/api/fly`)).json();
    expect(status).toMatchObject({ running: true, folder: '/work/a', firings: 2 });
  });

  it('GET /api/fly includes the default folder for the UI to prefill', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
        defaultFolder: () => '/work/autopilot',
      },
    });
    const body = await (await fetch(`${base}/api/fly`)).json();
    expect(body).toMatchObject({ running: false, defaultFolder: '/work/autopilot' });
  });

  it('GET /api/fly surfaces the per-firing caps — an invisible cap reads as a mystery death', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const body = await (await fetch(`${base}/api/fly`)).json();
    expect(body).toMatchObject({ maxTurnsPerFiring: 120, minBudgetUsd: 0.5 });
  });

  it('POST /api/fly launches a flight and echoes the started status', async () => {
    let received: unknown = null;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: (input) => {
          received = input;
          return {
            started: true,
            message: 'flying /work/a — 2 firing(s)',
            status: { ...IDLE_FLIGHT, running: true, folder: '/work/a', firings: 2, pid: 7 },
          };
        },
        stop: noopStop,
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a', firings: 2 }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual({ folder: '/work/a', firings: 2 });
    expect(await res.json()).toMatchObject({ started: true, status: { running: true } });
  });

  it('POST /api/fly returns 409 when the runner refuses (already flying)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'already flying', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/b' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ started: false });
  });

  it('POST /api/fly returns 202 when the runner queues the start (concurrency cap full, PARALLEL FLIGHTS 5/6)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({
          started: false,
          queued: true,
          message: 'queued /work/b — 1 flight(s) already running',
          status: { ...IDLE_FLIGHT, folder: '/work/b', queued: true },
        }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/b' }),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ started: false, queued: true });
  });

  it('POST /api/fly rejects a non-JSON content-type (CSRF guard)', async () => {
    let called = false;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => {
          called = true;
          return { started: true, message: 'x', status: IDLE_FLIGHT };
        },
        stop: noopStop,
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'folder=/work/a',
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('POST /api/fly/stop stops the running flight', async () => {
    let stopped = false;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: () => {
          stopped = true;
          return { stopping: true, message: 'stopping /work/a…', status: IDLE_FLIGHT };
        },
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(stopped).toBe(true);
    expect(await res.json()).toMatchObject({ stopping: true });
  });

  it('POST /api/fly/stop rejects a non-JSON content-type (CSRF guard)', async () => {
    let called = false;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: () => {
          called = true;
          return STOP_IDLE;
        },
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('404s /api/fly when no flight API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/fly`)).status).toBe(404);
  });

  it('POST /api/fly 429s once a single client exceeds the rate limit (a start/stop hammer loop)', async () => {
    let starts = 0;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => {
          starts++;
          return { started: false, message: 'already flying', status: IDLE_FLIGHT };
        },
        stop: noopStop,
        pause: noopPause,
      },
    });
    const startOnce = (): Promise<Response> =>
      fetch(`${base}/api/fly`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: '/work/a' }),
      });
    for (let i = 0; i < 10; i++) {
      expect((await startOnce()).status).toBe(409);
    }
    const limited = await startOnce();
    expect(limited.status).toBe(429);
    expect(starts).toBe(10);
  });

  it('POST /api/fly/stop shares its rate-limit budget with POST /api/fly (one cap per client)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'already flying', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const startOnce = (): Promise<Response> =>
      fetch(`${base}/api/fly`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: '/work/a' }),
      });
    for (let i = 0; i < 10; i++) {
      expect((await startOnce()).status).toBe(409);
    }
    const stopRes = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(stopRes.status).toBe(429);
  });

  it('GET /api/fly is not rate-limited (the fly bar polls status every 3s)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'already flying', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    for (let i = 0; i < 15; i++) {
      expect((await fetch(`${base}/api/fly`)).status).toBe(200);
    }
  });

  it('GET /api/fly omits `flights` when the FlightApi has no statusAll (single-flight shape)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
    });
    const body = await (await fetch(`${base}/api/fly`)).json();
    expect(body).not.toHaveProperty('flights');
  });

  it('GET /api/fly includes `flights` — every live folder in a multi-flight registry', async () => {
    const flightA = { ...IDLE_FLIGHT, running: true, folder: '/work/a' };
    const flightB = { ...IDLE_FLIGHT, running: true, folder: '/work/b' };
    const base = await start({
      flight: {
        status: () => flightA,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
        statusAll: () => [flightA, flightB],
      },
    });
    const body = await (await fetch(`${base}/api/fly`)).json();
    expect(body.flights).toEqual([flightA, flightB]);
  });

  it('POST /api/fly/stop passes the folder from the request body through to the API', async () => {
    let received: string | undefined;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: (folder) => {
          received = folder;
          return { stopping: true, message: 'stopping /work/a…', status: IDLE_FLIGHT };
        },
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a' }),
    });
    expect(res.status).toBe(200);
    expect(received).toBe('/work/a');
  });

  it('POST /api/fly/pause passes the folder from the request body through to the API', async () => {
    let received: string | undefined;
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: (folder) => {
          received = folder;
          return { pausing: true, message: 'pausing /work/b…', status: IDLE_FLIGHT };
        },
      },
    });
    const res = await fetch(`${base}/api/fly/pause`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/b' }),
    });
    expect(res.status).toBe(200);
    expect(received).toBe('/work/b');
  });

  it("POST /api/fly/stop with no body (today's fly bar) still resolves undefined, not a crash", async () => {
    let received: string | undefined = 'unset';
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: (folder) => {
          received = folder;
          return STOP_IDLE;
        },
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(received).toBeUndefined();
  });

  it('POST /api/fly/stop with a malformed JSON body degrades to no folder, not a 400', async () => {
    let received: string | undefined = 'unset';
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'no', status: IDLE_FLIGHT }),
        stop: (folder) => {
          received = folder;
          return STOP_IDLE;
        },
        pause: noopPause,
      },
    });
    const res = await fetch(`${base}/api/fly/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(200);
    expect(received).toBeUndefined();
  });

  // FLEET LAUNCH FROM THE FLY BAR (board web-mtdcfel4-0bxf4h): `POST
  // /api/fleet` — the Lanes field's server side, launching the same
  // hub-aware partitioned multi-lane plan `dashboard fleet` already gives
  // the CLI, reachable from the dashboard itself.
  it('POST /api/fleet launches one lane per plan entry via the injected API', async () => {
    let received: unknown = null;
    const base = await start({
      fleetLaunch: async (args) => {
        received = args;
        return { ok: true, lines: ['fleet: 2 lane(s) over 0 open task(s)'] };
      },
    });
    const res = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a', laneCount: 2, firings: 3, budgetUsd: 5 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lines: ['fleet: 2 lane(s) over 0 open task(s)'] });
    expect(received).toMatchObject({ laneCount: 2, firings: 3, budgetUsd: 5 });
    expect(
      (received as { folder: string }).folder.endsWith('work/a') ||
        (received as { folder: string }).folder.endsWith('work\\a'),
    ).toBe(true);
  });

  it('POST /api/fleet defaults lanes to 3 and firings to 1 when omitted, same as the CLI', async () => {
    let received: unknown = null;
    const base = await start({
      fleetLaunch: async (args) => {
        received = args;
        return { ok: true, lines: [] };
      },
    });
    await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a' }),
    });
    expect(received).toMatchObject({ laneCount: 3, firings: 1 });
  });

  it('POST /api/fleet 400s an invalid lane count instead of calling the API', async () => {
    let called = false;
    const base = await start({
      fleetLaunch: async () => {
        called = true;
        return { ok: true, lines: [] };
      },
    });
    const res = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a', laneCount: 0 }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/fleet rejects a non-JSON content-type (CSRF guard)', async () => {
    let called = false;
    const base = await start({
      fleetLaunch: async () => {
        called = true;
        return { ok: true, lines: [] };
      },
    });
    const res = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'folder=/work/a',
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('POST /api/fleet reports a launcher failure as 502', async () => {
    const base = await start({
      fleetLaunch: async () => ({ ok: false, lines: ['base: could not reach the dashboard'] }),
    });
    const res = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a' }),
    });
    expect(res.status).toBe(502);
  });

  it('404s /api/fleet when no fleet launch API is wired', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/fleet shares its rate-limit budget with POST /api/fly (one cap per client)', async () => {
    const base = await start({
      flight: {
        status: () => IDLE_FLIGHT,
        start: () => ({ started: false, message: 'already flying', status: IDLE_FLIGHT }),
        stop: noopStop,
        pause: noopPause,
      },
      fleetLaunch: async () => ({ ok: true, lines: [] }),
    });
    const startOnce = (): Promise<Response> =>
      fetch(`${base}/api/fly`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: '/work/a' }),
      });
    for (let i = 0; i < 10; i++) {
      expect((await startOnce()).status).toBe(409);
    }
    const fleetRes = await fetch(`${base}/api/fleet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: '/work/a' }),
    });
    expect(fleetRes.status).toBe(429);
  });

  it('POST /api/project/delete removes a project (CSRF-guarded)', async () => {
    let deletedId = '';
    const base = await start({
      deleteProject: (id) => {
        deletedId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(deletedId).toBe('p1');
    expect(await res.json()).toMatchObject({ removed: true, id: 'p1' });
  });

  it('GET /api/docs lists indexed documents; /api/file serves ONLY indexed content', async () => {
    const base = await start({
      docsList: (pid) => (pid === 'p1' ? ['README.md', 'docs/PLAN.md'] : []),
      docRead: (pid, path) =>
        pid === 'p1' && path === 'README.md' ? '# Hello\n\nIndexed content.' : null,
    });
    const list = await (await fetch(`${base}/api/docs?project=p1`)).json();
    expect(list).toEqual({ files: ['README.md', 'docs/PLAN.md'] });

    const file = await fetch(`${base}/api/file?project=p1&path=README.md`);
    expect(file.status).toBe(200);
    expect(await file.json()).toMatchObject({
      path: 'README.md',
      content: expect.stringContaining('Indexed'),
    });

    // Root-jail by construction: an un-indexed path simply does not exist.
    const evil = await fetch(`${base}/api/file?project=p1&path=..%2F..%2Fetc%2Fpasswd`);
    expect(evil.status).toBe(404);

    const noProject = await fetch(`${base}/api/docs`);
    expect(noProject.status).toBe(400);
  });

  it('GET /api/landing previews the LANDING card data for a known project', async () => {
    const base = await start({
      landing: async (pid) =>
        pid === 'p1'
          ? {
              branch: 'autopilot/flight',
              base: 'main',
              commits: [{ shortSha: 'abc1234', subject: 'feat: thing', files: ['a.ts'] }],
              diffstat: { filesChanged: 1, insertions: 3, deletions: 0 },
              overlaps: [],
              worktreeAhead: [],
            }
          : null,
    });
    const res = await fetch(`${base}/api/landing?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      landing: { branch: 'autopilot/flight', base: 'main', diffstat: { filesChanged: 1 } },
    });

    const unknown = await fetch(`${base}/api/landing?project=nope`);
    expect(await unknown.json()).toEqual({ landing: null });

    const noProject = await fetch(`${base}/api/landing`);
    expect(noProject.status).toBe(400);
  });

  it('degrades /api/landing to { landing: null } instead of crashing when the read throws', async () => {
    const base = await start({
      landing: () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/landing?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ landing: null });
  });

  it('404s /api/landing when no landing API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/landing?project=p1`)).status).toBe(404);
  });

  it('GET /api/backlog previews the DETECTED BACKLOG candidates for a known project', async () => {
    const base = await start({
      backlog: async (pid) =>
        pid === 'p1'
          ? [
              {
                taskId: 't1',
                taskTitle: 'add widget parser',
                commitSha: 'abc1234',
                commitSubject: 'feat: add widget parser',
                score: 0.9,
                matchedVia: 'subject',
              },
            ]
          : [],
    });
    const res = await fetch(`${base}/api/backlog?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      candidates: [
        {
          taskId: 't1',
          taskTitle: 'add widget parser',
          commitSha: 'abc1234',
          commitSubject: 'feat: add widget parser',
          score: 0.9,
          matchedVia: 'subject',
        },
      ],
    });

    const unknown = await fetch(`${base}/api/backlog?project=nope`);
    expect(await unknown.json()).toEqual({ candidates: [] });

    const noProject = await fetch(`${base}/api/backlog`);
    expect(noProject.status).toBe(400);
  });

  it('degrades /api/backlog to { candidates: [] } instead of crashing when the read throws', async () => {
    const base = await start({
      backlog: () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/backlog?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [] });
  });

  it('404s /api/backlog when no backlog API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/backlog?project=p1`)).status).toBe(404);
  });

  it('GET /api/coordination surfaces held claims + sibling intent lines for a known project', async () => {
    const base = await start({
      coordination: async (pid) =>
        pid === 'p1'
          ? [
              '- CLAIMED by fleet-7: [t1] add widget parser',
              '- sibling autopilot/flight-worktree-fleet-2: last commit "wip"; intent: shell.ts — decomp',
            ]
          : [],
    });
    const res = await fetch(`${base}/api/coordination?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lines: [
        '- CLAIMED by fleet-7: [t1] add widget parser',
        '- sibling autopilot/flight-worktree-fleet-2: last commit "wip"; intent: shell.ts — decomp',
      ],
    });

    const unknown = await fetch(`${base}/api/coordination?project=nope`);
    expect(await unknown.json()).toEqual({ lines: [] });

    const noProject = await fetch(`${base}/api/coordination`);
    expect(noProject.status).toBe(400);
  });

  it('degrades /api/coordination to { lines: [] } instead of crashing when the read throws', async () => {
    const base = await start({
      coordination: () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/coordination?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: [] });
  });

  it('404s /api/coordination when no coordination API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/coordination?project=p1`)).status).toBe(404);
  });

  it('405s a non-GET /api/coordination request', async () => {
    const base = await start({ coordination: async () => [] });
    const res = await fetch(`${base}/api/coordination?project=p1`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('GET /api/release previews the next release plan for a known project', async () => {
    const base = await start({
      release: async (pid) =>
        pid === 'p1'
          ? {
              tagName: 'v1.0.0',
              currentVersion: '1.0.0',
              plan: { ok: true, bump: 'minor', version: '1.1.0', changelog: '# Changelog' },
            }
          : null,
    });
    const res = await fetch(`${base}/api/release?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      release: {
        tagName: 'v1.0.0',
        currentVersion: '1.0.0',
        plan: { bump: 'minor', version: '1.1.0' },
      },
    });

    const unknown = await fetch(`${base}/api/release?project=nope`);
    expect(await unknown.json()).toEqual({ release: null });

    const noProject = await fetch(`${base}/api/release`);
    expect(noProject.status).toBe(400);
  });

  it('degrades /api/release to { release: null } instead of crashing when the read throws', async () => {
    const base = await start({
      release: () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/release?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ release: null });
  });

  it('404s /api/release when no release API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/release?project=p1`)).status).toBe(404);
  });

  it('POST /api/landing/execute lands (200) on a green gate (CSRF-guarded)', async () => {
    const base = await start({
      landingExecute: async (pid) =>
        pid === 'p1'
          ? { ok: true, reason: 'landed', details: 'landed x onto main', restarting: false }
          : null,
    });
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reason: 'landed' });
  });

  it('POST /api/landing/execute reports a refusal as 409, not a crash', async () => {
    const base = await start({
      landingExecute: async () => ({
        ok: false,
        reason: 'gate-red',
        details: 'typecheck failed',
        restarting: false,
      }),
    });
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'gate-red' });
  });

  it('POST /api/landing/execute 404s for an unknown project', async () => {
    const base = await start({ landingExecute: async () => null });
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/landing/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      landingExecute: async () => ({
        ok: true,
        reason: 'landed' as const,
        details: '',
        restarting: false,
      }),
    });
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(415);
  });

  it('POST /api/landing/execute 400s without a project id', async () => {
    const base = await start({ landingExecute: async () => null });
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404s /api/landing/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/landing/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/release/execute releases (200) on a release-worthy commit set (CSRF-guarded)', async () => {
    const base = await start({
      releaseExecute: async (pid) =>
        pid === 'p1'
          ? {
              ok: true,
              reason: 'released',
              details: 'released v1.1.0 (minor)',
              version: '1.1.0',
              bump: 'minor',
            }
          : null,
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reason: 'released', version: '1.1.0' });
  });

  it('POST /api/release/execute reports a refusal as 409, not a crash', async () => {
    const base = await start({
      releaseExecute: async () => ({
        ok: false,
        reason: 'no-op',
        details: 'no release-worthy commits since the last release',
      }),
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'no-op' });
  });

  it('POST /api/release/execute forwards a well-formed milestoneTag to the API', async () => {
    const seen: Array<[string, string | undefined]> = [];
    const base = await start({
      releaseExecute: async (pid, milestoneTag) => {
        seen.push([pid, milestoneTag]);
        return {
          ok: true,
          reason: 'released',
          details: 'released v1.1.0 (minor)',
          version: '1.1.0',
          bump: 'minor',
          milestoneTag: { ok: true, details: "created annotated tag 'm4' at HEAD" },
        };
      },
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', milestoneTag: 'm4' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, milestoneTag: { ok: true } });
    expect(seen).toEqual([['p1', 'm4']]);
  });

  it('POST /api/release/execute forwards ghRelease:true to the API', async () => {
    const seen: Array<[string, string | undefined, boolean | undefined]> = [];
    const base = await start({
      releaseExecute: async (pid, milestoneTag, ghRelease) => {
        seen.push([pid, milestoneTag, ghRelease]);
        return {
          ok: true,
          reason: 'released',
          details: 'released v1.1.0 (minor)',
          version: '1.1.0',
          bump: 'minor',
          ghRelease: { ok: true, details: 'published' },
        };
      },
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', ghRelease: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ghRelease: { ok: true } });
    expect(seen).toEqual([['p1', undefined, true]]);
  });

  it('POST /api/release/execute omits ghRelease from the API call when not a boolean', async () => {
    const seen: Array<boolean | undefined> = [];
    const base = await start({
      releaseExecute: async (_pid, _milestoneTag, ghRelease) => {
        seen.push(ghRelease);
        return { ok: true, reason: 'released' as const, details: 'released v1.1.0 (minor)' };
      },
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', ghRelease: 'yes' }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([undefined]);
  });

  it('POST /api/release/execute 400s a malformed milestoneTag without ever calling the API', async () => {
    let called = false;
    const base = await start({
      releaseExecute: async () => {
        called = true;
        return null;
      },
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', milestoneTag: 'milestone-4' }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/release/execute 404s for an unknown project', async () => {
    const base = await start({ releaseExecute: async () => null });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/release/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      releaseExecute: async () => ({ ok: true, reason: 'released' as const, details: '' }),
    });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(415);
  });

  it('POST /api/release/execute 400s without a project id', async () => {
    const base = await start({ releaseExecute: async () => null });
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404s /api/release/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/release/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/github-sync/execute syncs (200) on a successful command (CSRF-guarded)', async () => {
    const base = await start({
      githubSyncExecute: async (pid) =>
        pid === 'p1'
          ? {
              ok: true,
              action: 'create',
              details: 'no remote configured — creating a new private GitHub repo "p1" and pushing',
            }
          : null,
    });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: 'create' });
  });

  it('POST /api/github-sync/execute defaults visibility to "private" when omitted', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubSyncExecute: async (pid, visibility) => {
        seen.push(visibility);
        return pid === 'p1' ? { ok: true, action: 'create' as const, details: '' } : null;
      },
    });
    await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(seen).toEqual(['private']);
  });

  it('POST /api/github-sync/execute threads an explicit "public" visibility through', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubSyncExecute: async (pid, visibility) => {
        seen.push(visibility);
        return pid === 'p1' ? { ok: true, action: 'create' as const, details: '' } : null;
      },
    });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', visibility: 'public' }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual(['public']);
  });

  it('POST /api/github-sync/execute 400s on an invalid visibility value', async () => {
    const base = await start({
      githubSyncExecute: async () => {
        throw new Error('must not be called for an invalid visibility');
      },
    });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', visibility: 'internal' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/github-sync/execute reports a failed command as 409, not a crash', async () => {
    const base = await start({
      githubSyncExecute: async () => ({
        ok: false,
        action: 'push',
        details: 'gh: not authenticated',
      }),
    });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, action: 'push' });
  });

  it('POST /api/github-sync/execute 404s for an unknown project', async () => {
    const base = await start({ githubSyncExecute: async () => null });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/github-sync/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      githubSyncExecute: async () => ({ ok: true, action: 'create' as const, details: '' }),
    });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(415);
  });

  it('POST /api/github-sync/execute 400s without a project id', async () => {
    const base = await start({ githubSyncExecute: async () => null });
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404s /api/github-sync/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/github-sync/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/github-issue/execute opens an issue (200) on a successful command (CSRF-guarded)', async () => {
    const base = await start({
      githubIssueExecute: async (title) => ({
        ok: true,
        details: `opening an issue against mastermind/autopilot: "${title}"`,
        url: 'https://github.com/mastermind/autopilot/issues/1',
      }),
    });
    const res = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a bug', body: 'repro steps' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('POST /api/github-issue/execute threads title (trimmed) and body through', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubIssueExecute: async (title, body) => {
        seen.push({ title, body });
        return { ok: true, details: '' };
      },
    });
    await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  a bug  ', body: 'repro steps' }),
    });
    expect(seen).toEqual([{ title: 'a bug', body: 'repro steps' }]);
  });

  it('POST /api/github-issue/execute defaults body to "" when omitted', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubIssueExecute: async (title, body) => {
        seen.push(body);
        return { ok: true, details: '' };
      },
    });
    await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a bug' }),
    });
    expect(seen).toEqual(['']);
  });

  it('POST /api/github-issue/execute 400s on an empty or missing title', async () => {
    const base = await start({
      githubIssueExecute: async () => {
        throw new Error('must not be called for an empty title');
      },
    });
    const empty = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(empty.status).toBe(400);
    const missing = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
  });

  it('POST /api/github-issue/execute reports a failed command as 409, not a crash', async () => {
    const base = await start({
      githubIssueExecute: async () => ({ ok: false, details: 'gh: not authenticated' }),
    });
    const res = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a bug' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('POST /api/github-issue/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      githubIssueExecute: async () => ({ ok: true, details: '' }),
    });
    const res = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ title: 'a bug' }),
    });
    expect(res.status).toBe(415);
  });

  it('404s /api/github-issue/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/github-issue/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a bug' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/github-pr/execute contributes upstream (200) on a successful command (CSRF-guarded)', async () => {
    const base = await start({
      githubPrExecute: async (pid) =>
        pid === 'p1'
          ? {
              ok: true,
              details: 'forking mastermind/autopilot, pushing "my-fix", and opening a PR',
              url: 'https://github.com/mastermind/autopilot/pull/7',
            }
          : null,
    });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'a landed fix', body: 'fixes the thing' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('POST /api/github-pr/execute threads project, title (trimmed), and body through', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubPrExecute: async (pid, title, body) => {
        seen.push({ pid, title, body });
        return { ok: true, details: '' };
      },
    });
    await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: '  a landed fix  ', body: 'fixes the thing' }),
    });
    expect(seen).toEqual([{ pid: 'p1', title: 'a landed fix', body: 'fixes the thing' }]);
  });

  it('POST /api/github-pr/execute threads issueNumber through (epic 0007 "PLATFORM 6/7" delivery leg)', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubPrExecute: async (pid, title, body, issueNumber) => {
        seen.push({ pid, title, body, issueNumber });
        return { ok: true, details: '' };
      },
    });
    await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: 'p1',
        title: 'a landed fix',
        body: 'fixes it',
        issueNumber: 42,
      }),
    });
    expect(seen).toEqual([{ pid: 'p1', title: 'a landed fix', body: 'fixes it', issueNumber: 42 }]);
  });

  it('POST /api/github-pr/execute 400s on a non-positive-integer issueNumber', async () => {
    const base = await start({
      githubPrExecute: async () => {
        throw new Error('must not be called');
      },
    });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'a fix', issueNumber: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/github-pr/execute defaults body to "" when omitted', async () => {
    const seen: unknown[] = [];
    const base = await start({
      githubPrExecute: async (_pid, _title, body) => {
        seen.push(body);
        return { ok: true, details: '' };
      },
    });
    await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'a landed fix' }),
    });
    expect(seen).toEqual(['']);
  });

  it('POST /api/github-pr/execute 400s on an empty or missing title', async () => {
    const base = await start({
      githubPrExecute: async () => {
        throw new Error('must not be called for an empty title');
      },
    });
    const empty = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: '   ' }),
    });
    expect(empty.status).toBe(400);
    const missing = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(missing.status).toBe(400);
  });

  it('POST /api/github-pr/execute 400s without a project id', async () => {
    const base = await start({
      githubPrExecute: async () => {
        throw new Error('must not be called without a project id');
      },
    });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a landed fix' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/github-pr/execute reports a failed command as 409, not a crash', async () => {
    const base = await start({
      githubPrExecute: async () => ({ ok: false, details: 'gh: not authenticated' }),
    });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'a landed fix' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('POST /api/github-pr/execute 404s for an unknown project', async () => {
    const base = await start({ githubPrExecute: async () => null });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'nope', title: 'a landed fix' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/github-pr/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      githubPrExecute: async () => ({ ok: true, details: '' }),
    });
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: 'p1', title: 'a landed fix' }),
    });
    expect(res.status).toBe(415);
  });

  it('404s /api/github-pr/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/github-pr/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'a landed fix' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /api/pr-review previews the planned decision for every open PR', async () => {
    const plan = {
      pr: {
        number: 12,
        title: 'Fix flaky sparkline test',
        gateStatus: 'pass' as const,
        mergeable: true,
        touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
      },
      decision: { decision: 'merge' as const, reasoning: 'policy-green' },
      commands: [],
    };
    const base = await start({ prReview: async () => ({ plans: [plan] }) });
    const res = await fetch(`${base}/api/pr-review`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plans: [plan] });
  });

  it('GET /api/pr-review passes a failed-read report through as fetchFailed', async () => {
    const base = await start({
      prReview: async () => ({ plans: [], fetchFailed: true as const }),
    });
    const res = await fetch(`${base}/api/pr-review`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plans: [], fetchFailed: true });
  });

  it('degrades /api/pr-review to a fetchFailed report instead of crashing when the read throws', async () => {
    const base = await start({
      prReview: () => {
        throw new Error('gh unavailable');
      },
    });
    const res = await fetch(`${base}/api/pr-review`);
    expect(res.status).toBe(200);
    // A thrown read is a FAILED read, not a confirmed-empty queue — the
    // response says so instead of masquerading as nothing-to-review.
    expect(await res.json()).toEqual({ plans: [], fetchFailed: true });
  });

  it('404s /api/pr-review when no API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/pr-review`)).status).toBe(404);
  });

  it('POST /api/pr-review/execute runs the re-derived decision (CSRF-guarded)', async () => {
    const seen: number[] = [];
    const base = await start({
      prReviewExecute: async (number) => {
        seen.push(number);
        return {
          decision: { decision: 'merge', reasoning: 'policy-green' },
          results: [
            { command: { command: 'gh', args: [], details: 'approve' }, code: 0, stdout: '' },
            { command: { command: 'gh', args: [], details: 'merge' }, code: 0, stdout: '' },
          ],
        };
      },
    });
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 12 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ decision: { decision: 'merge' } });
    expect(seen).toEqual([12]);
  });

  it('POST /api/pr-review/execute passes the confirmed expectedDecision through to the guard', async () => {
    const seen: unknown[] = [];
    const base = await start({
      prReviewExecute: async (number, expectedDecision) => {
        seen.push([number, expectedDecision]);
        return {
          decision: { decision: 'merge', reasoning: 'fresh verdict' },
          results: [],
          staleDecision: true,
        };
      },
    });
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 12, expectedDecision: 'queue-for-human' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { staleDecision?: boolean }).toMatchObject({
      staleDecision: true,
    });
    expect(seen).toEqual([[12, 'queue-for-human']]);
  });

  it('POST /api/pr-review/execute 400s a garbage expectedDecision instead of dropping the pin', async () => {
    const base = await start({ prReviewExecute: async () => null });
    for (const expectedDecision of ['approve', '', 42, null]) {
      const res = await fetch(`${base}/api/pr-review/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: 12, expectedDecision }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('POST /api/pr-review/execute passes the confirmed expectedHeadRefOid through to the re-triage guard', async () => {
    const seen: unknown[] = [];
    const base = await start({
      prReviewExecute: async (number, expectedDecision, expectedHeadRefOid) => {
        seen.push([number, expectedDecision, expectedHeadRefOid]);
        return {
          decision: { decision: 'merge', reasoning: 'fresh verdict' },
          results: [],
          staleDecision: true,
        };
      },
    });
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 12, expectedHeadRefOid: 'abc123' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { staleDecision?: boolean }).toMatchObject({
      staleDecision: true,
    });
    expect(seen).toEqual([[12, undefined, 'abc123']]);
  });

  it('POST /api/pr-review/execute 400s a garbage expectedHeadRefOid instead of dropping the pin', async () => {
    const base = await start({ prReviewExecute: async () => null });
    for (const expectedHeadRefOid of [42, '', null, {}]) {
      const res = await fetch(`${base}/api/pr-review/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: 12, expectedHeadRefOid }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('POST /api/pr-review/execute 404s for a PR no longer open', async () => {
    const base = await start({ prReviewExecute: async () => null });
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 12 }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/pr-review/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      prReviewExecute: async () => ({
        decision: { decision: 'merge' as const, reasoning: '' },
        results: [],
      }),
    });
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ number: 12 }),
    });
    expect(res.status).toBe(415);
  });

  it('POST /api/pr-review/execute 400s without a positive integer PR number', async () => {
    const base = await start({ prReviewExecute: async () => null });
    for (const body of [{}, { number: 'nope' }, { number: -1 }, { number: 1.5 }]) {
      const res = await fetch(`${base}/api/pr-review/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });

  it('404s /api/pr-review/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/pr-review/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ number: 12 }),
    });
    expect(res.status).toBe(404);
  });

  it('GET /api/issue-triage previews the planned decision for every open issue on a known project', async () => {
    const plan = {
      issue: { number: 9, title: 'Keyboard nav is broken', body: '' },
      decision: { decision: 'accept' as const, dimension: 'accessibility' as const, reasoning: '' },
      commands: [],
    };
    const base = await start({ issueTriage: async (pid) => (pid === 'p1' ? [plan] : null) });
    const res = await fetch(`${base}/api/issue-triage?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ triage: [plan] });

    const unknown = await fetch(`${base}/api/issue-triage?project=nope`);
    expect(await unknown.json()).toEqual({ triage: null });

    const noProject = await fetch(`${base}/api/issue-triage`);
    expect(noProject.status).toBe(400);
  });

  it('degrades /api/issue-triage to { triage: null } instead of crashing when the read throws', async () => {
    const base = await start({
      issueTriage: () => {
        throw new Error('gh unavailable');
      },
    });
    const res = await fetch(`${base}/api/issue-triage?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ triage: null });
  });

  it('404s /api/issue-triage when no API is injected', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/issue-triage?project=p1`)).status).toBe(404);
  });

  it('POST /api/issue-triage/execute runs the ritual for a known project (CSRF-guarded)', async () => {
    const seen: string[] = [];
    const base = await start({
      issueTriageExecute: async (projectId) => {
        seen.push(projectId);
        return { plans: [], commandResults: [], tasksCreated: 2 };
      },
    });
    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tasksCreated: 2 });
    expect(seen).toEqual(['p1']);
  });

  it('POST /api/issue-triage/execute 404s for an unknown project', async () => {
    const base = await start({ issueTriageExecute: async () => null });
    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/issue-triage/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      issueTriageExecute: async () => ({ plans: [], commandResults: [], tasksCreated: 0 }),
    });
    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(415);
  });

  it('POST /api/issue-triage/execute 400s without a project id', async () => {
    const base = await start({ issueTriageExecute: async () => null });
    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('404s /api/issue-triage/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/issue-triage/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1' }),
    });
    expect(res.status).toBe(404);
  });

  const reportCaptureBody = {
    regionId: 'flight-log',
    regionLabel: 'Flight log',
    description: 'The flight log timestamps read in UTC, not local time.',
    moduleSources: ['web/flight-log-panel.ts'],
    hasScreenshot: true,
    action: 'issue',
    projectId: '',
  };

  it('POST /api/report-from-here previews the judged plan for a valid capture (CSRF-guarded)', async () => {
    const base = await start({
      reportFromHere: (capture, action) => ({
        ok: true,
        action: action as 'issue',
        title: capture.regionLabel,
        body: capture.description,
        commands: [],
        summary: 'preview',
      }),
    });
    const res = await fetch(`${base}/api/report-from-here`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ plan: { ok: true, title: 'Flight log' } });
  });

  it('POST /api/report-from-here still 200s a rejected plan instead of a bare error', async () => {
    const base = await start({
      reportFromHere: () => ({ ok: false, reasoning: 'a report needs a description' }),
    });
    const res = await fetch(`${base}/api/report-from-here`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...reportCaptureBody, description: '' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ plan: { ok: false } });
  });

  it('POST /api/report-from-here 400s for an unrecognized action', async () => {
    const base = await start({ reportFromHere: () => ({ ok: false, reasoning: 'n/a' }) });
    const res = await fetch(`${base}/api/report-from-here`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...reportCaptureBody, action: 'not-a-real-action' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/report-from-here rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({ reportFromHere: () => ({ ok: false, reasoning: 'n/a' }) });
    const res = await fetch(`${base}/api/report-from-here`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(415);
  });

  it('404s /api/report-from-here when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/report-from-here`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/report-from-here/execute runs the ritual for a valid capture (CSRF-guarded)', async () => {
    const seen: string[] = [];
    const base = await start({
      reportFromHereExecute: async (capture, action) => {
        seen.push(action);
        return {
          plan: {
            ok: true,
            action: 'issue',
            title: capture.regionLabel,
            body: capture.description,
            commands: [],
            summary: 'ran',
          },
          commandResults: [],
          taskCreated: false,
        };
      },
    });
    const res = await fetch(`${base}/api/report-from-here/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ taskCreated: false });
    expect(seen).toEqual(['issue']);
  });

  it('POST /api/report-from-here/execute 400s for an unrecognized action', async () => {
    const base = await start({
      reportFromHereExecute: async () => ({
        plan: { ok: false, reasoning: 'n/a' },
        commandResults: [],
        taskCreated: false,
      }),
    });
    const res = await fetch(`${base}/api/report-from-here/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...reportCaptureBody, action: 'not-a-real-action' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/report-from-here/execute rejects a non-JSON content-type (CSRF guard)', async () => {
    const base = await start({
      reportFromHereExecute: async () => ({
        plan: { ok: false, reasoning: 'n/a' },
        commandResults: [],
        taskCreated: false,
      }),
    });
    const res = await fetch(`${base}/api/report-from-here/execute`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(415);
  });

  it('404s /api/report-from-here/execute when no API is injected', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/report-from-here/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportCaptureBody),
    });
    expect(res.status).toBe(404);
  });

  it('degrades docs/file gracefully instead of crashing when the index throws', async () => {
    const base = await start({
      docsList: () => {
        throw new Error('index corrupt');
      },
      docRead: () => {
        throw new Error('index corrupt');
      },
    });

    const list = await fetch(`${base}/api/docs?project=p1`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ files: [] });

    const file = await fetch(`${base}/api/file?project=p1&path=README.md`);
    expect(file.status).toBe(404);
    expect(await file.json()).toMatchObject({ error: 'read failed' });
  });

  it('POST /api/task/delete removes a task (reject/remove, CSRF-guarded)', async () => {
    let removedId = '';
    const tasksApi = {
      create: () => true,
      setStatus: () => true,
      remove: (id: string) => {
        removedId = id;
        return true;
      },
      setFocus: () => true,
      reorder: () => true,
      unpin: () => true,
    };
    const base = await start({ tasks: tasksApi });
    const res = await fetch(`${base}/api/task/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 't-1' }),
    });
    expect(res.status).toBe(200);
    expect(removedId).toBe('t-1');

    const noJson = await fetch(`${base}/api/task/delete`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=t-1',
    });
    expect(noJson.status).toBe(415);

    const noId = await fetch(`${base}/api/task/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(noId.status).toBe(400);
  });

  it('POST /api/project/reset clears telemetry ("Start over", CSRF-guarded)', async () => {
    let resetId = '';
    const base = await start({
      resetProject: (id) => {
        resetId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(resetId).toBe('p1');
    expect(await res.json()).toMatchObject({ reset: true, id: 'p1' });
  });

  it('POST /api/project/reset rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      resetProject: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/reset`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/delete rejects a non-JSON content-type (CSRF guard)', async () => {
    let called = false;
    const base = await start({
      deleteProject: () => {
        called = true;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/delete`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('POST /api/project/delete returns 404 for an unknown project', async () => {
    const base = await start({ deleteProject: () => false });
    const res = await fetch(`${base}/api/project/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'ghost' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ removed: false });
  });

  it('404s /api/project/delete when no delete API is wired', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/project/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/project/soul-reviewed ratifies a project SOUL (SOUL evolution loop, B5, CSRF-guarded)', async () => {
    let reviewedId = '';
    const base = await start({
      markSoulReviewed: (id) => {
        reviewedId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-reviewed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(reviewedId).toBe('p1');
    expect(await res.json()).toMatchObject({ reviewed: true, id: 'p1' });
  });

  it('POST /api/project/soul-reviewed rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      markSoulReviewed: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/soul-reviewed`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/soul-reviewed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/soul-reviewed returns 404 for an unknown project', async () => {
    const base = await start({ markSoulReviewed: () => false });
    const res = await fetch(`${base}/api/project/soul-reviewed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'ghost' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reviewed: false });
  });

  it('POST /api/project/soul-ratify applies a pending SOUL proposal (SOUL evolution loop, B5, CSRF-guarded)', async () => {
    let ratifiedId = '';
    const base = await start({
      ratifySoulAmendment: (id) => {
        ratifiedId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(ratifiedId).toBe('p1');
    expect(await res.json()).toMatchObject({ ratified: true, id: 'p1' });
  });

  it('POST /api/project/soul-ratify rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      ratifySoulAmendment: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/soul-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/soul-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/soul-ratify returns 404 when there is no pending proposal', async () => {
    const base = await start({ ratifySoulAmendment: () => false });
    const res = await fetch(`${base}/api/project/soul-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ratified: false });
  });

  it('POST /api/project/soul-dismiss discards a pending SOUL proposal (SOUL evolution loop, B5, CSRF-guarded)', async () => {
    let dismissedId = '';
    const base = await start({
      dismissSoulProposal: (id) => {
        dismissedId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(dismissedId).toBe('p1');
    expect(await res.json()).toMatchObject({ dismissed: true, id: 'p1' });
  });

  it('POST /api/project/soul-dismiss rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      dismissSoulProposal: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/soul-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/soul-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/soul-dismiss returns 404 when there is no pending proposal', async () => {
    const base = await start({ dismissSoulProposal: () => false });
    const res = await fetch(`${base}/api/project/soul-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ dismissed: false });
  });

  it('POST /api/fleet/wisdom-ratify applies the pending fleet wisdom proposal (board web-msnt26xe-pc4pzp, CSRF-guarded)', async () => {
    let called = false;
    const base = await start({
      ratifyFleetWisdom: () => {
        called = true;
        return true;
      },
    });
    const res = await fetch(`${base}/api/fleet/wisdom-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(called).toBe(true);
    expect(await res.json()).toMatchObject({ ratified: true });
  });

  it('POST /api/fleet/wisdom-ratify rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      ratifyFleetWisdom: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/fleet/wisdom-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/fleet/wisdom-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/fleet/wisdom-ratify returns 404 when there is no pending proposal', async () => {
    const base = await start({ ratifyFleetWisdom: () => false });
    const res = await fetch(`${base}/api/fleet/wisdom-ratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ratified: false });
  });

  it('POST /api/fleet/wisdom-dismiss discards the pending fleet wisdom proposal (board web-msnt26xe-pc4pzp, CSRF-guarded)', async () => {
    let called = false;
    const base = await start({
      dismissFleetWisdom: () => {
        called = true;
        return true;
      },
    });
    const res = await fetch(`${base}/api/fleet/wisdom-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(called).toBe(true);
    expect(await res.json()).toMatchObject({ dismissed: true });
  });

  it('POST /api/fleet/wisdom-dismiss rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      dismissFleetWisdom: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/fleet/wisdom-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/fleet/wisdom-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/fleet/wisdom-dismiss returns 404 when there is no pending proposal', async () => {
    const base = await start({ dismissFleetWisdom: () => false });
    const res = await fetch(`${base}/api/fleet/wisdom-dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ dismissed: false });
  });

  it('POST /api/project/soul-unratify undoes the last ratification (SOUL evolution loop, un-ratify affordance, CSRF-guarded)', async () => {
    let unratifiedId = '';
    const base = await start({
      unratifySoulAmendment: (id) => {
        unratifiedId = id;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-unratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
    expect(unratifiedId).toBe('p1');
    expect(await res.json()).toMatchObject({ unratified: true, id: 'p1' });
  });

  it('POST /api/project/soul-unratify rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      unratifySoulAmendment: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/soul-unratify`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/soul-unratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/soul-unratify returns 404 when there is nothing to undo', async () => {
    const base = await start({ unratifySoulAmendment: () => false });
    const res = await fetch(`${base}/api/project/soul-unratify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ unratified: false });
  });

  it('POST /api/project/soul-propose records a hand-written proposal (SOUL editor entry, CSRF-guarded)', async () => {
    let received: { id: string; text: string } | null = null;
    const base = await start({
      proposeSoulAmendment: (id, text) => {
        received = { id, text };
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1', text: '  hand-written SOUL text  ' }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual({ id: 'p1', text: 'hand-written SOUL text' });
    expect(await res.json()).toMatchObject({ proposed: true, id: 'p1' });
  });

  it('POST /api/project/soul-propose rejects a non-JSON content-type and 404s when unwired', async () => {
    let called = false;
    const guarded = await start({
      proposeSoulAmendment: () => {
        called = true;
        return true;
      },
    });
    const rejected = await fetch(`${guarded}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=p1',
    });
    expect(rejected.status).toBe(415);
    expect(called).toBe(false);

    const unwired = await start();
    const missing = await fetch(`${unwired}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1', text: 'text' }),
    });
    expect(missing.status).toBe(404);
  });

  it('POST /api/project/soul-propose 400s on a blank id or text and 404s for an unknown project', async () => {
    const base = await start({ proposeSoulAmendment: () => false });
    const blankText = await fetch(`${base}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1', text: '   ' }),
    });
    expect(blankText.status).toBe(400);

    const blankId = await fetch(`${base}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '', text: 'text' }),
    });
    expect(blankId.status).toBe(400);

    const unknown = await fetch(`${base}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'ghost', text: 'text' }),
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ proposed: false });
  });

  it('POST /api/project/soul-propose 400s on oversized SOUL text without storing it', async () => {
    let called = false;
    const base = await start({
      proposeSoulAmendment: () => {
        called = true;
        return true;
      },
    });
    const res = await fetch(`${base}/api/project/soul-propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'p1', text: 'x'.repeat(20001) }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask returns the grounded answer + cited sources', async () => {
    let received: { project: string; question: string } | null = null;
    const base = await start({
      ask: (project, question) => {
        received = { project, question };
        return Promise.resolve({
          ok: true,
          answer: 'The total is a reduce. [src/cart.ts]',
          sources: ['src/cart.ts'],
        });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'how is the total computed?' }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual({ project: 'p1', question: 'how is the total computed?' });
    expect(await res.json()).toMatchObject({ ok: true, sources: ['src/cart.ts'] });
  });

  it('POST /api/ask threads prior turns to the ask API for multi-turn context', async () => {
    let received: unknown;
    const base = await start({
      ask: (project, question, history) => {
        received = history;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = [{ question: 'how is the total computed?', answer: 'A reduce.' }];
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'and what calls it?', history }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual(history);
  });

  it('POST /api/ask threads the current view to the ask API', async () => {
    let received: unknown;
    const base = await start({
      ask: (_project, _question, _history, view) => {
        received = view;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', view: 'project page: p1' }),
    });
    expect(res.status).toBe(200);
    expect(received).toBe('project page: p1');
  });

  it('POST /api/ask 400s on an oversized view without calling the model', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', view: 'x'.repeat(201) }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on a non-string view without calling the model', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', view: 42 }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on a malformed history entry without calling the model', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', history: [{ question: 'q' }] }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on an oversized history array without calling the model', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = Array.from({ length: 21 }, () => ({ question: 'q', answer: 'a' }));
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', history }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask accepts a history array at exactly the turn cap', async () => {
    let received: unknown;
    const base = await start({
      ask: (_project, _question, history) => {
        received = history;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = Array.from({ length: 20 }, () => ({ question: 'q', answer: 'a' }));
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', history }),
    });
    expect(res.status).toBe(200);
    expect(received).toEqual(history);
  });

  it('POST /api/ask 400s on a history entry whose question exceeds the char cap', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = [{ question: 'q'.repeat(2001), answer: 'a' }];
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', history }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on a history entry whose answer exceeds the char cap', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = [{ question: 'q', answer: 'a'.repeat(4001) }];
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', history }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s when history is not an array', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: 'p1',
        question: 'q',
        history: { question: 'q', answer: 'a' },
      }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask rejects a non-JSON content-type (CSRF guard — it spends quota)', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'project=p1&question=q',
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on a missing question without calling the model', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: '   ' }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 400s on an oversized question without calling the model (quota cap)', async () => {
    let called = false;
    const base = await start({
      ask: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'x'.repeat(2001) }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask 429s once a single client exceeds the rate limit', async () => {
    let calls = 0;
    const base = await start({
      ask: () => {
        calls++;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const askOnce = (): Promise<Response> =>
      fetch(`${base}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'p1', question: 'q' }),
      });
    for (let i = 0; i < 20; i++) {
      expect((await askOnce()).status).toBe(200);
    }
    const limited = await askOnce();
    expect(limited.status).toBe(429);
    expect(calls).toBe(20);
  });

  it('POST /api/ask/stream shares its rate-limit budget with /api/ask (one cap per client)', async () => {
    const base = await start({
      ask: () => Promise.resolve({ ok: true, answer: 'x', sources: [] }),
      askStream: (_project, _question, onChunk) => {
        onChunk('x');
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const askOnce = (): Promise<Response> =>
      fetch(`${base}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'p1', question: 'q' }),
      });
    for (let i = 0; i < 20; i++) {
      expect((await askOnce()).status).toBe(200);
    }
    const streamRes = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q' }),
    });
    expect(streamRes.status).toBe(429);
  });

  it('POST /api/task/create adds a task; /api/task/status moves it (CSRF-guarded)', async () => {
    const created: unknown[] = [];
    const moved: unknown[] = [];
    const base = await start({
      tasks: {
        create: (input) => {
          created.push(input);
          return true;
        },
        setStatus: (id, status) => {
          moved.push([id, status]);
          return true;
        },
        remove: () => true,
        setFocus: () => true,
        reorder: () => true,
        unpin: () => true,
      },
    });
    const c = await fetch(`${base}/api/task/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'Ship it', severity: 'high' }),
    });
    expect(c.status).toBe(200);
    expect(created[0]).toMatchObject({ project: 'p1', title: 'Ship it', severity: 'high' });

    const s = await fetch(`${base}/api/task/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'web-1', status: 'done' }),
    });
    expect(s.status).toBe(200);
    expect(moved[0]).toEqual(['web-1', 'done']);

    // CSRF guard on both.
    const bad = await fetch(`${base}/api/task/create`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'title=x',
    });
    expect(bad.status).toBe(415);
  });

  it('POST /api/task/create 400s on a blank title; /status 400s when refused', async () => {
    const base = await start({
      tasks: {
        create: () => true,
        setStatus: () => false,
        remove: () => true,
        setFocus: () => true,
        reorder: () => true,
        unpin: () => true,
      },
    });
    const blank = await fetch(`${base}/api/task/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: '  ' }),
    });
    expect(blank.status).toBe(400);
    const refused = await fetch(`${base}/api/task/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'x', status: 'exploded' }),
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ ok: false });
  });

  it('POST /api/task/create 400s on an oversized title without storing it', async () => {
    let called = false;
    const base = await start({
      tasks: {
        create: () => {
          called = true;
          return true;
        },
        setStatus: () => true,
        remove: () => true,
        setFocus: () => true,
        reorder: () => true,
        unpin: () => true,
      },
    });
    const res = await fetch(`${base}/api/task/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', title: 'x'.repeat(301) }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/inbox/add drops a note (CSRF-guarded)', async () => {
    const dropped: unknown[] = [];
    const base = await start({
      inboxAdd: (project, message) => {
        dropped.push([project, message]);
        return Promise.resolve({ ok: true, file: '2024-01-01T00-00-00-000Z-dashboard.md' });
      },
    });
    const res = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', message: '  context for the next firing  ' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(dropped[0]).toEqual(['p1', 'context for the next firing']);

    const bad = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'message=x',
    });
    expect(bad.status).toBe(415);
  });

  it('POST /api/inbox/add 400s on a blank message and 404s on an unknown project', async () => {
    const base = await start({ inboxAdd: () => Promise.resolve(null) });
    const blank = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', message: '   ' }),
    });
    expect(blank.status).toBe(400);

    const unknown = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'ghost', message: 'hello' }),
    });
    expect(unknown.status).toBe(404);
  });

  it('POST /api/inbox/add 400s on an oversized message without storing it', async () => {
    let called = false;
    const base = await start({
      inboxAdd: () => {
        called = true;
        return Promise.resolve({ ok: true, file: 'x.md' });
      },
    });
    const res = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', message: 'x'.repeat(4001) }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('404s /api/inbox/add when no inbox API is wired', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/inbox/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', message: 'hello' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/task/reorder 400s on an oversized ids array without applying it', async () => {
    let called = false;
    const base = await start({
      tasks: {
        create: () => true,
        setStatus: () => true,
        remove: () => true,
        setFocus: () => true,
        reorder: () => {
          called = true;
          return true;
        },
        unpin: () => true,
      },
    });
    const ids = Array.from({ length: 501 }, (_, i) => `t${i}`);
    const res = await fetch(`${base}/api/task/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', ids }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/task/unpin releases operator pins through the same body shape as reorder', async () => {
    // pins were ONE-WAY since v16 (reorder pins, nothing unpins) — a stale
    // operator priority stuck forever and re-taxed every fleet round. This
    // route is the inverse affordance.
    let got: { project: string; ids: readonly string[] } | null = null;
    const base = await start({
      tasks: {
        create: () => true,
        setStatus: () => true,
        remove: () => true,
        setFocus: () => true,
        reorder: () => true,
        unpin: (project, ids) => {
          got = { project, ids };
          return true;
        },
      },
    });
    const res = await fetch(`${base}/api/task/unpin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', ids: ['t-pinned'] }),
    });
    expect(res.status).toBe(200);
    expect(got).toEqual({ project: 'p1', ids: ['t-pinned'] });
  });

  it('404s /api/ask when no ask API is wired', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/ask/stream relays deltas over SSE then a terminal done frame', async () => {
    let received: { project: string; question: string } | null = null;
    const base = await start({
      askStream: (project, question, onChunk) => {
        received = { project, question };
        onChunk('The total ');
        onChunk('is a reduce. [src/cart.ts]');
        return Promise.resolve({
          ok: true,
          answer: 'The total is a reduce. [src/cart.ts]',
          sources: ['src/cart.ts'],
        });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'how is the total computed?' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(received).toEqual({ project: 'p1', question: 'how is the total computed?' });
    expect(text).toContain('data: {"delta":"The total "}');
    expect(text).toContain('data: {"delta":"is a reduce. [src/cart.ts]"}');
    expect(text).toContain('"done":true');
    expect(text).toContain('"sources":["src/cart.ts"]');
  });

  it('POST /api/ask/stream threads prior turns to the askStream API', async () => {
    let received: unknown;
    const base = await start({
      askStream: (_project, _question, onChunk, history) => {
        received = history;
        onChunk('x');
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const history = [{ question: 'how is the total computed?', answer: 'A reduce.' }];
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'and what calls it?', history }),
    });
    expect(res.status).toBe(200);
    await res.text();
    expect(received).toEqual(history);
  });

  it('POST /api/ask/stream threads the current view to the askStream API', async () => {
    let received: unknown;
    const base = await start({
      askStream: (_project, _question, onChunk, _history, view) => {
        received = view;
        onChunk('x');
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', view: 'fleet page (all projects)' }),
    });
    expect(res.status).toBe(200);
    await res.text();
    expect(received).toBe('fleet page (all projects)');
  });

  it('POST /api/ask/stream defaults to the genius persona and echoes it on the terminal frame when omitted', async () => {
    const base = await start({
      askStream: (_project, _question, onChunk) => {
        onChunk('x');
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"persona":"genius"');
  });

  it('POST /api/ask/stream threads an explicit architect persona into the service call and echoes it on the terminal frame', async () => {
    let receivedPersona: unknown;
    const base = await start({
      askStream: (_project, _question, onChunk, _history, _view, _deep, _onActivity, persona) => {
        receivedPersona = persona;
        onChunk('x');
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', persona: 'architect' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(receivedPersona).toBe('architect');
    expect(text).toContain('"persona":"architect"');
  });

  it('POST /api/ask/stream relays a proposal the service returns on the terminal frame', async () => {
    const base = await start({
      askStream: (_project, _question, onChunk) => {
        onChunk('x');
        return Promise.resolve({
          ok: true,
          answer: 'x',
          sources: [],
          proposal: { tool: 'tasks_list', args: { projectId: 'p1' }, safety: 'read' },
        });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', persona: 'architect' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"proposal":{"tool":"tasks_list"');
  });

  it('POST /api/ask/stream 400s on an invalid persona without calling the model', async () => {
    let called = false;
    const base = await start({
      askStream: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q', persona: 'admin' }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('POST /api/ask/stream rejects a non-JSON content-type (CSRF guard — it spends quota)', async () => {
    let called = false;
    const base = await start({
      askStream: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'project=p1&question=q',
    });
    expect(res.status).toBe(415);
    expect(called).toBe(false);
  });

  it('POST /api/ask/stream 400s on a missing question without calling the model', async () => {
    let called = false;
    const base = await start({
      askStream: () => {
        called = true;
        return Promise.resolve({ ok: true, answer: 'x', sources: [] });
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: '   ' }),
    });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  it('404s /api/ask/stream when no askStream API is wired', async () => {
    const base = await start();
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/ask/stream degrades to an honest terminal frame when the model throws mid-stream', async () => {
    const base = await start({
      askStream: (_project, _question, onChunk) => {
        onChunk('partial answer ');
        return Promise.reject(new Error('model crashed'));
      },
    });
    const res = await fetch(`${base}/api/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'p1', question: 'q' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('data: {"delta":"partial answer "}');
    expect(text).toContain('"done":true');
    expect(text).toContain('"ok":false');
    expect(text).toContain('Ask failed');
  });

  it('GET /api/search returns ranked hits for a project + query', async () => {
    let received: { projectId: string; query: string; limit: number } | null = null;
    const base = await start({
      search: (projectId, query, limit) => {
        received = { projectId, query, limit };
        return [{ path: 'src/cart.ts', language: 'typescript', score: 1.2, snippet: 'add[Cart]' }];
      },
    });
    const res = await fetch(`${base}/api/search?project=p1&q=cart`);
    expect(res.status).toBe(200);
    expect(received).toMatchObject({ projectId: 'p1', query: 'cart' });
    expect(await res.json()).toEqual({
      hits: [{ path: 'src/cart.ts', language: 'typescript', score: 1.2, snippet: 'add[Cart]' }],
    });
  });

  it('GET /api/search returns no hits for a blank query without calling search', async () => {
    let called = false;
    const base = await start({
      search: () => {
        called = true;
        return [];
      },
    });
    const res = await fetch(`${base}/api/search?project=p1&q=%20%20`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: [] });
    expect(called).toBe(false);
  });

  it('URL-encoded query terms reach the search function intact', async () => {
    let received = '';
    const base = await start({
      search: (_p, query) => {
        received = query;
        return [];
      },
    });
    await fetch(`${base}/api/search?project=p1&q=${encodeURIComponent('add to cart')}`);
    expect(received).toBe('add to cart');
  });

  it('404s /api/search when no search API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/search?project=p1&q=cart`)).status).toBe(404);
  });

  it('degrades to no hits (not a crash) when the search store throws', async () => {
    const base = await start({
      search: () => {
        throw new Error('database is locked');
      },
    });
    const res = await fetch(`${base}/api/search?project=p1&q=cart`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hits: [] });
  });

  it('GET /api/flightlog?project=<id> returns that project’s injected log tail', async () => {
    const base = await start({
      flightLog: (projectId) => (projectId === 'p1' ? ['line one', 'line two'] : []),
    });
    const res = await fetch(`${base}/api/flightlog?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: ['line one', 'line two'] });
  });

  it('400s /api/flightlog when no project id is given', async () => {
    const base = await start({ flightLog: () => ['line'] });
    const res = await fetch(`${base}/api/flightlog`);
    expect(res.status).toBe(400);
  });

  it('POST /api/flightlog is not allowed (read-only endpoint)', async () => {
    const base = await start({ flightLog: () => ['line'] });
    const res = await fetch(`${base}/api/flightlog?project=p1`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('degrades to an empty tail (not a crash) when the flight log read throws', async () => {
    const base = await start({
      flightLog: () => {
        throw new Error('ENOENT');
      },
    });
    const res = await fetch(`${base}/api/flightlog?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lines: [] });
  });

  it('404s /api/flightlog when no flight log API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/flightlog?project=p1`)).status).toBe(404);
  });

  it('GET /api/firings?project=&offset= returns the next older page for a known project', async () => {
    const base = await start({
      firingsPage: (pid, offset) => (pid === 'p1' ? { entries: [], hasMore: offset === 0 } : null),
    });
    const res = await fetch(`${base}/api/firings?project=p1&offset=0`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [], hasMore: true });

    const unknown = await fetch(`${base}/api/firings?project=nope&offset=0`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not found' });
  });

  it('treats a missing or non-integer /api/firings offset as 0 rather than rejecting it', async () => {
    const base = await start({
      firingsPage: (_pid, offset) => ({ entries: [], hasMore: offset !== 0 }),
    });
    const noOffset = await fetch(`${base}/api/firings?project=p1`);
    expect(await noOffset.json()).toEqual({ entries: [], hasMore: false });

    const badOffset = await fetch(`${base}/api/firings?project=p1&offset=not-a-number`);
    expect(await badOffset.json()).toEqual({ entries: [], hasMore: false });

    const negativeOffset = await fetch(`${base}/api/firings?project=p1&offset=-5`);
    expect(await negativeOffset.json()).toEqual({ entries: [], hasMore: false });
  });

  it('400s /api/firings when no project id is given', async () => {
    const base = await start({ firingsPage: () => ({ entries: [], hasMore: false }) });
    const res = await fetch(`${base}/api/firings`);
    expect(res.status).toBe(400);
  });

  it('POST /api/firings is not allowed (read-only endpoint)', async () => {
    const base = await start({ firingsPage: () => ({ entries: [], hasMore: false }) });
    const res = await fetch(`${base}/api/firings?project=p1`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('500s /api/firings instead of crashing when the read throws', async () => {
    const base = await start({
      firingsPage: () => {
        throw new Error('db unavailable');
      },
    });
    const res = await fetch(`${base}/api/firings?project=p1`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'read failed' });
  });

  it('404s /api/firings when no firings-page API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/firings?project=p1`)).status).toBe(404);
  });

  it('GET /api/pipeline?project=<id> returns the rendered panel with defaulted query', async () => {
    const calls: Array<{ projectId: string; query: unknown }> = [];
    const base = await start({
      pipelinePanel: (projectId, query) => {
        calls.push({ projectId, query });
        return '<section class="pipeline-panel">ok</section>';
      },
    });
    const res = await fetch(`${base}/api/pipeline?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ html: '<section class="pipeline-panel">ok</section>' });
    expect(calls).toEqual([
      {
        projectId: 'p1',
        query: { lens: 'fleet', mode: 'grouped', layout: 'layered', selected: null },
      },
    ]);
  });

  it('passes explicit /api/pipeline lens, mode, layout, and selected through to the API', async () => {
    const calls: unknown[] = [];
    const base = await start({
      pipelinePanel: (_projectId, query) => {
        calls.push(query);
        return '<section></section>';
      },
    });
    const res = await fetch(
      `${base}/api/pipeline?project=p1&lens=file&mode=flat&layout=compact&selected=n1`,
    );
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ lens: 'file', mode: 'flat', layout: 'compact', selected: 'n1' }]);
  });

  it('400s /api/pipeline on an unknown lens, mode, or layout value', async () => {
    const base = await start({ pipelinePanel: () => '<section></section>' });
    expect((await fetch(`${base}/api/pipeline?project=p1&lens=nope`)).status).toBe(400);
    expect((await fetch(`${base}/api/pipeline?project=p1&mode=nope`)).status).toBe(400);
    expect((await fetch(`${base}/api/pipeline?project=p1&layout=nope`)).status).toBe(400);
  });

  it('400s /api/pipeline when no project id is given', async () => {
    const base = await start({ pipelinePanel: () => '<section></section>' });
    expect((await fetch(`${base}/api/pipeline`)).status).toBe(400);
  });

  it('404s /api/pipeline for an unknown project (API returns null)', async () => {
    const base = await start({ pipelinePanel: () => null });
    const res = await fetch(`${base}/api/pipeline?project=nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('POST /api/pipeline is not allowed (read-only endpoint)', async () => {
    const base = await start({ pipelinePanel: () => '<section></section>' });
    expect((await fetch(`${base}/api/pipeline?project=p1`, { method: 'POST' })).status).toBe(405);
  });

  it('500s /api/pipeline instead of crashing when the read throws', async () => {
    const base = await start({
      pipelinePanel: () => {
        throw new Error('db unavailable');
      },
    });
    const res = await fetch(`${base}/api/pipeline?project=p1`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'read failed' });
  });

  it('404s /api/pipeline when no pipeline-panel API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/pipeline?project=p1`)).status).toBe(404);
  });

  it("GET /api/firing-activity?project=&firing= returns that firing's full trace", async () => {
    const entries = [
      {
        tool: 'Read',
        target: 'a.ts',
        kind: 'other',
        phase: 'do' as const,
        at: 1,
        firingId: 'f1',
        reasoning: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
      },
    ];
    const base = await start({
      firingActivity: (pid, fid) => (pid === 'p1' && fid === 'f1' ? { entries } : null),
    });
    const res = await fetch(`${base}/api/firing-activity?project=p1&firing=f1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries });

    const unknown = await fetch(`${base}/api/firing-activity?project=nope&firing=f1`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not found' });
  });

  it('400s /api/firing-activity when project or firing id is missing', async () => {
    const base = await start({ firingActivity: () => ({ entries: [] }) });
    expect((await fetch(`${base}/api/firing-activity?project=p1`)).status).toBe(400);
    expect((await fetch(`${base}/api/firing-activity?firing=f1`)).status).toBe(400);
    expect((await fetch(`${base}/api/firing-activity`)).status).toBe(400);
  });

  it('POST /api/firing-activity is not allowed (read-only endpoint)', async () => {
    const base = await start({ firingActivity: () => ({ entries: [] }) });
    const res = await fetch(`${base}/api/firing-activity?project=p1&firing=f1`, {
      method: 'POST',
    });
    expect(res.status).toBe(405);
  });

  it('500s /api/firing-activity instead of crashing when the read throws', async () => {
    const base = await start({
      firingActivity: () => {
        throw new Error('db unavailable');
      },
    });
    const res = await fetch(`${base}/api/firing-activity?project=p1&firing=f1`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'read failed' });
  });

  it('404s /api/firing-activity when no firing-activity API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/firing-activity?project=p1&firing=f1`)).status).toBe(404);
  });

  it("GET /api/firing-diff?project=&firing= returns that firing's commit patch", async () => {
    const base = await start({
      firingDiff: async (pid, fid) =>
        pid === 'p1' && fid === 'f1' ? { patch: 'diff --git a/x b/x' } : null,
    });
    const res = await fetch(`${base}/api/firing-diff?project=p1&firing=f1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ patch: 'diff --git a/x b/x' });

    const unknown = await fetch(`${base}/api/firing-diff?project=nope&firing=f1`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not found' });
  });

  it('200s /api/firing-diff with a null patch for a firing with no shipped commit', async () => {
    const base = await start({ firingDiff: async () => ({ patch: null }) });
    const res = await fetch(`${base}/api/firing-diff?project=p1&firing=f1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ patch: null });
  });

  it('400s /api/firing-diff when project or firing id is missing', async () => {
    const base = await start({ firingDiff: async () => ({ patch: null }) });
    expect((await fetch(`${base}/api/firing-diff?project=p1`)).status).toBe(400);
    expect((await fetch(`${base}/api/firing-diff?firing=f1`)).status).toBe(400);
    expect((await fetch(`${base}/api/firing-diff`)).status).toBe(400);
  });

  it('POST /api/firing-diff is not allowed (read-only endpoint)', async () => {
    const base = await start({ firingDiff: async () => ({ patch: null }) });
    const res = await fetch(`${base}/api/firing-diff?project=p1&firing=f1`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('500s /api/firing-diff instead of crashing when the read throws', async () => {
    const base = await start({
      firingDiff: async () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/firing-diff?project=p1&firing=f1`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'read failed' });
  });

  it('404s /api/firing-diff when no firing-diff API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/firing-diff?project=p1&firing=f1`)).status).toBe(404);
  });

  it('GET /api/round previews the CURRENT ROUND totals for a known project', async () => {
    const roundInfo = {
      roundStartAt: 1000,
      tagName: 'v0.11.0',
      firings: 12,
      shipped: 9,
      cost: 3.5,
      shipRate: 0.75,
      costPerShipped: 0.38,
    };
    const base = await start({
      round: async (pid) => (pid === 'p1' ? roundInfo : null),
    });
    const res = await fetch(`${base}/api/round?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ round: roundInfo });

    const unknown = await fetch(`${base}/api/round?project=nope`);
    expect(await unknown.json()).toEqual({ round: null });

    const noProject = await fetch(`${base}/api/round`);
    expect(noProject.status).toBe(400);
  });

  it('POST /api/round is not allowed (read-only endpoint)', async () => {
    const base = await start({ round: async () => null });
    const res = await fetch(`${base}/api/round?project=p1`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('degrades /api/round to { round: null } instead of crashing when the read throws', async () => {
    const base = await start({
      round: () => {
        throw new Error('git unavailable');
      },
    });
    const res = await fetch(`${base}/api/round?project=p1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ round: null });
  });

  it('404s /api/round when no round API is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/round?project=p1`)).status).toBe(404);
  });

  it("GET /api/lucky rolls the injected calibrator and passes the folder through — the Fly bar's 🍀 button", async () => {
    const seen: Array<string | null> = [];
    const base = await start({
      lucky: (folder) => {
        seen.push(folder);
        return Promise.resolve({
          probe: {
            cpuLoadPct: 7,
            logicalCores: 12,
            freeRamGb: 15.2,
            queuedTasks: 13,
            runningFlights: 0,
          },
          plan: {
            ok: true,
            lanes: 5,
            firings: 3,
            budgetUsd: 10,
            reasoning: ['CPU: plenty idle'],
          },
        });
      },
    });
    const res = await fetch(
      `${base}/api/lucky?folder=${encodeURIComponent('C:\\Users\\operator\\repo')}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { lanes: number }; probe: { queuedTasks: number } };
    expect(body.plan.lanes).toBe(5);
    expect(body.probe.queuedTasks).toBe(13);
    expect(seen).toEqual(['C:\\Users\\operator\\repo']);
  });

  it('GET /api/lucky with no folder param hands the calibrator null (dashboard-default project)', async () => {
    const seen: Array<string | null> = [];
    const base = await start({
      lucky: (folder) => {
        seen.push(folder);
        return Promise.resolve({
          probe: {
            cpuLoadPct: 0,
            logicalCores: 1,
            freeRamGb: 5,
            queuedTasks: 1,
            runningFlights: 0,
          },
          plan: { ok: true, lanes: 1, firings: 2, budgetUsd: 10, reasoning: [] },
        });
      },
    });
    expect((await fetch(`${base}/api/lucky`)).status).toBe(200);
    expect(seen).toEqual([null]);
  });

  it('404s /api/lucky when no calibrator is wired', async () => {
    const base = await start();
    expect((await fetch(`${base}/api/lucky`)).status).toBe(404);
  });

  it('405s a POST to /api/lucky — rolling the dice is read-only', async () => {
    const base = await start({
      lucky: () =>
        Promise.resolve({
          probe: {
            cpuLoadPct: 0,
            logicalCores: 1,
            freeRamGb: 5,
            queuedTasks: 1,
            runningFlights: 0,
          },
          plan: { ok: true, lanes: 1, firings: 2, budgetUsd: 10, reasoning: [] },
        }),
    });
    expect((await fetch(`${base}/api/lucky`, { method: 'POST' })).status).toBe(405);
  });

  it('answers 200 with a refusal plan when the calibrator itself rejects (a probe blew up)', async () => {
    const base = await start({
      lucky: () => Promise.reject(new Error('wmic exploded')),
    });
    const res = await fetch(`${base}/api/lucky`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { ok: boolean; refusal?: string } };
    expect(body.plan.ok).toBe(false);
    expect(body.plan.refusal).toContain('probe failed');
  });
});

// GET /api/publicity's handler behavior moved to `test/server/pool-client.test.ts`
// (epic 0002 shell decomposition — `handlePublicity` now lives in
// `server/pool-client.ts`, tested directly there like `handleGhStatus`/
// `handleGithubSyncExecute`'s own extractions).
