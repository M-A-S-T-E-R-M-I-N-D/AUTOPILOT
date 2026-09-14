// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PROVENANCE ON A PUBLIC ARTIFACT (operator, 2026-09-14). The rules here are
 * the ones a well-meaning future change would break: that the review state
 * always travels, that a target repo's own policy wins over ours, that an
 * unread policy produces LESS output rather than more, and that no profile
 * can ever put cost, a model co-author, or a sign-off on someone else's
 * repository.
 */

import { describe, it, expect } from 'vitest';
import {
  PROVENANCE_MARKER,
  PROVENANCE_SCHEMA_VERSION,
  profileFromPolicyText,
  provenanceBlock,
  provenanceFooter,
  provenanceLine,
  provenanceTrailer,
  type ProvenanceFacts,
  type ProvenanceProfile,
} from '../src/provenance.js';

const PROFILES: readonly ProvenanceProfile[] = [
  'default',
  'kernel',
  'prose-only',
  'minimal',
  'off',
];

const FACTS: ProvenanceFacts = {
  toolVersion: '0.49.0',
  toolUrl: 'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT',
  operatorHandle: 'someone',
  review: 'human-reviewed',
  models: [{ vendor: 'Anthropic', id: 'claude-sonnet-5', firings: 3 }],
  promptVersion: 'firing-v15',
  generatedAt: '2026-09-14T18:22:04Z',
};

const parseBlock = (text: string): Record<string, unknown> => {
  const match = /<!-- autopilot-provenance\n([\s\S]*?)\n-->/.exec(text);
  if (!match) throw new Error('no provenance block in output');
  return JSON.parse(match[1] as string) as Record<string, unknown>;
};

describe('the visible line', () => {
  it('always names the tool, the version and the human it acts for', () => {
    const line = provenanceLine(FACTS);
    expect(line).toContain('AUTOPILOT');
    expect(line).toContain('v0.49.0');
    expect(line).toContain('@someone');
  });

  it('states the review status in words, because that is the clause with legal weight', () => {
    // EU AI Act 50(4) exempts text a human reviewed and took editorial
    // responsibility for; Anthropic's usage policy requires the review
    // independently. So the line has to say which case this is.
    expect(provenanceLine(FACTS)).toContain('human-reviewed before posting');
    expect(provenanceLine({ ...FACTS, review: 'unreviewed' })).toContain('without human review');
    expect(provenanceLine({ ...FACTS, review: 'human-authored' })).toContain('Written by a human');
  });
});

describe('the machine-readable block', () => {
  it('carries a version, the agent marker and the review state', () => {
    const payload = parseBlock(provenanceBlock(FACTS, 'default'));
    expect(payload['v']).toBe(PROVENANCE_SCHEMA_VERSION);
    expect(payload['agent']).toBe(true);
    expect(payload['review']).toBe('human-reviewed');
    expect(payload['operator']).toBe('someone');
  });

  it('is an HTML comment — present over the API, invisible to a reader', () => {
    const block = provenanceBlock(FACTS, 'default');
    expect(block.startsWith(`<!-- ${PROVENANCE_MARKER}`)).toBe(true);
    expect(block.endsWith('-->')).toBe(true);
  });

  it('lists every model that contributed, so two models on one artifact both appear', () => {
    const payload = parseBlock(
      provenanceBlock(
        {
          ...FACTS,
          models: [
            { vendor: 'Anthropic', id: 'claude-sonnet-5', firings: 2 },
            { vendor: 'OpenAI', id: 'gpt-6', firings: 1 },
          ],
        },
        'default',
      ),
    );
    expect(payload['models']).toHaveLength(2);
  });

  it('omits the models entirely under the kernel profile', () => {
    // The Linux kernel removed the model name from its own Assisted-by tag in
    // August 2026: it "provides free advertising to proprietary software
    // companies while adding little or no useful information". Their repo,
    // their rule.
    expect(parseBlock(provenanceBlock(FACTS, 'kernel'))['models']).toBeUndefined();
    expect(parseBlock(provenanceBlock(FACTS, 'kernel'))['agent']).toBe(true);
  });
});

