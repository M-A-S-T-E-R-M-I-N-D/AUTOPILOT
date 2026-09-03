// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  mineFleetWisdom,
  composeSoulWithFleetWisdom,
  FLEET_WISDOM_GENERALIZATION_THRESHOLD,
  FLEET_WISDOM_PROMPT_HEADER,
  LEARNING_KINDS,
  proposedWisdomKindLabel,
  type FleetWisdomMiningInput,
  type ProjectSoulLike,
} from '../../src/flight/fleet-wisdom-mining.js';
import {
  CHECKPOINT_SOUL_AMENDMENT_MARKER,
  NOOP_SOUL_AMENDMENT_MARKER,
  NOOP_STREAK_THRESHOLD,
  mineNoopSoulAmendment,
} from '../../src/flight/soul-mining.js';

const SOUL_WITH_NOTE = `# SOUL\n\n${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- noted.\n`;
const SOUL_WITHOUT_NOTE = '# SOUL\n\n## Gate\n- test: pnpm run test\n';

function projectsConfirming(count: number, prefix = 'proj'): ProjectSoulLike[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `${prefix}-${i}`,
    soul: SOUL_WITH_NOTE,
  }));
}

function inputWith(overrides: Partial<FleetWisdomMiningInput>): FleetWisdomMiningInput {
  return {
    projects: [],
    fleetWisdom: '',
    fleetWisdomProposed: null,
    ...overrides,
  };
}

describe('LEARNING_KINDS registry shape', () => {
  it('registers at least two learning kinds (epic 0014 acceptance: two live end-to-end)', () => {
    expect(LEARNING_KINDS.length).toBeGreaterThanOrEqual(2);
    const markers = LEARNING_KINDS.map((kind) => kind.marker);
    expect(markers).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(markers).toContain(NOOP_SOUL_AMENDMENT_MARKER);
  });

  it('gives every kind a stable "## Learned:"-prefixed marker, unique across the registry', () => {
    const markers = LEARNING_KINDS.map((kind) => kind.marker);
    for (const marker of markers) {
      expect(marker.startsWith('## Learned:')).toBe(true);
    }
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('renders every template with its own marker and the confirming count, and no leftover placeholders', () => {
    for (const kind of LEARNING_KINDS) {
      const rendered = kind.fleetTemplate(7);
      expect(rendered).toContain(kind.marker);
      expect(rendered).toContain('7');
      expect(rendered).not.toMatch(/\{\w+\}|\$\{/);
    }
  });
});

describe('mineFleetWisdom', () => {
  it('proposes fleet wisdom once the threshold of distinct projects confirms the same learning', () => {
    const proposal = mineFleetWisdom(
      inputWith({ projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD) }),
    );
    expect(proposal).not.toBeNull();
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(`across ${FLEET_WISDOM_GENERALIZATION_THRESHOLD} projects`);
  });

  it('returns null when fewer than the threshold of distinct projects confirm it', () => {
    const proposal = mineFleetWisdom(
      inputWith({ projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD - 1) }),
    );
    expect(proposal).toBeNull();
  });

  it('counts distinct projects, not raw entries (dedupes repeated slugs)', () => {
    const dup = projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD - 1);
    const repeated = [...dup, dup[0] as ProjectSoulLike];
    expect(mineFleetWisdom(inputWith({ projects: repeated }))).toBeNull();
  });

  it('ignores projects that never confirmed the learning', () => {
    const confirmed = projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD);
    const unconfirmed = [{ slug: 'quiet-project', soul: SOUL_WITHOUT_NOTE }];
    const proposal = mineFleetWisdom(inputWith({ projects: [...confirmed, ...unconfirmed] }));
    expect(proposal).not.toBeNull();
    expect(proposal).not.toContain('quiet-project');
  });

  it('returns null when a fleet-level proposal is already pending', () => {
    const proposal = mineFleetWisdom(
      inputWith({
        projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD),
        fleetWisdomProposed: 'some other pending diff',
      }),
    );
    expect(proposal).toBeNull();
  });

  it('returns null when the fleet layer already carries this learning', () => {
    const proposal = mineFleetWisdom(
      inputWith({
        projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD),
        fleetWisdom: SOUL_WITH_NOTE,
      }),
    );
    expect(proposal).toBeNull();
  });

  it('never leaks a confirming project slug into the proposed text (confidentiality boundary)', () => {
    const proposal = mineFleetWisdom(
      inputWith({
        projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD, 'acme-internal'),
      }),
    );
    expect(proposal).not.toBeNull();
    expect(proposal).not.toContain('acme-internal');
  });

  it('preserves existing fleet-wisdom text when appending the new note', () => {
    const proposal = mineFleetWisdom(
      inputWith({
        projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD),
        fleetWisdom: '# FLEET WISDOM\n\n## Existing note\n- kept.\n',
      }),
    );
    expect(proposal).toContain('## Existing note');
    expect(proposal).toContain('- kept.');
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });

  it('does not produce a leading blank line when starting from empty fleet wisdom', () => {
    const proposal = mineFleetWisdom(
      inputWith({ projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD) }),
    );
    expect(proposal?.startsWith('\n')).toBe(false);
    expect(proposal?.startsWith(CHECKPOINT_SOUL_AMENDMENT_MARKER)).toBe(true);
  });

  it('returns null for an empty fleet', () => {
    expect(mineFleetWisdom(inputWith({ projects: [] }))).toBeNull();
  });
});

