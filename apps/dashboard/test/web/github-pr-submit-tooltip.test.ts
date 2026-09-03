// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the "Contribute
 * upstream" form's "Open pull request" submit button carried no [data-tip],
 * while every neighboring GitHub-write control (Sync to GitHub, the CONNECT
 * popover's issue button) already explains itself. Its click has the most
 * non-obvious consequence on the page — one submit = `gh repo fork` +
 * branch push + `gh pr create` against the upstream repo — which
 * hover/focus should say BEFORE the click. Tip text lives in
 * githubPrSubmitTip (web/card-actions.ts) next to the form's existing
 * label/confirm/result text math; the wiring assertions use the same
 * generated-text style as tour-button-tooltips.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { githubPrSubmitTip } from '../../src/web/card-actions.js';
import { clientJs } from '../../src/web/shell.js';

describe('githubPrSubmitTip', () => {
  it('leads with the action, then spells out the fork + push + gh pr create sequence', () => {
    expect(githubPrSubmitTip('demo')).toBe(
      "Opens a real pull request against the upstream AUTOPILOT repo — forks it, pushes demo's current branch to that fork, and runs gh pr create with your own gh. Asks for confirmation first.",
    );
  });

  it('names the project whose branch travels upstream', () => {
    expect(githubPrSubmitTip('my-app')).toContain("my-app's current branch");
  });
});

describe('the "Open pull request" submit button explains itself on hover/focus', () => {
  const out = clientJs();

  it('embeds the real compiled githubPrSubmitTip source', () => {
    expect(out).toContain('function githubPrSubmitTip(');
  });

  it('derives the tip from the project name', () => {
    expect(out).toContain('var ghPrSubmitTip = githubPrSubmitTip(c.name);');
  });

  it('wires the tip as data-tip', () => {
    expect(out).toContain("ghPrSubmit.setAttribute('data-tip', ghPrSubmitTip);");
  });

  it('wires the tip as aria-label, matching the Sync-to-GitHub precedent', () => {
    expect(out).toContain("ghPrSubmit.setAttribute('aria-label', ghPrSubmitTip);");
  });
});
