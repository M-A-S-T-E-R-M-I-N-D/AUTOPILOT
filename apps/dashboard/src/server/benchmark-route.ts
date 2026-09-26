// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `GET /api/benchmark` — every model the fleet has flown, measured on its
 * own firings (see `read/benchmark.ts`). Read-only. A thrown read answers
 * 503 so the page says it could not load rather than drawing empty charts
 * that look like "no model has ever flown".
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from './http-util.js';
import type { BenchmarkPayload } from '../read/benchmark.js';

/** `projectId` narrows the read to one project; omitted, the whole fleet. */
export type BenchmarkApi = (projectId?: string) => BenchmarkPayload | Promise<BenchmarkPayload>;

/** The `?project=` a request asks for — a plain id, or none. Anything that
 *  is not a short plain id is ignored rather than passed to the store. */
export function benchmarkScopeOf(url: string | undefined): string | undefined {
  const raw = new URL(url ?? '/', 'http://localhost').searchParams.get('project');
  return raw !== null && /^[A-Za-z0-9._-]{1,200}$/.test(raw) ? raw : undefined;
}

export async function handleBenchmark(
  req: IncomingMessage,
  res: ServerResponse,
  api: BenchmarkApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'benchmark unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    send(200, await api(benchmarkScopeOf(req.url)));
  } catch {
    send(503, { error: 'benchmark read failed' });
  }
}
