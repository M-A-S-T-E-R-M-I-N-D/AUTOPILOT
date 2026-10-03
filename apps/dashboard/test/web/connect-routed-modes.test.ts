// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover offers every auth mode the server stores (epic 0036,
 * GitHub #21 slice S1). `validateConnect` and `readConnectionConfig` have taken
 * `endpoint`, `bedrock` and `vertex` since 2026-10-03, but the panel's select
 * listed three modes. A stored endpoint left it blank, and Save then posted an
 * empty mode, which the server refuses. These run the real panel markup and
 * the real connect client under jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import axe from 'axe-core';
import { renderShell } from '../../src/web/shell.js';
import { connectJs } from '../../src/web/features/connect.js';
import { isAuthMode } from '../../src/connection/config.js';

interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

/** a11y.test.ts's bar: WCAG A+AA, contrast left to the token package's tests
 *  (jsdom has no layout engine to compute it). */
const AXE_OPTIONS: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

const SUBSCRIPTION = {
  mode: 'subscription',
  ready: true,
  cliPresent: true,
  cliVersion: '2.1.0',
  description: 'Claude subscription (Claude Code login)',
};

function jsonResponse(body: unknown): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 200, json: async () => body };
}

/** Render the shell, run the connect client alone, and record its requests.
 *  GET /api/connection answers `stored`; a POST echoes the mode it was sent. */
