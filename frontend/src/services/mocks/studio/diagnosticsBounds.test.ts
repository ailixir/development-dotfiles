import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DIAGNOSTICS_CAPS, TRUNCATION_MARKER, clampLikeBounder, overCap } from './diagnosticsBounds';

/**
 * Story 10.10 AC-7 — the caps and the marker are pinned to the server's, not typed.
 *
 * ADR-002 §16.5 deliberately does not freeze the caps in the contract as `maxLength`, so they
 * cannot be read from `openapi.yaml`. They are read from the two places that do declare them:
 * the deployed defaults in `application.yml` and `DiagnosticsBounder`'s own marker constant. A
 * fixture generated from a stale cap would carry a marker in the wrong place and would prove
 * nothing about the renderer surviving a real clamp.
 */

const BACKEND = path.resolve(__dirname, '../../../../../backend/src/main/java/com/citi/put/checks/studio/compile');
const CONFIG = path.resolve(__dirname, '../../../../../backend/src/main/resources/application.yml');

function configuredCap(key: string): number {
  const yml = fs.readFileSync(CONFIG, 'utf8');
  const match = yml.match(new RegExp(`\\$\\{${key}:(\\d+)\\}`));
  expect(match, `${key} is no longer declared where this test reads it`).not.toBeNull();
  return Number(match![1]);
}

describe('the diagnostics caps and marker match the server that produces them', () => {
  it('the marker is the one DiagnosticsBounder appends', () => {
    const java = fs.readFileSync(path.join(BACKEND, 'DiagnosticsBounder.java'), 'utf8');
    const match = java.match(/TRUNCATION_MARKER\s*=\s*"([^"]+)"/);
    expect(match, 'DiagnosticsBounder no longer declares its marker where this test reads it')
      .not.toBeNull();
    expect(TRUNCATION_MARKER).toBe(match![1]);
  });

  it('the caps are the deployed defaults', () => {
    expect(DIAGNOSTICS_CAPS.maxPerStep).toBe(configuredCap('STUDIO_COMPILE_MAX_DIAGNOSTICS_PER_STEP'));
    expect(DIAGNOSTICS_CAPS.maxMessageChars).toBe(configuredCap('STUDIO_COMPILE_MAX_DIAGNOSTIC_MESSAGE'));
    expect(DIAGNOSTICS_CAPS.maxExcerptChars).toBe(configuredCap('STUDIO_COMPILE_MAX_DIAGNOSTIC_EXCERPT'));
    expect(DIAGNOSTICS_CAPS.maxTotalBytes).toBe(configuredCap('STUDIO_COMPILE_MAX_DIAGNOSTICS_BYTES'));
  });

  it('the clamp is the bounder\'s arithmetic: exactly one cap long, ending in the marker', () => {
    const source = overCap('abcdefghij ', DIAGNOSTICS_CAPS.maxMessageChars);
    expect(source.length).toBeGreaterThan(DIAGNOSTICS_CAPS.maxMessageChars);

    const clamped = clampLikeBounder(source, DIAGNOSTICS_CAPS.maxMessageChars);
    expect(clamped.length).toBe(DIAGNOSTICS_CAPS.maxMessageChars);
    expect(clamped.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(clamped.slice(0, DIAGNOSTICS_CAPS.maxMessageChars - TRUNCATION_MARKER.length)).toBe(
      source.slice(0, DIAGNOSTICS_CAPS.maxMessageChars - TRUNCATION_MARKER.length),
    );
  });

  it('leaves a string within the cap untouched, marker and all', () => {
    expect(clampLikeBounder('short', DIAGNOSTICS_CAPS.maxMessageChars)).toBe('short');
    expect(clampLikeBounder('short', DIAGNOSTICS_CAPS.maxMessageChars)).not.toContain(
      TRUNCATION_MARKER,
    );
  });
});