describe('noop-streak learning kind graduation (epic 0014 slice 3)', () => {
  /** Runs the REAL project-level miner on a no-commit streak, so the fleet
   *  input is exactly what production souls look like after mining. */
  function projectMinedNoopSoul(slug: string): ProjectSoulLike {
    const mined = mineNoopSoulAmendment({
      soul: SOUL_WITHOUT_NOTE,
      soulProposed: null,
      recentGateResults: Array.from({ length: NOOP_STREAK_THRESHOLD }, () => 'no-commit'),
    });
    expect(mined).not.toBeNull();
    return { slug, soul: mined as string };
  }

  it('graduates end-to-end: project miner output across three fake projects triggers the fleet proposal', () => {
    const projects = ['alpha', 'beta', 'gamma'].map(projectMinedNoopSoul);
    const proposal = mineFleetWisdom(inputWith({ projects }));
    expect(proposal).not.toBeNull();
    expect(proposal).toContain(NOOP_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(`across ${FLEET_WISDOM_GENERALIZATION_THRESHOLD} projects`);
  });

  it('returns null when fewer than the threshold of projects carry the noop note', () => {
    const projects = ['alpha', 'beta'].map(projectMinedNoopSoul);
    expect(mineFleetWisdom(inputWith({ projects }))).toBeNull();
  });

  it('never leaks a confirming project slug into the noop proposal (confidentiality boundary)', () => {
    const projects = ['acme-internal-a', 'acme-internal-b', 'acme-internal-c'].map(
      projectMinedNoopSoul,
    );
    const proposal = mineFleetWisdom(inputWith({ projects }));
    expect(proposal).not.toBeNull();
    expect(proposal).not.toContain('acme-internal');
  });

  it('proposes the checkpoint kind first when both kinds qualify (registry order = priority)', () => {
    const soulWithBoth = `${SOUL_WITH_NOTE}\n${NOOP_SOUL_AMENDMENT_MARKER}\n- noop noted.\n`;
    const projects = ['alpha', 'beta', 'gamma'].map((slug) => ({ slug, soul: soulWithBoth }));
    const proposal = mineFleetWisdom(inputWith({ projects }));
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(proposal).not.toContain(NOOP_SOUL_AMENDMENT_MARKER);
  });

  it('graduates the noop kind on the sweep after the checkpoint kind reaches the fleet layer', () => {
    const soulWithBoth = `${SOUL_WITH_NOTE}\n${NOOP_SOUL_AMENDMENT_MARKER}\n- noop noted.\n`;
    const projects = ['alpha', 'beta', 'gamma'].map((slug) => ({ slug, soul: soulWithBoth }));
    const proposal = mineFleetWisdom(inputWith({ projects, fleetWisdom: SOUL_WITH_NOTE }));
    expect(proposal).not.toBeNull();
    expect(proposal).toContain(NOOP_SOUL_AMENDMENT_MARKER);
    expect(proposal).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });

  it('dedups per kind on compose: strips only the noop fleet copy when the SOUL carries the noop note', () => {
    const checkpointFleetNote = `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n- Confirmed independently across 3 projects.\n`;
    const noopFleetNote = `${NOOP_SOUL_AMENDMENT_MARKER}\n- Confirmed independently across 3 projects.\n`;
    const soulWithNoopNote = `# SOUL\n\n${NOOP_SOUL_AMENDMENT_MARKER}\n- noop noted.\n`;
    const composed = composeSoulWithFleetWisdom(
      soulWithNoopNote,
      `${checkpointFleetNote}\n${noopFleetNote}`,
    );
    expect(composed.split(NOOP_SOUL_AMENDMENT_MARKER).length - 1).toBe(1);
    expect(composed).toContain('- noop noted.');
    expect(composed).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(composed).toContain(FLEET_WISDOM_PROMPT_HEADER);
  });
});

const FLEET_NOTE =
  `${CHECKPOINT_SOUL_AMENDMENT_MARKER}\n` +
  `- Confirmed independently across 3 projects: size the next unit smaller.\n`;

describe('composeSoulWithFleetWisdom', () => {
  it('returns the soul unchanged when the fleet layer is empty', () => {
    expect(composeSoulWithFleetWisdom(SOUL_WITHOUT_NOTE, '')).toBe(SOUL_WITHOUT_NOTE);
  });

  it('returns the soul unchanged when the fleet layer is only whitespace', () => {
    expect(composeSoulWithFleetWisdom(SOUL_WITHOUT_NOTE, '  \n\n')).toBe(SOUL_WITHOUT_NOTE);
  });

  it('layers ratified fleet wisdom under a labeled shared section after the soul', () => {
    const composed = composeSoulWithFleetWisdom(SOUL_WITHOUT_NOTE, FLEET_NOTE);
    expect(composed).toContain(FLEET_WISDOM_PROMPT_HEADER);
    expect(composed.indexOf('# SOUL')).toBeLessThan(composed.indexOf(FLEET_WISDOM_PROMPT_HEADER));
    expect(composed).toContain('- Confirmed independently across 3 projects');
  });

  it('renders the shared layer alone when the project has no SOUL text yet', () => {
    const composed = composeSoulWithFleetWisdom('', FLEET_NOTE);
    expect(composed.startsWith(FLEET_WISDOM_PROMPT_HEADER)).toBe(true);
    expect(composed).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
  });

  it('drops the fleet copy of a note the SOUL already carries (SOUL is the top layer)', () => {
    const composed = composeSoulWithFleetWisdom(SOUL_WITH_NOTE, FLEET_NOTE);
    const markerCount = composed.split(CHECKPOINT_SOUL_AMENDMENT_MARKER).length - 1;
    expect(markerCount).toBe(1);
    expect(composed).toContain('- noted.');
    expect(composed).not.toContain('Confirmed independently');
  });

  it('returns the soul unchanged when deduping leaves the fleet layer empty', () => {
    expect(composeSoulWithFleetWisdom(SOUL_WITH_NOTE, FLEET_NOTE)).toBe(SOUL_WITH_NOTE);
  });

  it('keeps other fleet sections while dropping only the duplicated note', () => {
    const wisdom = `## Existing note\n- kept.\n\n${FLEET_NOTE}`;
    const composed = composeSoulWithFleetWisdom(SOUL_WITH_NOTE, wisdom);
    expect(composed).toContain(FLEET_WISDOM_PROMPT_HEADER);
    expect(composed).toContain('## Existing note');
    expect(composed).toContain('- kept.');
    expect(composed).not.toContain('Confirmed independently');
    expect(composed.split(CHECKPOINT_SOUL_AMENDMENT_MARKER).length - 1).toBe(1);
  });
});

describe('proposedWisdomKindLabel (epic 0014 slice 4a)', () => {
  const NOOP_SOUL = `# SOUL\n\n${NOOP_SOUL_AMENDMENT_MARKER}\n- noted.\n`;

  it('names the checkpoint kind for a mined checkpoint proposal', () => {
    const proposed = mineFleetWisdom(
      inputWith({ projects: projectsConfirming(FLEET_WISDOM_GENERALIZATION_THRESHOLD) }),
    );
    expect(proposed).not.toBeNull();
    expect(proposedWisdomKindLabel('', proposed!)).toBe('recurring checkpoint pattern');
  });

  it('names the noop kind for a mined noop proposal', () => {
    const projects = Array.from({ length: FLEET_WISDOM_GENERALIZATION_THRESHOLD }, (_, i) => ({
      slug: `noop-${i}`,
      soul: NOOP_SOUL,
    }));
    const proposed = mineFleetWisdom(inputWith({ projects }));
    expect(proposed).not.toBeNull();
    expect(proposedWisdomKindLabel('', proposed!)).toBe('recurring noop pattern');
  });

  it('names the NEWLY-ADDED kind when the fleet layer already carries another', () => {
    const fleetWisdom = LEARNING_KINDS[0]!.fleetTemplate(3);
    const projects = Array.from({ length: FLEET_WISDOM_GENERALIZATION_THRESHOLD }, (_, i) => ({
      slug: `noop-${i}`,
      soul: NOOP_SOUL,
    }));
    const proposed = mineFleetWisdom(inputWith({ projects, fleetWisdom }));
    expect(proposed).not.toBeNull();
    // The proposal text carries BOTH markers (existing + appended) — the
    // label must be the appended one, not the first marker found.
    expect(proposed!).toContain(CHECKPOINT_SOUL_AMENDMENT_MARKER);
    expect(proposedWisdomKindLabel(fleetWisdom, proposed!)).toBe('recurring noop pattern');
  });

  it('returns null for a proposal carrying no registered marker (hand-authored text)', () => {
    expect(proposedWisdomKindLabel('', 'be kinder to the gate')).toBeNull();
  });

  it('derives every label from the marker itself — a new registry entry names itself', () => {
    for (const kind of LEARNING_KINDS) {
      const label = proposedWisdomKindLabel('', kind.marker);
      expect(label).toBe(kind.marker.replace(/^## Learned:\s*/, ''));
      expect(label).not.toContain('## Learned:');
      expect(label!.length).toBeGreaterThan(0);
    }
  });
});
