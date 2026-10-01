// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
  DEFAULT_ENGINE_CONFIG,
  SUBAGENT_TOOLS,
  SUBAGENTS_OPT_OUT_LINE,
  WEB_TOOLS,
  INTERNET_OPT_OUT_LINE,
  TURN_CAP_LINE_PREFIX,
  BUDGET_CAP_LINE_PREFIX,
  firingToolGrant,
  soulOptsOutOfSubagents,
  soulOptsOutOfInternet,
  soulTurnCap,
  firingMaxTurns,
  soulBudgetCapUsd,
  firingMaxBudgetUsd,
} from '../src/config.js';

describe('DEFAULT_ALLOWED_TOOLS / DEFAULT_DISALLOWED_TOOLS', () => {
  it('never lists the same tool as both allowed and disallowed', () => {
    const overlap = DEFAULT_ALLOWED_TOOLS.filter((tool) =>
      (DEFAULT_DISALLOWED_TOOLS as readonly string[]).includes(tool),
    );
    expect(overlap).toEqual([]);
  });

  it('has no duplicate entries within either list', () => {
    expect(new Set(DEFAULT_ALLOWED_TOOLS).size).toBe(DEFAULT_ALLOWED_TOOLS.length);
    expect(new Set(DEFAULT_DISALLOWED_TOOLS).size).toBe(DEFAULT_DISALLOWED_TOOLS.length);
  });

  it('disallows the interactive/scheduling/control tools an unattended firing must never touch', () => {
    for (const tool of ['AskUserQuestion', 'SendMessage', 'TaskStop']) {
      expect(DEFAULT_DISALLOWED_TOOLS).toContain(tool);
    }
  });

  it('grants Bash as the only shell — PowerShell stays ungranted', () => {
    // Decided in docs/debriefs/2026-09-30-decision-ap-muo2yojl-0-powershell-stays-ungranted.md:
    // the guard's textual checks miss PowerShell-only shapes (registry and
    // certificate drives, the `&` call operator, kill aliases), so granting
    // it waits on the preconditions listed there.
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Bash');
    expect(DEFAULT_ALLOWED_TOOLS as readonly string[]).not.toContain('PowerShell');
  });
});

