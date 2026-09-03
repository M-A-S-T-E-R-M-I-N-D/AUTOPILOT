// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared HTTP request/response helpers for the dashboard server's handlers
 * (epic 0002 "shell decomposition" — split from `server.ts` so feature
 * handler modules can use them without a circular import back into the
 * server shell).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export const MAX_BODY_BYTES = 64 * 1024;

/** The rate-limit key for a request: the client's remote address (the loopback
 *  host guard already restricts who can reach this address at all). */
export function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

/** Writes a JSON response with the shared security headers. Every handler
 *  used to redeclare this exact three-line closure as a local `send`
 *  — 26 byte-identical copies (epic 0002 "shell decomposition" §DRY) — this
 *  is the one definition; handlers keep their own `send` local bound to
 *  their own `res`/`headers`, now a one-line forward instead of a copy. */
export function sendJson(
  res: ServerResponse,
  headers: Record<string, string>,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    let overLimit = false;
    req.on('data', (chunk: Buffer) => {
      if (overLimit) return; // already rejected — stop accumulating, let the rest drain
      size += chunk.length;
      if (size > limit) {
        overLimit = true;
        // Reject only — do NOT destroy the socket here. Destroying it now would
        // tear the connection down before the caller's catch handler gets a
        // chance to flush a 413 response, so the client sees a raw connection
        // reset instead of the intended "body too large" JSON error.
        reject(new Error('body too large'));
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
