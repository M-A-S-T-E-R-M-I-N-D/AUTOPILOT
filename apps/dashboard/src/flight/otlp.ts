// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Env-driven OTLP endpoint config for a real flight (BACKLOG-999
 * ap-msksw1me-0). `packages/engine/src/otlp.ts` carries a ready-to-use
 * mapping + transport since `d92e4ac`/`b46449b`; this is the adoption step
 * that calls it — `apps/dashboard/src/fly.ts` reads this config once per
 * flight and exports each firing's spans through it. Off by default: no
 * `OTEL_EXPORTER_OTLP_*` endpoint env var set, no export attempted, zero
 * behavior change. Follows the OpenTelemetry env var spec's names/precedence
 * so any standard OTel collector setup (a local `otel-collector`, Honeycomb,
 * Grafana Cloud, …) works by just setting the env vars it already documents —
 * no AUTOPILOT-specific config needed. Only HTTP/JSON is supported (the
 * engine's transport posts a JSON body, not protobuf), so
 * `OTEL_EXPORTER_OTLP_PROTOCOL` is intentionally not read.
 */

export interface OtlpFlightConfig {
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Parse the OTel spec's `key1=value1,key2=value2` header list format. Values
 * are URL-decoded per spec (W3C Baggage-style encoding); a value that isn't
 * validly encoded is passed through raw rather than dropped.
 */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    // Stryker disable next-line EqualityOperator: `eq === 0` (delimiter at
    // position 0) is unobservable here — pair.slice(0, 0) is always '', so
    // the `!key` check below already discards that pair on its own,
    // whether this guard reads `< 0` or `<= 0`.
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!key) continue;
    try {
      headers[key] = decodeURIComponent(value);
    } catch {
      headers[key] = value;
    }
  }
  return headers;
}

/**
 * The traces-specific endpoint env var wins outright and is used AS-IS (no
 * path appended, per spec). The generic endpoint env var is a base URL that
 * gets `/v1/traces` appended, unless it's already there.
 */
function resolveTracesEndpoint(env: Readonly<Record<string, string | undefined>>): string | null {
  const tracesSpecific = env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT']?.trim();
  if (tracesSpecific) return tracesSpecific;
  const base = env['OTEL_EXPORTER_OTLP_ENDPOINT']?.trim();
  if (!base) return null;
  const trimmed = base.replace(/\/+$/, '');
  return trimmed.endsWith('/v1/traces') ? trimmed : `${trimmed}/v1/traces`;
}

/**
 * Build the flight's OTLP config from the process environment, or `null` when
 * no endpoint is configured (the off-by-default case). Traces-specific
 * headers are layered over the generic ones, matching the endpoint
 * precedence above.
 */
export function otlpConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): OtlpFlightConfig | null {
  const endpoint = resolveTracesEndpoint(env);
  if (!endpoint) return null;
  const headers = {
    ...parseOtlpHeaders(env['OTEL_EXPORTER_OTLP_HEADERS']),
    ...parseOtlpHeaders(env['OTEL_EXPORTER_OTLP_TRACES_HEADERS']),
  };
  return { endpoint, headers };
}