describe('the "Subagents: off" SOUL line — a per-project override of the subagent grant', () => {
  const SOUL = '# SOUL — client-app\n\nStack: js\n\n## Operating rules\n- Gate every change.';

  it('opts out on the line, plain or as a bullet, any case, stray spaces or a trailing CR', () => {
    expect(soulOptsOutOfSubagents(`${SOUL}\n${SUBAGENTS_OPT_OUT_LINE}\n`)).toBe(true);
    expect(soulOptsOutOfSubagents(`${SOUL}\n- Subagents: off`)).toBe(true);
    expect(soulOptsOutOfSubagents(`${SOUL}\n  * SUBAGENTS:OFF  `)).toBe(true);
    expect(soulOptsOutOfSubagents(`subagents:   Off\r\n${SOUL}`)).toBe(true);
  });

  it('does not opt out without the line, on a mention mid-sentence, or on any value but off', () => {
    expect(soulOptsOutOfSubagents(SOUL)).toBe(false);
    expect(soulOptsOutOfSubagents('')).toBe(false);
    expect(soulOptsOutOfSubagents(`${SOUL}\n- Never write "Subagents: off" here.`)).toBe(false);
    expect(soulOptsOutOfSubagents(`${SOUL}\nSubagents: on`)).toBe(false);
    expect(soulOptsOutOfSubagents(`${SOUL}\nSubagents: offline`)).toBe(false);
  });

  it('names the delegation tools the default grant allows', () => {
    for (const tool of SUBAGENT_TOOLS) {
      expect(DEFAULT_ALLOWED_TOOLS as readonly string[]).toContain(tool);
    }
  });

  it('keeps the default grant, the same lists, when subagents are on', () => {
    const grant = firingToolGrant({ subagentsEnabled: true });
    expect(grant.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
    expect(grant.disallowedTools).toBe(DEFAULT_DISALLOWED_TOOLS);
  });

  it('moves every delegation tool from allowed to disallowed when subagents are off', () => {
    const grant = firingToolGrant({ subagentsEnabled: false });
    for (const tool of SUBAGENT_TOOLS) {
      expect(grant.allowedTools).not.toContain(tool);
      expect(grant.disallowedTools).toContain(tool);
    }
    // Everything else in the grant is untouched.
    expect(grant.allowedTools).toEqual(
      DEFAULT_ALLOWED_TOOLS.filter((tool) => !(SUBAGENT_TOOLS as readonly string[]).includes(tool)),
    );
    expect(grant.disallowedTools).toEqual([...DEFAULT_DISALLOWED_TOOLS, ...SUBAGENT_TOOLS]);
    expect(grant.allowedTools.filter((tool) => grant.disallowedTools.includes(tool))).toEqual([]);
  });
});

describe('the "Internet: off" SOUL line — a per-project override of the web grant', () => {
  const SOUL = '# SOUL — client-app\n\nStack: js\n\n## Operating rules\n- Gate every change.';

  it('opts out on the line, plain or as a bullet, any case, stray spaces or a trailing CR', () => {
    expect(soulOptsOutOfInternet(`${SOUL}\n${INTERNET_OPT_OUT_LINE}\n`)).toBe(true);
    expect(soulOptsOutOfInternet(`${SOUL}\n- Internet: off`)).toBe(true);
    expect(soulOptsOutOfInternet(`${SOUL}\n  * INTERNET:OFF  `)).toBe(true);
    expect(soulOptsOutOfInternet(`internet:   Off\r\n${SOUL}`)).toBe(true);
  });

  it('does not opt out without the line, on a mention mid-sentence, or on any value but off', () => {
    expect(soulOptsOutOfInternet(SOUL)).toBe(false);
    expect(soulOptsOutOfInternet('')).toBe(false);
    expect(soulOptsOutOfInternet(`${SOUL}\n- Never write "Internet: off" here.`)).toBe(false);
    expect(soulOptsOutOfInternet(`${SOUL}\nInternet: on`)).toBe(false);
    expect(soulOptsOutOfInternet(`${SOUL}\nInternet: offline`)).toBe(false);
    // One override never trips the other.
    expect(soulOptsOutOfInternet(`${SOUL}\n${SUBAGENTS_OPT_OUT_LINE}`)).toBe(false);
    expect(soulOptsOutOfSubagents(`${SOUL}\n${INTERNET_OPT_OUT_LINE}`)).toBe(false);
  });

  it('names the web tools the default grant allows', () => {
    for (const tool of WEB_TOOLS) {
      expect(DEFAULT_ALLOWED_TOOLS as readonly string[]).toContain(tool);
    }
  });

  it('keeps the default grant, the same lists, when the internet is on or unsaid', () => {
    for (const grant of [
      firingToolGrant({ internetEnabled: true }),
      firingToolGrant({}),
      firingToolGrant(),
    ]) {
      expect(grant.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
      expect(grant.disallowedTools).toBe(DEFAULT_DISALLOWED_TOOLS);
    }
  });

  it('moves every web tool from allowed to disallowed when the internet is off', () => {
    const grant = firingToolGrant({ internetEnabled: false });
    for (const tool of WEB_TOOLS) {
      expect(grant.allowedTools).not.toContain(tool);
      expect(grant.disallowedTools).toContain(tool);
    }
    // Everything else in the grant is untouched — the delegation tools stay granted.
    expect(grant.allowedTools).toEqual(
      DEFAULT_ALLOWED_TOOLS.filter((tool) => !(WEB_TOOLS as readonly string[]).includes(tool)),
    );
    expect(grant.disallowedTools).toEqual([...DEFAULT_DISALLOWED_TOOLS, ...WEB_TOOLS]);
    expect(grant.allowedTools.filter((tool) => grant.disallowedTools.includes(tool))).toEqual([]);
  });

  it('denies both tool groups, without overlap, when a SOUL opts out of both', () => {
    const grant = firingToolGrant({ subagentsEnabled: false, internetEnabled: false });
    for (const tool of [...SUBAGENT_TOOLS, ...WEB_TOOLS]) {
      expect(grant.allowedTools).not.toContain(tool);
      expect(grant.disallowedTools).toContain(tool);
    }
    expect(grant.disallowedTools).toEqual([
      ...DEFAULT_DISALLOWED_TOOLS,
      ...SUBAGENT_TOOLS,
      ...WEB_TOOLS,
    ]);
    expect(new Set(grant.disallowedTools).size).toBe(grant.disallowedTools.length);
    expect(grant.allowedTools.filter((tool) => grant.disallowedTools.includes(tool))).toEqual([]);
  });
});

describe('the "Turns: N" SOUL line — a per-project cap under the fleet-wide turn ceiling', () => {
  const SOUL = '# SOUL — docs-site\n\nStack: js\n\n## Operating rules\n- Gate every change.';

  it('reads the cap on the line, plain or as a bullet, any case, stray spaces or a trailing CR', () => {
    expect(soulTurnCap(`${SOUL}\n${TURN_CAP_LINE_PREFIX} 60\n`)).toBe(60);
    expect(soulTurnCap(`${SOUL}\n- Turns: 45`)).toBe(45);
    expect(soulTurnCap(`${SOUL}\n  * TURNS:8  `)).toBe(8);
    expect(soulTurnCap(`turns:   100\r\n${SOUL}`)).toBe(100);
  });

  it('reads no cap without the line, on a mention mid-sentence, or on anything but a positive integer', () => {
    expect(soulTurnCap(SOUL)).toBeNull();
    expect(soulTurnCap('')).toBeNull();
    expect(soulTurnCap(`${SOUL}\n- Keep "Turns: 60" out of here.`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: 0`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: 012`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: -5`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: 6.5`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: 60 turns`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nTurns: off`)).toBeNull();
    // One override never trips the other.
    expect(soulTurnCap(`${SOUL}\n${SUBAGENTS_OPT_OUT_LINE}\n${INTERNET_OPT_OUT_LINE}`)).toBeNull();
    expect(soulOptsOutOfSubagents(`${SOUL}\nTurns: 60`)).toBe(false);
    expect(soulOptsOutOfInternet(`${SOUL}\nTurns: 60`)).toBe(false);
  });

  it('runs a firing at the fleet-wide ceiling when the SOUL names no cap', () => {
    expect(firingMaxTurns(SOUL, 120)).toBe(120);
    expect(firingMaxTurns('', DEFAULT_ENGINE_CONFIG.maxTurns)).toBe(DEFAULT_ENGINE_CONFIG.maxTurns);
  });

  it('tightens the ceiling to the SOUL’s lower cap', () => {
    expect(firingMaxTurns(`${SOUL}\nTurns: 60`, 120)).toBe(60);
    expect(firingMaxTurns(`${SOUL}\n- turns: 1`, 120)).toBe(1);
  });

  it('never loosens it — a cap at or above the ceiling leaves the ceiling in force', () => {
    expect(firingMaxTurns(`${SOUL}\nTurns: 120`, 120)).toBe(120);
    expect(firingMaxTurns(`${SOUL}\nTurns: 500`, 120)).toBe(120);
    expect(firingMaxTurns(`${SOUL}\nTurns: 99999`, 120)).toBe(120);
  });
});

describe('the "Budget: $N" SOUL line — a per-project cap under the fleet-wide per-firing budget', () => {
  const SOUL = '# SOUL — docs-site\n\nStack: js\n\n## Operating rules\n- Gate every change.';

  it('reads the amount on the line, with or without the $, plain or as a bullet, any case, cents allowed', () => {
    expect(soulBudgetCapUsd(`${SOUL}\n${BUDGET_CAP_LINE_PREFIX} $5\n`)).toBe(5);
    expect(soulBudgetCapUsd(`${SOUL}\n- Budget: 2.50`)).toBe(2.5);
    expect(soulBudgetCapUsd(`${SOUL}\n  * BUDGET:$0.75  `)).toBe(0.75);
    expect(soulBudgetCapUsd(`budget:   12\r\n${SOUL}`)).toBe(12);
  });

  it('reads no cap without the line, on a mention mid-sentence, or on anything but a positive amount', () => {
    expect(soulBudgetCapUsd(SOUL)).toBeNull();
    expect(soulBudgetCapUsd('')).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\n- Keep "Budget: $5" out of here.`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: 0`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: $0.00`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: 05`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: -5`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: $5.123`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: 5 USD`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: five`)).toBeNull();
    expect(soulBudgetCapUsd(`${SOUL}\nBudget: off`)).toBeNull();
    // One override never trips the other.
    expect(soulBudgetCapUsd(`${SOUL}\nTurns: 60\n${INTERNET_OPT_OUT_LINE}`)).toBeNull();
    expect(soulTurnCap(`${SOUL}\nBudget: $5`)).toBeNull();
    expect(soulOptsOutOfSubagents(`${SOUL}\nBudget: $5`)).toBe(false);
    expect(soulOptsOutOfInternet(`${SOUL}\nBudget: $5`)).toBe(false);
  });

  it('runs a firing at the fleet-wide budget when the SOUL names no cap', () => {
    expect(firingMaxBudgetUsd(SOUL, 10)).toBe(10);
    expect(firingMaxBudgetUsd('', DEFAULT_ENGINE_CONFIG.maxBudgetUsd)).toBe(
      DEFAULT_ENGINE_CONFIG.maxBudgetUsd,
    );
  });

  it('tightens the budget to the SOUL’s lower cap', () => {
    expect(firingMaxBudgetUsd(`${SOUL}\nBudget: $5`, 10)).toBe(5);
    expect(firingMaxBudgetUsd(`${SOUL}\n- budget: 0.5`, 10)).toBe(0.5);
  });

  it('never loosens it — a cap at or above the fleet-wide budget leaves it in force', () => {
    expect(firingMaxBudgetUsd(`${SOUL}\nBudget: 10`, 10)).toBe(10);
    expect(firingMaxBudgetUsd(`${SOUL}\nBudget: $500`, 10)).toBe(10);
    expect(firingMaxBudgetUsd(`${SOUL}\nBudget: 99999.99`, 10)).toBe(10);
  });
});

