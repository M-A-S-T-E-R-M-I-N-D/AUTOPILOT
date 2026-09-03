// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { handleRoute } from '../../src/server/routes.js';
import { PRODUCT_VERSION } from '../../src/info.js';

describe('handleRoute', () => {
  it('serves the token-themed HTML shell at /', () => {
    const r = handleRoute('/');
    expect(r.status).toBe(200);
    expect(r.contentType).toContain('text/html');
    expect(r.body).toContain('AUTOPILOT');
    expect(r.body).toContain('/tokens.css');
    expect(r.body).toContain('data-theme-btn="terminal"');
    expect(r.body).toContain('id="fleet"'); // live fleet mount point
    // Assets are content-versioned so a stale bundle can't survive a restart.
    expect(r.body).toMatch(/\/app\.js\?v=[a-z0-9]+/);
    expect(r.body).toMatch(/\/tokens\.css\?v=[a-z0-9]+/);
    // Brand mark: favicon (ico + svg), apple touch icon, and PWA manifest.
    expect(r.body).toContain('rel="icon" href="/favicon.ico"');
    expect(r.body).toContain('rel="icon" href="/favicon.svg" type="image/svg+xml"');
    expect(r.body).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(r.body).toContain('rel="manifest" href="/manifest.webmanifest"');
    // Self-hosted fonts are preloaded (crossorigin is required for font preloads
    // per spec, even same-origin) so the shell text doesn't flash unstyled.
    expect(r.body).toContain(
      '<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin="anonymous" />',
    );
    expect(r.body).toContain(
      '<link rel="preload" href="/fonts/roboto.woff2" as="font" type="font/woff2" crossorigin="anonymous" />',
    );
  });

  it('serves the 🍀 lucky button as a theme-aware currentColor SVG, never a raw emoji glyph (emoji ignore the token palette in every theme)', () => {
    const r = handleRoute('/');
    expect(r.body).toContain('id="fly-lucky"');
    // The clover is an inline SVG inheriting currentColor — both themes (and
    // terminal) restyle it via the button's own token-driven color.
    const btn = r.body.slice(r.body.indexOf('id="fly-lucky"'), r.body.indexOf('id="fly-go"'));
    expect(btn).toContain(
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">',
    );
    expect(btn).not.toContain('🍀');
  });

  it('serves the shell anchored to one project at /p/<id> (escaped)', () => {
    const r = handleRoute('/p/demo-checkout-web');
    expect(r.status).toBe(200);
    expect(r.body).toContain('data-project="demo-checkout-web"');

    // Hostile ids cannot break out of the attribute.
    const evil = handleRoute('/p/x%22%3E%3Cscript%3E');
    expect(evil.body).not.toContain('"><script>');
    expect(evil.body).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('answers 400 instead of throwing on a malformed /p/<id> percent-encoding', () => {
    // A bare "%" or a truncated multi-byte escape makes decodeURIComponent
    // throw URIError; nothing upstream catches a synchronous throw inside the
    // http request listener, so this must not escape handleRoute.
    for (const path of ['/p/%', '/p/%E0%A4', '/p/100%']) {
      const r = handleRoute(path);
      expect(r.status).toBe(400);
    }
  });

  it('serves the tokens + layout CSS with the three themes', () => {
    const r = handleRoute('/tokens.css');
    expect(r.contentType).toContain('text/css');
    expect(r.body).toContain('--color-surface:');
    expect(r.body).toContain("[data-theme='light']");
    expect(r.body).toContain('var(--color-surface)');
  });

  it('serves the self-hosted @font-face rules in the tokens stylesheet', () => {
    const r = handleRoute('/tokens.css');
    expect(r.body).toContain("font-family: 'Inter';");
    expect(r.body).toContain("font-family: 'Roboto';");
    expect(r.body).toContain('src: url(/fonts/inter.woff2)');
    expect(r.body).toContain('src: url(/fonts/roboto.woff2)');
  });

  it('serves the self-hosted Inter and Roboto woff2 binaries (same-origin, zero external font calls)', () => {
    for (const path of ['/fonts/inter.woff2', '/fonts/roboto.woff2']) {
      const r = handleRoute(path);
      expect(r.status).toBe(200);
      expect(r.contentType).toBe('font/woff2');
      expect(Buffer.isBuffer(r.body)).toBe(true);
      expect((r.body as Buffer).subarray(0, 4).toString('ascii')).toBe('wOF2');
    }
  });

  it('serves the client script (theme switcher + live fleet poller)', () => {
    const r = handleRoute('/app.js');
    expect(r.contentType).toContain('javascript');
    expect(r.body).toContain('dataset.theme'); // switcher
    expect(r.body).toContain('/api/state'); // fleet poller
    expect(r.body).toContain('setInterval');
  });

  it('serves a JSON health probe', () => {
    const r = handleRoute('/api/health');
    expect(JSON.parse(r.body as string)).toMatchObject({
      ok: true,
      name: 'autopilot-dashboard',
      version: PRODUCT_VERSION,
    });
    // The health probe reports the PRODUCT version (RELEASING.md), not 0.1.0.
    expect(PRODUCT_VERSION).not.toBe('0.1.0');
  });

  it('serves an empty fleet at /api/state when no provider is wired', () => {
    const r = handleRoute('/api/state');
    expect(r.contentType).toContain('json');
    const state = JSON.parse(r.body as string);
    expect(state.empty).toBe(true);
    expect(state.projects).toEqual([]);
  });

  it('serves the injected live fleet state at /api/state', () => {
    const fake = {
      generatedAt: 7,
      totals: { projects: 1, flying: 1, needsYou: 0, firings: 2, shipped: 2, openFindings: 0 },
      projects: [{ id: 'x', name: 'X', status: 'flying' }],
      empty: false,
    };
    const r = handleRoute('/api/state', { readState: () => fake as never });
    const state = JSON.parse(r.body as string);
    expect(state.empty).toBe(false);
    expect(state.projects[0].name).toBe('X');
  });

  it('404s an unknown path', () => {
    expect(handleRoute('/nope').status).toBe(404);
  });

  it('serves the scalable brand mark at /favicon.svg', () => {
    const r = handleRoute('/favicon.svg');
    expect(r.contentType).toContain('image/svg+xml');
    expect(r.body).toContain('<svg');
  });

  it('serves a real .ico at /favicon.ico', () => {
    const r = handleRoute('/favicon.ico');
    expect(r.contentType).toBe('image/x-icon');
    expect(Buffer.isBuffer(r.body)).toBe(true);
    expect((r.body as Buffer).readUInt16LE(2)).toBe(1); // ICO type
  });

  it('serves PNG rasters for apple-touch-icon and PWA manifest sizes', () => {
    for (const path of ['/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']) {
      const r = handleRoute(path);
      expect(r.contentType).toBe('image/png');
      expect((r.body as Buffer).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    }
  });

  it('serves a valid web app manifest referencing the icon routes', () => {
    const r = handleRoute('/manifest.webmanifest');
    expect(r.contentType).toContain('application/manifest+json');
    const manifest = JSON.parse(r.body as string);
    expect(manifest.name).toBe('AUTOPILOT');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
