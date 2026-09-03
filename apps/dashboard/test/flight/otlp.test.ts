// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { parseOtlpHeaders, otlpConfigFromEnv } from '../../src/flight/otlp.js';

describe('parseOtlpHeaders', () => {
  it('returns an empty object when unset', () => {
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });

  it('parses a single key=value pair', () => {
    expect(parseOtlpHeaders('api-key=abc123')).toEqual({ 'api-key': 'abc123' });
  });

  it('parses multiple comma-separated pairs', () => {
    expect(parseOtlpHeaders('a=1,b=2')).toEqual({ a: '1', b: '2' });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseOtlpHeaders(' a = 1 , b = 2 ')).toEqual({ a: '1', b: '2' });
  });

  it('URL-decodes values per the OTel Baggage-style spec', () => {
    expect(parseOtlpHeaders('api-key=abc%2C123')).toEqual({ 'api-key': 'abc,123' });
  });

  it('passes an invalidly-encoded value through raw instead of throwing', () => {
    expect(parseOtlpHeaders('a=100%')).toEqual({ a: '100%' });
  });

  it('skips a pair with no "=" or an empty key', () => {
    expect(parseOtlpHeaders('malformed,=novalue,a=1')).toEqual({ a: '1' });
  });

  it('skips a pair whose key is whitespace-only', () => {
    expect(parseOtlpHeaders(' =novalue,a=1')).toEqual({ a: '1' });
  });
});

describe('otlpConfigFromEnv', () => {
  it('returns null when no endpoint env var is set (off by default)', () => {
    expect(otlpConfigFromEnv({})).toBeNull();
  });

  it('uses the traces-specific endpoint as-is when set', () => {
    expect(
      otlpConfigFromEnv({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector.example/custom/path',
      }),
    ).toEqual({ endpoint: 'https://collector.example/custom/path', headers: {} });
  });

  it('trims surrounding whitespace off the traces-specific endpoint', () => {
    expect(
      otlpConfigFromEnv({
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '  https://collector.example/custom/path  ',
      }),
    ).toEqual({ endpoint: 'https://collector.example/custom/path', headers: {} });
  });

  it('appends /v1/traces to the generic base endpoint', () => {
    expect(otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' })).toEqual({
      endpoint: 'http://localhost:4318/v1/traces',
      headers: {},
    });
  });

  it('trims surrounding whitespace off the generic base endpoint', () => {
    expect(otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: '  http://localhost:4318  ' })).toEqual(
      { endpoint: 'http://localhost:4318/v1/traces', headers: {} },
    );
  });

  it('does not double-append /v1/traces when the base already has it', () => {
    expect(
      otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces/' }),
    ).toEqual({ endpoint: 'http://localhost:4318/v1/traces', headers: {} });
  });

  it('strips every trailing slash off the base, not just one', () => {
    expect(otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318//' })).toEqual({
      endpoint: 'http://localhost:4318/v1/traces',
      headers: {},
    });
  });

  it('prefers the traces-specific endpoint over the generic base', () => {
    expect(
      otlpConfigFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector.example/v1/traces',
      }),
    ).toEqual({ endpoint: 'https://collector.example/v1/traces', headers: {} });
  });

  it('layers generic and traces-specific headers, traces-specific winning', () => {
    expect(
      otlpConfigFromEnv({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        OTEL_EXPORTER_OTLP_HEADERS: 'api-key=generic,shared=generic',
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'shared=traces',
      }),
    ).toEqual({
      endpoint: 'http://localhost:4318/v1/traces',
      headers: { 'api-key': 'generic', shared: 'traces' },
    });
  });
});
