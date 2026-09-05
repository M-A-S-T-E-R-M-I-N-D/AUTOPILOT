// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// Pure pocket-calculator state machine — no DOM here, ever (index.html does
// the wiring). Sequential evaluation, no operator precedence, per MISSION.md.
'use strict';

const OPERATORS = new Set(['+', '-', '*', '/']);

function initialState() {
  return {
    display: '0',
    acc: null,
    op: null,
    overwrite: true,
    error: false,
    lastOp: null,
    lastOperand: null,
  };
}

function appendDigit(display, digit) {
  return display === '0' ? digit : display + digit;
}

/** @param {number} value */
function formatNumber(value) {
  if (!Number.isFinite(value)) return 'Error';
  // Round off float noise (e.g. 0.1 + 0.2) without truncating real precision.
  return String(Math.round(value * 1e10) / 1e10);
}

function compute(a, op, b) {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function errorState() {
  return { ...initialState(), display: 'Error', error: true };
}

function pressDigit(state, digit) {
  const base = state.overwrite || state.error ? '0' : state.display;
  return { ...state, display: appendDigit(base, digit), overwrite: false, error: false };
}

function pressDot(state) {
  if (state.overwrite || state.error) {
    return { ...state, display: '0.', overwrite: false, error: false };
  }
  if (state.display.includes('.')) return state;
  return { ...state, display: state.display + '.' };
}

function pressOperator(state, key) {
  if (state.error) return state;
  const current = Number(state.display);
  let acc = state.acc;
  if (acc === null) {
    acc = current;
  } else if (!state.overwrite) {
    acc = compute(acc, state.op, current);
    if (!Number.isFinite(acc)) return errorState();
  }
  return { ...state, acc, op: key, display: formatNumber(acc), overwrite: true, error: false };
}

function pressEquals(state) {
  if (state.error || state.op === null) return state;
  const repeating = state.overwrite && state.lastOp !== null;
  const op = repeating ? state.lastOp : state.op;
  const operand = repeating ? state.lastOperand : Number(state.display);
  const result = compute(state.acc, op, operand);
  if (!Number.isFinite(result)) return errorState();
  return {
    ...state,
    acc: result,
    lastOp: op,
    lastOperand: operand,
    display: formatNumber(result),
    overwrite: true,
    error: false,
  };
}

function pressPercent(state) {
  if (state.error) return state;
  const value = Number(state.display) / 100;
  return { ...state, display: formatNumber(value), overwrite: true };
}

function pressBackspace(state) {
  if (state.error) return initialState();
  if (state.overwrite) return state;
  return { ...state, display: state.display.length > 1 ? state.display.slice(0, -1) : '0' };
}

/**
 * @param {{display: string}} state
 * @param {string} key
 */
function press(state, key) {
  if (/^[0-9]$/.test(key)) return pressDigit(state, key);
  if (key === '.') return pressDot(state);
  if (OPERATORS.has(key)) return pressOperator(state, key);
  if (key === '%') return pressPercent(state);
  if (key === '=') return pressEquals(state);
  if (key === 'Escape') return initialState();
  if (key === 'Backspace') return pressBackspace(state);
  return state;
}

if (typeof module !== 'undefined') module.exports = { initialState, press };