describe('what never reaches someone else’s repository', () => {
  it('never publishes a cost or a token count, under any profile', () => {
    // The figure we hold is API list price, mostly cache reads, self-reported
    // by the agent it describes. A maintainer reads "$2.40" as what their
    // project cost someone, which is not what it means. The cross-pilot table
    // lives on AUTOPILOT's own dashboard, where the caveats travel with it.
    for (const profile of PROFILES) {
      const footer = provenanceFooter(FACTS, profile).toLowerCase();
      for (const forbidden of ['cost', 'usd', '$', 'token', 'cache']) {
        expect(footer, `${profile} leaked ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('never emits a Signed-off-by or a model Co-authored-by', () => {
    // Only a human can certify the DCO — the kernel's merged policy says so
    // in as many words. And several major projects ban an AI co-author
    // trailer outright; GitHub matches that email to a real account, so it
    // either dangles or misattributes.
    for (const profile of PROFILES) {
      const trailer = provenanceTrailer(FACTS, profile) ?? '';
      expect(trailer.toLowerCase()).not.toContain('signed-off-by');
      expect(trailer.toLowerCase()).not.toContain('co-authored-by');
      expect(provenanceFooter(FACTS, profile).toLowerCase()).not.toContain('co-authored-by');
    }
  });

  it('emits no commit trailer at all where the target forbids one', () => {
    expect(provenanceTrailer(FACTS, 'prose-only')).toBeUndefined();
    expect(provenanceTrailer(FACTS, 'off')).toBeUndefined();
    expect(provenanceTrailer(FACTS, 'kernel')).toBe('Assisted-by: LLM');
    expect(provenanceTrailer(FACTS, 'default')).toContain('Assisted-by: AUTOPILOT v0.49.0');
  });

  it('keeps the identity line even when credit is switched off', () => {
    // Saying what you are and who you act for is the identity law, not an
    // attribution preference — an operator may suppress the credit half and
    // still owes the disclosure.
    for (const profile of ['minimal', 'off'] as const) {
      const footer = provenanceFooter(FACTS, profile);
      expect(footer).toContain('@someone');
      expect(footer).not.toContain(PROVENANCE_MARKER);
    }
  });
});

describe('reading the target repository’s own policy', () => {
  it('honours a project that forbids the trailer', () => {
    for (const text of [
      'Do not add the assisted-by, co-developed or similar commit trailer.',
      'Please disclose in the PR. No LLM bots in `Co-authored-by:`s.',
    ]) {
      expect(profileFromPolicyText(text)).toBe('prose-only');
    }
  });

  it('honours a project that wants the tag without the model name', () => {
    expect(
      profileFromPolicyText('Every patch must carry Assisted-by: LLM when a model helped.'),
    ).toBe('kernel');
  });

  it('recognises the permissive convention', () => {
    expect(profileFromPolicyText('Add an Assisted-by: <assistant> line if you used one.')).toBe(
      'default',
    );
    expect(profileFromPolicyText('We recommend a Generated-by: trailer.')).toBe('default');
  });

  it('fails toward LESS output when the policy is unread or unrecognized', () => {
    // Emitting more than a project allows is the expensive mistake; emitting
    // less is merely quiet. So silence maps to `minimal`, never `default`.
    for (const text of [undefined, '', '   ', 'Please write tests and be kind.']) {
      expect(profileFromPolicyText(text)).toBe('minimal');
    }
  });

  it('puts the forbid rule ahead of the recognise rule, since a policy can mention both', () => {
    const mixed =
      'Some projects use Assisted-by:. We do not. Do not add the assisted-by commit trailer here.';
    expect(profileFromPolicyText(mixed)).toBe('prose-only');
  });
});
