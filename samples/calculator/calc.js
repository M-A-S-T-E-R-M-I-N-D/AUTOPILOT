// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// SEED STUB — deliberately unimplemented. The MISSION's endpoint is
// calc.test.js going green; this file is where the flight builds the pure
// state machine (no DOM here, ever — index.html does the wiring).
'use strict';

function initialState() {
  return { display: '0' };
}

function press(state, _key) {
  // TODO(flight): implement the pocket-calculator state machine per
  // MISSION.md — digits, . , + - * /, =, Escape, Backspace; sequential
  // evaluation; Error on divide-by-zero with clean recovery.
  return state;
}

if (typeof module !== 'undefined') module.exports = { initialState, press };