describe('DEFAULT_ENGINE_CONFIG', () => {
  it('wires allowedTools/disallowedTools to the exported lists', () => {
    expect(DEFAULT_ENGINE_CONFIG.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
    expect(DEFAULT_ENGINE_CONFIG.disallowedTools).toBe(DEFAULT_DISALLOWED_TOOLS);
  });

  it('keeps the resilience model pair in sync with the top-level model pair', () => {
    // The resilience sub-config duplicates primary/fallback so it can be tested
    // standalone (pure, clock-free) — but a drift here would silently start
    // firings on the wrong model tier.
    expect(DEFAULT_ENGINE_CONFIG.resilience.primaryModel).toBe(DEFAULT_ENGINE_CONFIG.primaryModel);
    expect(DEFAULT_ENGINE_CONFIG.resilience.fallbackModel).toBe(
      DEFAULT_ENGINE_CONFIG.fallbackModel,
    );
  });

  it('defaults effort to xhigh', () => {
    expect(DEFAULT_ENGINE_CONFIG.effort).toBe('xhigh');
  });

  it('sets the reprobe cooldown to 45 minutes, in seconds', () => {
    expect(DEFAULT_ENGINE_CONFIG.resilience.reprobeCooldownSec).toBe(45 * 60);
  });

  it('keeps hibernation backoff bounds sane (base <= max)', () => {
    expect(DEFAULT_ENGINE_CONFIG.resilience.hibernateBaseMin).toBeLessThanOrEqual(
      DEFAULT_ENGINE_CONFIG.resilience.hibernateMaxMin,
    );
  });

  it('keeps the hourly spend cap within the weekly spend cap', () => {
    expect(DEFAULT_ENGINE_CONFIG.hourlyCapUsd).toBeLessThanOrEqual(
      DEFAULT_ENGINE_CONFIG.weeklyCapUsd,
    );
  });

  it('keeps every budget/turn/timing knob positive', () => {
    expect(DEFAULT_ENGINE_CONFIG.maxTurns).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.maxBudgetUsd).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.retroEvery).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.baseSleepMin).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.hourlyCapUsd).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.weeklyCapUsd).toBeGreaterThan(0);
  });

  it('defaults the routing top tier to the same model as the resilience fallback', () => {
    // Same rationale as the resilience sync test above: the router's "escalate
    // to top on any doubt" promise (ENGINE-RESEARCH §7) is only as safe as the
    // model it escalates to — it should be the strongest configured model, not
    // an accidentally-weaker one left to drift out of sync.
    expect(DEFAULT_ENGINE_CONFIG.routing.topModel).toBe(DEFAULT_ENGINE_CONFIG.fallbackModel);
  });

  it('gives every routing tier a distinct, non-empty model string', () => {
    const { localModel, cheapModel, topModel } = DEFAULT_ENGINE_CONFIG.routing;
    for (const model of [localModel, cheapModel, topModel]) {
      expect(model.length).toBeGreaterThan(0);
    }
    expect(new Set([localModel, cheapModel, topModel]).size).toBe(3);
  });

  it('defaults cost semantics v3 fields to fully unconfigured (never a guessed price/scope)', () => {
    expect(DEFAULT_ENGINE_CONFIG.subscriptionPriceUsd).toBeNull();
    expect(DEFAULT_ENGINE_CONFIG.usagePoolDirs).toEqual([]);
  });
});
