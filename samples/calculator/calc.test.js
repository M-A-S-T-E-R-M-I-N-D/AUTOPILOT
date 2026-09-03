// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// The MISSION's defined endpoint: every test here starts RED at seed time —
// AUTOPILOT's flight is done exactly when they are all green (MISSION.md).
// Pure pocket-calculator semantics: sequential evaluation, no precedence.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialState, press } = require('./calc.js');

function type(keys) {
  let s = initialState();
  for (const k of keys) s = press(s, k);
  return s;
}

test('typing digits builds a number on the display', () => {
  assert.equal(type(['4', '2']).display, '42');
});

test('a leading zero is replaced, not accumulated', () => {
  assert.equal(type(['0', '7']).display, '7');
});

test('adds two numbers on equals', () => {
  assert.equal(type(['2', '+', '3', '=']).display, '5');
});

test('subtracts, multiplies, and divides', () => {
  assert.equal(type(['9', '-', '4', '=']).display, '5');
  assert.equal(type(['6', '*', '7', '=']).display, '42');
  assert.equal(type(['8', '/', '2', '=']).display, '4');
});

test('sequential evaluation, pocket-calculator style: 2 + 3 * 4 = 20', () => {
  assert.equal(type(['2', '+', '3', '*', '4', '=']).display, '20');
});

test('decimal input works and a second dot is ignored', () => {
  assert.equal(type(['1', '.', '5', '.', '5', '+', '1', '=']).display, '2.55');
});

test('divide by zero shows Error and the next digit starts fresh', () => {
  const err = type(['5', '/', '0', '=']);
  assert.equal(err.display, 'Error');
  assert.equal(press(err, '3').display, '3');
});

test('Escape clears everything', () => {
  assert.equal(type(['7', '+', '2', 'Escape']).display, '0');
});

test('Backspace deletes the last digit, down to 0', () => {
  assert.equal(type(['1', '2', '3', 'Backspace']).display, '12');
  assert.equal(type(['5', 'Backspace', 'Backspace']).display, '0');
});

test('equals twice repeats the last operation', () => {
  assert.equal(type(['1', '0', '+', '5', '=', '=']).display, '20');
});

test('an operator right after equals chains from the result', () => {
  assert.equal(type(['2', '+', '2', '=', '*', '3', '=']).display, '12');
});

test('floating point stays presentable: 0.1 + 0.2 displays 0.3', () => {
  assert.equal(type(['0', '.', '1', '+', '0', '.', '2', '=']).display, '0.3');
});
