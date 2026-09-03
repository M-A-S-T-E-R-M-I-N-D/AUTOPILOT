// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { stylesheet } from '@autopilot/tokens';
import { renderShell } from '../web/shell.js';
import { layoutCss } from '../web/layout-css.js';
import { minifiedCoreJs, minifiedProjectJs, minifiedPanelsJs } from './client-bundle.js';
import { PRODUCT_VERSION } from '../info.js';
import { buildFleetView, type FleetView } from '../read/fleet.js';
import { faviconSvg, renderFaviconIco, renderIconPng, webManifest } from '../assets/brandmark.js';
import { FONT_ROUTES, fontFaceCss } from '../assets/fonts.js';

export interface RouteResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: string | Buffer;
}

export interface RouteDeps {
  /** Supplies the live Fleet view for `GET /api/state` (injected by the server). */
  readonly readState?: () => FleetView;
}

const JSON_TYPE = 'application/json; charset=utf-8';

/** Pure request router — maps a path to a response (no socket, fully testable). */
export function handleRoute(path: string, deps: RouteDeps = {}): RouteResponse {
  // The per-project inside page: same shell, anchored to one project id. The id
  // is HTML-escaped by renderShell; an unknown id renders an honest not-found
  // state client-side (the live data decides, not the URL).
  if (path.startsWith('/p/') && path.length > 3) {
    let projectId: string;
    try {
      projectId = decodeURIComponent(path.slice(3));
    } catch {
      // Malformed percent-encoding (e.g. a bare "%" or a truncated multi-byte
      // sequence) throws URIError — one bad URL must not take down the whole
      // dashboard process, since nothing upstream catches a synchronous throw
      // inside the http request listener.
      return { status: 400, contentType: 'text/plain; charset=utf-8', body: 'bad request' };
    }
    return { status: 200, contentType: 'text/html; charset=utf-8', body: renderShell(projectId) };
  }
  const fontRoute = FONT_ROUTES[path];
  if (fontRoute) {
    return { status: 200, contentType: 'font/woff2', body: fontRoute() };
  }
  switch (path) {
    case '/':
      return { status: 200, contentType: 'text/html; charset=utf-8', body: renderShell() };
    case '/tokens.css':
      return {
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: `${fontFaceCss()}\n${stylesheet()}\n${layoutCss()}\n`,
      };
    case '/app.js':
      return {
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: minifiedCoreJs(),
      };
    case '/project.js':
      return {
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: minifiedProjectJs(),
      };
    case '/panels.js':
      return {
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: minifiedPanelsJs(),
      };
    case '/favicon.svg':
      return { status: 200, contentType: 'image/svg+xml; charset=utf-8', body: faviconSvg() };
    case '/favicon.ico':
      return { status: 200, contentType: 'image/x-icon', body: renderFaviconIco() };
    case '/apple-touch-icon.png':
      return { status: 200, contentType: 'image/png', body: renderIconPng(180) };
    case '/icon-192.png':
      return { status: 200, contentType: 'image/png', body: renderIconPng(192) };
    case '/icon-512.png':
      return { status: 200, contentType: 'image/png', body: renderIconPng(512) };
    case '/manifest.webmanifest':
      return {
        status: 200,
        contentType: 'application/manifest+json; charset=utf-8',
        body: webManifest(),
      };
    case '/api/health':
      return {
        status: 200,
        contentType: JSON_TYPE,
        body: JSON.stringify({ ok: true, name: 'autopilot-dashboard', version: PRODUCT_VERSION }),
      };
    case '/api/state': {
      const state = deps.readState ? deps.readState() : buildFleetView(0, []);
      return { status: 200, contentType: JSON_TYPE, body: JSON.stringify(state) };
    }
    default:
      return { status: 404, contentType: 'text/plain; charset=utf-8', body: 'not found' };
  }
}
