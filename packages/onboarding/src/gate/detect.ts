// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { FsSnapshot } from './snapshot.js';
import {
  UNKNOWN_ECOSYSTEM,
  type ConfidenceTier,
  type EcosystemDetector,
  type GateCandidate,
  type GateDetection,
  type GateSpec,
  type Ambiguity,
} from './types.js';
import { jsDetector, pythonDetector, goDetector, rustDetector } from './detectors/index.js';

/** The shipped ecosystem detectors, tried in order (the registry is open — pass
 *  a custom list to extend). */
export const DEFAULT_DETECTORS: readonly EcosystemDetector[] = [
  jsDetector,
  pythonDetector,
  goDetector,
  rustDetector,
];

function tierOf(score: number): ConfidenceTier {
  if (score >= 3) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

/**
 * Detect the verification gate for a repo snapshot. Runs every detector, ranks
 * the matches (most evidence first, ecosystem id as a stable tiebreak), and
 * returns the primary `spec` (drives the engine GatePort) plus all `candidates`
 * for the multi-stack / approval path. Pure — never touches the filesystem.
 */
export function detectGate(
  snap: FsSnapshot,
  detectors: readonly EcosystemDetector[] = DEFAULT_DETECTORS,
): GateDetection {
  const candidates: GateCandidate[] = [];
  for (const detector of detectors) {
    const detection = detector.detect(snap);
    if (detection) {
      candidates.push({
        spec: { ...detection.gate, ecosystem: detector.id },
        score: detection.score,
        tier: tierOf(detection.score),
        evidence: detection.evidence,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.spec.ecosystem.localeCompare(b.spec.ecosystem));

  const primary = candidates[0];
  const spec: GateSpec = primary ? primary.spec : { ecosystem: UNKNOWN_ECOSYSTEM };
  const ambiguity: Ambiguity =
    candidates.length === 0 ? 'none' : candidates.length === 1 ? 'single' : 'multi';

  return { spec, candidates, ambiguity };
}
