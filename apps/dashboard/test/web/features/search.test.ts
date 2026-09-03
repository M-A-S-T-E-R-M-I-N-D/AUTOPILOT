// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the code-search + Ask client (`web/features/search.ts`)
 * — the fourth assembler function extracted out of `shell.ts` into its own file
 * under `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK B's
 * real extraction; `web/features/switcher.ts`/`web/features/connect.ts`/
 * `web/features/fly.ts` were the first three).
 */

import { describe, it, expect } from 'vitest';
import {
  rememberedHistory,
  searchProjectsSig,
  searchHitMeta,
} from '../../../src/web/search-history.js';
import {
  splitTableRow,
  isFence,
  isHeading,
  isListItem,
  isSvgStart,
  isTableStart,
  isBlockStart,
} from '../../../src/web/markdown.js';
import { splitSseFrames, applyAskStreamFrame } from '../../../src/web/ask-stream.js';
import { searchJs } from '../../../src/web/features/search.js';

describe('searchJs', () => {
  it('embeds searchProjectsSig/searchHitMeta via .toString() — rememberedHistory deduped to fly.ts', () => {
    const out = searchJs();
    expect(out).toContain(searchProjectsSig.toString());
    // rememberedHistory is spliced ONCE by features/fly.ts (same core chunk,
    // hoisting resolves the call here) — asserting its ABSENCE pins the dedup:
    expect(out).not.toContain(rememberedHistory.toString());
    expect(out).toContain(searchHitMeta.toString());
  });

  it('embeds the markdown parsing helpers real compiled source via .toString()', () => {
    const out = searchJs();
    expect(out).toContain(splitTableRow.toString());
    expect(out).toContain(isFence.toString());
    expect(out).toContain(isHeading.toString());
    expect(out).toContain(isListItem.toString());
    expect(out).toContain(isSvgStart.toString());
    expect(out).toContain(isTableStart.toString());
    expect(out).toContain(isBlockStart.toString());
  });

  it('embeds splitSseFrames/applyAskStreamFrame real compiled source via .toString()', () => {
    const out = searchJs();
    expect(out).toContain(splitSseFrames.toString());
    expect(out).toContain(applyAskStreamFrame.toString());
  });

  it('defines and immediately calls searchInit()', () => {
    const out = searchJs();
    expect(out).toContain('function searchInit() {');
    expect(out.trimEnd().endsWith('searchInit();')).toBe(true);
  });

  it('bails out early when neither the search form nor results panel is on the page', () => {
    expect(searchJs()).toContain('if (!form || !out) return;');
  });

  it('POSTs the ask question and persona as application/json against the streaming endpoint', () => {
    expect(searchJs()).toContain(
      "fetch('/api/ask/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: project, question: q, view: view, deep: deep, persona: askPersona }) })",
    );
  });

  it('defaults the persona to genius and wires the persona toggle group', () => {
    const out = searchJs();
    expect(out).toContain("var askPersona = 'genius';");
    expect(out).toContain("document.getElementById('ask-persona')");
    expect(out).toContain('askPersona = btn.dataset.personaBtn;');
  });

  it('renders the terminal frame proposal as an action card and gates write/destructive tools on a click', () => {
    const out = searchJs();
    expect(out).toContain("document.getElementById('ask-proposal')");
    expect(out).toContain('function renderProposal(proposal)');
    expect(out).toContain('renderProposal(update.proposal);');
    expect(out).toContain(
      "fetch('/api/control/execute', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({ tool: tool, args: args }),\n      })",
    );
    expect(out).toContain("if (safety === 'read') {");
    expect(out).toContain("confirmBtn.addEventListener('click', function () {");
    expect(out).toContain(
      "recordOperatorAction(operatorActionLog, 'ARCHITECT ran ' + tool, OPERATOR_ACTION_LOG_CAP)",
    );
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = searchJs();
    expect(out).toBe(out.trim());
  });

  it('explains the live Ask tool-activity chip on hover/focus (App-wide interactivity audit v2, web-msm66jlc-gm4oom) — unlike ask-sources beside it, this dynamically-created chip carried no data-tip/aria-label/tabindex at all', () => {
    const out = searchJs();
    // D1 TAB-STOP ROVING (epic 0015): the trail is one roving group — the
    // first chip seeds '0', every later chip lands at -1 and the shared
    // wireRoving() handlers move the stop (ask-activity-roving-tabindex.test.ts
    // drives the real bundle).
    expect(out).toContain(
      "chip.setAttribute('tabindex', activityEl.querySelector('.ask-activity-chip') ? '-1' : '0');",
    );
    expect(out).toContain("wireRoving('.ask-activity-chip', '.ask-activity');");
    expect(out).toContain(
      "chip.setAttribute('data-tip', 'A tool call the model made while researching this answer');",
    );
    expect(out).toContain(
      "chip.setAttribute('aria-label', 'Tool call: ' + (target ? tool + ': ' + target : tool));",
    );
  });
});