function boot(stored: Record<string, unknown>): FetchCall[] {
  document.open();
  document.write(renderShell());
  document.close();
  const calls: FetchCall[] = [];
  globalThis.fetch = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, method: init?.method ?? 'GET', body });
    if (url === '/api/connection') {
      return jsonResponse(body ? { ...stored, mode: body['mode'] } : stored);
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
  // The bundle helpers connect.ts calls bare, stubbed: this runs one module.
  new Function(
    'function tr(key) { return key; }\n' +
      'function reportActionLabel(action) { return action; }\n' +
      'function reportLanguageSelect(id) { var s = document.createElement("select"); s.id = id; return s; }\n' +
      'function reportLanguageFollowPage() {}\n' +
      'function ritualFetch(kind, url, init) { return fetch(url, init); }\n' +
      connectJs(),
  )();
  return calls;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is not on the page`);
  return el as T;
}

function fieldGroup(mode: string): HTMLFieldSetElement {
  const group = document.querySelector<HTMLFieldSetElement>(`[data-connect-fields="${mode}"]`);
  if (!group) throw new Error(`no field group for ${mode}`);
  return group;
}

function chooseMode(mode: string): void {
  const select = byId<HTMLSelectElement>('connect-mode');
  select.value = mode;
  select.dispatchEvent(new Event('change'));
}

function type(id: string, value: string): void {
  byId<HTMLInputElement>(id).value = value;
}

function connectionPosts(calls: readonly FetchCall[]): FetchCall[] {
  return calls.filter((c) => c.url === '/api/connection' && c.method === 'POST');
}

describe('the CONNECT popover offers the endpoint, Bedrock and Vertex modes (epic 0036)', () => {
  it('lists all six modes the server stores, each one it accepts', () => {
    boot(SUBSCRIPTION);
    const values = [...byId<HTMLSelectElement>('connect-mode').options].map((o) => o.value);

    expect(values).toEqual([
      'subscription',
      'api-key',
      'oauth-token',
      'endpoint',
      'bedrock',
      'vertex',
    ]);
    for (const value of values) expect(isAuthMode(value), value).toBe(true);
  });

  it('shows a stored endpoint mode as chosen, with its own fields and no others', async () => {
    boot({
      ...SUBSCRIPTION,
      mode: 'endpoint',
      description: 'Custom endpoint (http://localhost:4000)',
    });

    await vi.waitFor(() => expect(byId<HTMLSelectElement>('connect-mode').value).toBe('endpoint'));
    expect(fieldGroup('endpoint').hidden).toBe(false);
    expect(fieldGroup('endpoint').disabled).toBe(false);
    for (const other of ['bedrock', 'vertex']) {
      expect(fieldGroup(other).hidden, other).toBe(true);
      expect(fieldGroup(other).disabled, other).toBe(true);
    }
    expect(byId<HTMLInputElement>('connect-secret').hidden).toBe(true);
    expect(byId('connect-hint').textContent).toBe('connectEndpointHint');
  });

  it('labels every field it shows, and requires the endpoint URL and the Vertex project', () => {
    boot(SUBSCRIPTION);
    for (const id of [
      'connect-base-url',
      'connect-auth-token',
      'connect-aws-region',
      'connect-gcp-project',
      'connect-gcp-region',
    ]) {
      expect(
        document.querySelector(`label[for="${id}"]`)?.getAttribute('data-i18n'),
        id,
      ).toBeTruthy();
    }
    expect(byId<HTMLInputElement>('connect-base-url').required).toBe(true);
    expect(byId<HTMLInputElement>('connect-base-url').type).toBe('url');
    expect(byId<HTMLInputElement>('connect-auth-token').type).toBe('password');
    expect(byId<HTMLInputElement>('connect-gcp-project').required).toBe(true);
    expect(byId<HTMLInputElement>('connect-aws-region').required).toBe(false);
    expect(byId<HTMLInputElement>('connect-gcp-region').required).toBe(false);
  });

  it('shows only the chosen mode’s fields, and clears a token whose mode is left', () => {
    boot(SUBSCRIPTION);
    chooseMode('endpoint');
    type('connect-auth-token', 'tok-123');

    chooseMode('vertex');

    expect(fieldGroup('vertex').hidden).toBe(false);
    expect(fieldGroup('vertex').disabled).toBe(false);
    expect(fieldGroup('endpoint').hidden).toBe(true);
    expect(fieldGroup('endpoint').disabled).toBe(true);
    expect(byId<HTMLInputElement>('connect-auth-token').value).toBe('');
    expect(byId('connect-hint').textContent).toBe('connectVertexHint');

    chooseMode('bedrock');
    expect(fieldGroup('bedrock').hidden).toBe(false);
    expect(fieldGroup('vertex').hidden).toBe(true);
    expect(byId('connect-hint').textContent).toBe('connectBedrockHint');
  });

  it('saves a Vertex choice with its project and region only', async () => {
    const calls = boot(SUBSCRIPTION);
    chooseMode('endpoint');
    type('connect-base-url', 'http://localhost:4000');
    chooseMode('vertex');
    type('connect-gcp-project', 'my-project');
    type('connect-gcp-region', 'us-east5');

    byId<HTMLFormElement>('connect-form').requestSubmit();

    await vi.waitFor(() => expect(connectionPosts(calls)).toHaveLength(1));
    expect(connectionPosts(calls)[0]?.body).toEqual({
      mode: 'vertex',
      gcpProjectId: 'my-project',
      gcpRegion: 'us-east5',
    });
  });

  it('saves an endpoint with its URL and token, then clears the token field', async () => {
    const calls = boot(SUBSCRIPTION);
    chooseMode('endpoint');
    type('connect-base-url', 'https://gateway.example.com');
    type('connect-auth-token', 'tok-123');

    byId<HTMLFormElement>('connect-form').requestSubmit();

    await vi.waitFor(() => expect(connectionPosts(calls)).toHaveLength(1));
    expect(connectionPosts(calls)[0]?.body).toEqual({
      mode: 'endpoint',
      baseUrl: 'https://gateway.example.com',
      authToken: 'tok-123',
    });
    await vi.waitFor(() => expect(byId<HTMLInputElement>('connect-auth-token').value).toBe(''));
    expect(byId<HTMLInputElement>('connect-base-url').value).toBe('https://gateway.example.com');
  });

  it('saves Bedrock with its region, and needs no field filled', async () => {
    const calls = boot(SUBSCRIPTION);
    chooseMode('bedrock');
    type('connect-aws-region', 'eu-west-1');

    byId<HTMLFormElement>('connect-form').requestSubmit();

    await vi.waitFor(() => expect(connectionPosts(calls)).toHaveLength(1));
    expect(connectionPosts(calls)[0]?.body).toEqual({ mode: 'bedrock', awsRegion: 'eu-west-1' });
  });

  it('stays axe-clean with each mode’s fields showing', async () => {
    boot(SUBSCRIPTION);
    byId<HTMLDetailsElement>('connect').open = true;
    for (const mode of ['endpoint', 'bedrock', 'vertex']) {
      chooseMode(mode);
      const results = await axe.run(byId('connect-form'), AXE_OPTIONS);
      expect(
        results.violations.map((v) => v.id),
        mode,
      ).toEqual([]);
      // Not a vacuous pass: axe judged the shown fields' labels.
      const labelled = results.passes.find((p) => p.id === 'label')?.nodes ?? [];
      const fields = labelled.map((n) => String(n.target[0]));
      const shown = fieldGroup(mode).querySelectorAll('input');
      for (const input of shown) expect(fields, mode).toContain(`#${input.id}`);
    }
  });

  it('refuses a Vertex save with no project before any request', async () => {
    const calls = boot(SUBSCRIPTION);
    chooseMode('vertex');

    byId<HTMLFormElement>('connect-form').requestSubmit();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connectionPosts(calls)).toHaveLength(0);
  });
});
