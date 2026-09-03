// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from '../../src/server/http-util.js';

/** Minimal `IncomingMessage` stand-in: `readBody`/`clientKey` only touch
 *  `.on()` (inherited from `EventEmitter`) and `.socket.remoteAddress`. */
function fakeRequest(remoteAddress?: string): {
  socket: { remoteAddress: string | undefined };
  on: EventEmitter['on'];
  emit: EventEmitter['emit'];
} {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { socket: { remoteAddress } });
}

/** Minimal `ServerResponse` stand-in: `sendJson` only calls `.writeHead()`/`.end()`. */
function fakeResponse(): { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { writeHead: vi.fn(), end: vi.fn() };
}

describe('clientKey', () => {
  it("returns the socket's remote address", () => {
    const req = fakeRequest('203.0.113.7');
    expect(clientKey(req as never)).toBe('203.0.113.7');
  });

  it("falls back to 'unknown' when remoteAddress is undefined", () => {
    const req = fakeRequest(undefined);
    expect(clientKey(req as never)).toBe('unknown');
  });
});

describe('sendJson', () => {
  it('writes the status, JSON content-type, and serialized body', () => {
    const res = fakeResponse();

    sendJson(res as never, {}, 200, { ok: true });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });

  it('lets caller-supplied headers override the default content-type', () => {
    const res = fakeResponse();

    sendJson(res as never, { 'Content-Type': 'application/problem+json' }, 400, { error: 'bad' });

    expect(res.writeHead).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/problem+json',
    });
  });

  it('merges caller-supplied headers alongside the default content-type', () => {
    const res = fakeResponse();

    sendJson(res as never, { 'X-Request-Id': 'abc123' }, 200, {});

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': 'abc123',
    });
  });
});

describe('readBody', () => {
  it('resolves with the accumulated body for a single chunk', async () => {
    const req = fakeRequest();

    const promise = readBody(req as never, MAX_BODY_BYTES);
    req.emit('data', Buffer.from('hello'));
    req.emit('end');

    await expect(promise).resolves.toBe('hello');
  });

  it('accumulates multiple chunks in order', async () => {
    const req = fakeRequest();

    const promise = readBody(req as never, MAX_BODY_BYTES);
    req.emit('data', Buffer.from('foo'));
    req.emit('data', Buffer.from('bar'));
    req.emit('end');

    await expect(promise).resolves.toBe('foobar');
  });

  it('accepts a body exactly at the byte limit', async () => {
    const req = fakeRequest();
    const body = 'x'.repeat(10);

    const promise = readBody(req as never, 10);
    req.emit('data', Buffer.from(body));
    req.emit('end');

    await expect(promise).resolves.toBe(body);
  });

  it('rejects a body one byte over the limit', async () => {
    const req = fakeRequest();

    const promise = readBody(req as never, 10);
    promise.catch(() => {}); // silence the unhandled-rejection warning before assertion
    req.emit('data', Buffer.from('x'.repeat(11)));

    await expect(promise).rejects.toThrow('body too large');
  });

  it('stops accumulating further chunks once over the limit', async () => {
    const req = fakeRequest();

    const promise = readBody(req as never, 5);
    promise.catch(() => {});
    req.emit('data', Buffer.from('x'.repeat(6)));
    req.emit('data', Buffer.from('more data that must be ignored'));
    req.emit('end');

    await expect(promise).rejects.toThrow('body too large');
  });

  it('propagates a request stream error', async () => {
    const req = fakeRequest();

    const promise = readBody(req as never, MAX_BODY_BYTES);
    promise.catch(() => {});
    req.emit('error', new Error('socket reset'));

    await expect(promise).rejects.toThrow('socket reset');
  });
});
