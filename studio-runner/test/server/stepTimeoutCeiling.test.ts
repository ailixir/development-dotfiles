/**
 * STUDIO-OBS-015 G (aria-g-ruling01): the runner's per-step ceiling is the contract maximum.
 *
 * Observed jobs bind `configuration.timeoutSeconds` into `configurationHash`, so the runner refuses
 * a job above its ceiling rather than clamping it. A ceiling below the authoring maximum would make
 * contract-valid published tests unrunnable, so the loader refuses one at startup. The expected
 * value is read from the runner's own schema bundle, not written here a second time.
 */
import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from '../../src/server/config.js';
import schemasJson from '../../src/validator/observedSchemas.json' with { type: 'json' };

const required = {
  STUDIO_RUNNER_SERVICE_IDENTITY: 'service',
  STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback',
  STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test',
} as const;

interface TimeoutProperty {
  readonly maximum: number;
}
interface SchemaWithDefinitions {
  readonly definitions: Readonly<Record<string, { readonly properties: Readonly<Record<string, TimeoutProperty>> }>>;
}
const schemas = schemasJson as unknown as Readonly<Record<string, SchemaWithDefinitions>>;

function timeoutMaximumSeconds(schema: string, definition: string): number {
  const maximum = schemas[schema]?.definitions[definition]?.properties.timeoutSeconds?.maximum;
  if (typeof maximum !== 'number') throw new Error(`${schema}.${definition}.timeoutSeconds has no maximum`);
  return maximum;
}

function problemsOf(action: () => unknown): readonly string[] {
  try {
    action();
  } catch (error) {
    if (error instanceof ConfigurationError) return error.problems;
    throw error;
  }
  throw new Error('expected a ConfigurationError');
}

describe('STUDIO-OBS-015 G — the per-step ceiling equals the contract maximum', () => {
  it('(a) defaults maxStepTimeoutMs to 120 000', () => {
    expect(loadConfig(required).maxStepTimeoutMs).toBe(120_000);
  });

  it.each([
    ['replay-profile', 'Configuration'],
    ['revision', 'TestConfig'],
  ])('(b) equals %s.%s timeoutSeconds.maximum × 1000 from the runner schema bundle', (schema, definition) => {
    expect(loadConfig(required).maxStepTimeoutMs).toBe(timeoutMaximumSeconds(schema, definition) * 1000);
  });

  it('(c) refuses 119999 as a configured ceiling, fail closed', () => {
    const env = { ...required, STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: '119999' };
    expect(() => loadConfig(env)).toThrow(ConfigurationError);
    expect(problemsOf(() => loadConfig(env))).toContain(
      'STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS must be >= 120000; got 119999.',
    );
  });

  it('(d) accepts 120000 as a configured ceiling', () => {
    expect(loadConfig({ ...required, STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: '120000' }).maxStepTimeoutMs).toBe(120_000);
  });
});
