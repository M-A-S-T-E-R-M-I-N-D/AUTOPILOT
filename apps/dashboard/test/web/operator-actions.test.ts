// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  OPERATOR_ACTION_LOG_CAP,
  recordOperatorAction,
  operatorActionsViewText,
} from '../../src/web/operator-actions.js';

describe('recordOperatorAction', () => {
  it('appends the new action to an empty log', () => {
    expect(recordOperatorAction([], 'launched /repo', 5)).toEqual(['launched /repo']);
  });

  it('appends after existing entries, oldest first', () => {
    expect(recordOperatorAction(['launched /repo'], 'stopped /repo', 5)).toEqual([
      'launched /repo',
      'stopped /repo',
    ]);
  });

  it('drops the oldest entry once the cap is exceeded', () => {
    const log = ['a', 'b', 'c'];
    expect(recordOperatorAction(log, 'd', 3)).toEqual(['b', 'c', 'd']);
  });

  it('does not mutate the input log', () => {
    const log = ['a'];
    recordOperatorAction(log, 'b', 5);
    expect(log).toEqual(['a']);
  });
});

describe('operatorActionsViewText', () => {
  it('is empty when no action has been recorded', () => {
    expect(operatorActionsViewText([])).toBe('');
  });

  it('joins recorded actions with a semicolon under a fixed prefix', () => {
    expect(operatorActionsViewText(['launched /repo', 'stopped /repo'])).toBe(
      'recent operator actions: launched /repo; stopped /repo',
    );
  });
});

describe('OPERATOR_ACTION_LOG_CAP', () => {
  it('is a positive integer small enough to keep the Ask prompt bounded', () => {
    expect(Number.isInteger(OPERATOR_ACTION_LOG_CAP)).toBe(true);
    expect(OPERATOR_ACTION_LOG_CAP).toBeGreaterThan(0);
    expect(OPERATOR_ACTION_LOG_CAP).toBeLessThanOrEqual(10);
  });
});
