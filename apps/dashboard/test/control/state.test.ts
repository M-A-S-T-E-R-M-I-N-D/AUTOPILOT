// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseState, serializeState, classifyStatus, isSafePid } from '../../src/control/state.js';

describe('run-state model', () => {
  it('round-trips a valid record', () => {
    const s = { pid: 123, port: 4317, startedAt: 1000 };
    expect(parseState(serializeState(s))).toEqual(s);
  });

  it('rejects unsafe pids, bad ports, and malformed JSON', () => {
    expect(parseState('{"pid":0,"port":4317,"startedAt":1}')).toBeNull();
    expect(parseState('{"pid":-3,"port":4317,"startedAt":1}')).toBeNull();
    expect(parseState('{"pid":1.5,"port":4317,"startedAt":1}')).toBeNull();
    expect(parseState('{"pid":9,"port":0,"startedAt":1}')).toBeNull();
    expect(parseState('{"pid":9,"port":4317,"startedAt":"not-a-number"}')).toBeNull();
    expect(parseState('not json')).toBeNull();
    expect(parseState('[]')).toBeNull();
    expect(parseState('null')).toBeNull();
    expect(parseState('42')).toBeNull();
  });

  it('classifies the run state', () => {
    expect(classifyStatus(false, false)).toBe('stopped');
    expect(classifyStatus(true, true)).toBe('running');
    expect(classifyStatus(true, false)).toBe('stale');
  });

  it('isSafePid guards 0 / negative / non-integer (never signal a group)', () => {
    expect(isSafePid(123)).toBe(true);
    expect(isSafePid(0)).toBe(false);
    expect(isSafePid(-1)).toBe(false);
    expect(isSafePid(1.5)).toBe(false);
  });
});
