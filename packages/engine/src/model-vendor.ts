// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHO MADE THE MODEL (operator, 2026-09-14: "which model wrote it, from
 * which company? and it is important that everything is always tagged
 * correctly").
 *
 * `models.ts` answers "which family is this and should I offer it"; this
 * module answers the provenance question beside it — which organisation
 * publishes the weights behind a model string. Telemetry already records
 * the model id per firing (`metrics.model`), so vendor is the one field
 * standing between that and an honest "who wrote this" table.
 *
 * It follows `models.ts`'s design rule exactly: **it describes, it never
 * restricts.** An unrecognized model string resolves to `unknown` and flies
 * untouched. Guessing wrong about a vendor would be worse than admitting
 * ignorance, so every rule here is a documented naming convention, and
 * anything that does not match one says so.
 *
 * Recognition is by naming convention rather than an exhaustive list, for
 * the same reason `modelFamilyOf` reads a family off an unseen id: a model
 * that ships tomorrow should be attributed correctly today. That is a
 * heuristic, and {@link resolveModelVendor} reports its own confidence so a
 * caller can render "Anthropic" differently from "looks like Anthropic".
 */

/** The organisations whose models the fleet can currently name. `local`
 *  covers a model served from the operator's own machine where the runner,
 *  not the publisher, is what the id tells us. */
export type ModelVendorId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'xai'
  | 'mistral'
  | 'alibaba'
  | 'deepseek'
  | 'local'
  | 'unknown';

export interface ModelVendor {
  readonly id: ModelVendorId;
  /** The organisation's own name, written the way it writes it. */
  readonly name: string;
  /** Where a reader can check the claim. Absent for `unknown` and `local`. */
  readonly url?: string;
}

/** How sure the resolution is — rendered, never hidden. */
export type VendorConfidence =
  /** The id matched a documented naming convention for that vendor. */
  | 'named'
  /** Nothing matched. The model still flies; we simply do not know. */
  | 'unknown';

export interface VendorResolution {
  readonly vendor: ModelVendor;
  readonly confidence: VendorConfidence;
  /** The rule that fired, in words — so a wrong attribution is debuggable
   *  by reading the output rather than the source. */
  readonly because: string;
}

const VENDORS: Readonly<Record<ModelVendorId, ModelVendor>> = {
  anthropic: { id: 'anthropic', name: 'Anthropic', url: 'https://www.anthropic.com' },
  openai: { id: 'openai', name: 'OpenAI', url: 'https://openai.com' },
  google: { id: 'google', name: 'Google', url: 'https://ai.google' },
  meta: { id: 'meta', name: 'Meta', url: 'https://ai.meta.com' },
  xai: { id: 'xai', name: 'xAI', url: 'https://x.ai' },
  mistral: { id: 'mistral', name: 'Mistral AI', url: 'https://mistral.ai' },
  alibaba: { id: 'alibaba', name: 'Alibaba Cloud', url: 'https://qwen.ai' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', url: 'https://www.deepseek.com' },
  local: { id: 'local', name: 'a local model' },
  unknown: { id: 'unknown', name: 'an unnamed model' },
};

/** One recognition rule: a substring that identifies a publisher, and the
 *  sentence explaining why. Order matters — the first match wins, so more
 *  specific markers sit above the families that contain them. */
interface VendorRule {
  readonly match: readonly string[];
  readonly vendor: ModelVendorId;
  readonly because: string;
}

const RULES: readonly VendorRule[] = [
  {
    match: ['claude', 'fable', 'opus', 'sonnet', 'haiku', 'mythos'],
    vendor: 'anthropic',
    because: 'the Claude family names (including the bare aliases the CLI resolves)',
  },
  {
    match: ['gpt-', 'gpt4', 'o1-', 'o3-', 'o4-', 'codex'],
    vendor: 'openai',
    because: 'the GPT/o-series/Codex naming',
  },
  { match: ['gemini', 'gemma', 'palm'], vendor: 'google', because: 'the Gemini/Gemma naming' },
  { match: ['llama', 'code-llama', 'codellama'], vendor: 'meta', because: 'the Llama naming' },
  { match: ['grok'], vendor: 'xai', because: 'the Grok naming' },
  {
    match: ['mistral', 'mixtral', 'codestral', 'devstral'],
    vendor: 'mistral',
    because: 'the Mistral naming',
  },
  { match: ['qwen'], vendor: 'alibaba', because: 'the Qwen naming' },
  { match: ['deepseek'], vendor: 'deepseek', because: 'the DeepSeek naming' },
];

/** Marks a model string as served from the operator's own machine. A local
 *  runner's prefix says who SERVED the model, which is a different fact
 *  from who published it — so it is reported only when nothing above
 *  identified a publisher. */
const LOCAL_MARKERS: readonly string[] = ['ollama/', 'ollama:', 'local/', 'lmstudio/', 'llamacpp/'];

/**
 * Attributes a model string to the organisation that publishes it.
 *
 * Never throws and never rejects. An empty or unrecognized string resolves
 * to `unknown` with a sentence saying so, because a provenance line that
 * guesses is worse than one that admits the gap.
 */
export function resolveModelVendor(model: string): VendorResolution {
  const id = model.trim().toLowerCase();
  if (id === '') {
    return {
      vendor: VENDORS.unknown,
      confidence: 'unknown',
      because: 'no model was recorded for this work',
    };
  }
  // A local runner prefix is stripped first: `ollama/llama3.1` is published
  // by Meta and served locally, and both halves of that are worth keeping.
  const marker = LOCAL_MARKERS.find((m) => id.startsWith(m));
  const bare = marker === undefined ? id : id.slice(marker.length);

  for (const rule of RULES) {
    if (rule.match.some((needle) => bare.includes(needle))) {
      return {
        vendor: VENDORS[rule.vendor],
        confidence: 'named',
        because: `"${model.trim()}" matches ${rule.because}`,
      };
    }
  }
  if (marker !== undefined) {
    return {
      vendor: VENDORS.local,
      confidence: 'unknown',
      because: `"${model.trim()}" is served locally, and its name does not identify a publisher`,
    };
  }
  return {
    vendor: VENDORS.unknown,
    confidence: 'unknown',
    because: `"${model.trim()}" matches no naming convention this build knows`,
  };
}

/** True when the model string names a model served from the operator's own
 *  machine rather than reached over an API. Relevant to provenance because
 *  a local run has no per-token price to report. */
export function isLocallyServed(model: string): boolean {
  const id = model.trim().toLowerCase();
  return LOCAL_MARKERS.some((m) => id.startsWith(m));
}

/** One line naming the model and who made it, for a human to read. Kept
 *  here so every surface that prints provenance prints the same sentence. */
export function modelCredit(model: string): string {
  const trimmed = model.trim();
  if (trimmed === '') return 'Model not recorded';
  const { vendor, confidence } = resolveModelVendor(model);
  if (confidence === 'unknown') return `${trimmed} (publisher not identified)`;
  return `${trimmed} (${vendor.name})`;
}
