/**
 * AC-17 — the real runner error-code set (ADR-002 open item **O-5**).
 *
 * Two properties, both asserted rather than asserted-by-inspection:
 *
 * **(a)** the set is disjoint from the API's `ExecutionErrorCode` **except for `TIMEOUT` and
 * `CANCELLED`**. Architecture §5.4 assigns every other value there to the dispatcher or a reaper;
 * §8.2 fixes the parent-enforced total timeout, and ADR-002 §29 (Studio v1 WP4) the run stopped by
 * `DELETE /v1/runs/{id}` — the two conditions both sides observe.
 *
 * The list is **read out of the contract**, never copied. Story 10.7 adds `AUTHORIZATION_REVOKED`
 * and `REFERENCE_UNAVAILABLE` in this same wave, so a frozen list of "the five this component
 * must never produce" would have been stale before the wave closed — and it would have been stale
 * *silently*, which is the failure mode that matters.
 *
 * **(b)** every code the runner can produce is in the set, enforced by an exhaustive switch over
 * the run's failure kinds, so a new kind fails the type-check rather than inventing a string.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RUNNER_ERROR_CODES,
  RUNNER_ERROR_CODE_VALUES,
  RUN_FAILURE_KINDS,
  errorCodeFor,
  resultFor,
} from '../../src/run/errors.js';
import type { RunFailureKind } from '../../src/run/errors.js';
import { RUNTIME_INCOMPATIBLE } from '../../src/compat/index.js';
import { packageRoot } from '../helpers/corpus.js';
import { parseYaml } from '../helpers/openapi.js';

const CONTRACT_PATH = join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml');

/** The API's enumeration, read from the document rather than restated here. */
function executionErrorCodes(): string[] {
  const document = parseYaml(readFileSync(CONTRACT_PATH, 'utf8')) as Record<string, unknown>;
  const components = document.components as Record<string, unknown> | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const schema = schemas?.ExecutionErrorCode as { enum?: unknown[] } | undefined;
  const values = schema?.enum ?? [];
  return values.filter((value): value is string => typeof value === 'string');
}

describe('AC-17(a) — disjoint from the API enumeration, except TIMEOUT and CANCELLED', () => {
  it('finds the contract, so this cannot pass vacuously', () => {
    expect(existsSync(CONTRACT_PATH)).toBe(true);
    // If the enumeration were missing or unreadable, an empty list would make the intersection
    // empty and the assertion below would pass for the wrong reason.
    expect(executionErrorCodes().length).toBeGreaterThan(3);
  });

  it('intersects the API enumeration in exactly {CANCELLED, TIMEOUT}', () => {
    const api = new Set(executionErrorCodes());
    const overlap = RUNNER_ERROR_CODE_VALUES.filter((code) => api.has(code)).sort();
    expect(
      overlap,
      `these runner codes collide with reaper-assigned ExecutionErrorCode values: ${overlap.join(', ')}`,
    ).toEqual(['CANCELLED', 'TIMEOUT']);
  });

  it('does not reuse START_TIMEOUT for the runner’s own start-deadline refusal', () => {
    // A refusal to launch and a reaper noticing no start ever arrived are different observations
    // made by different components; sharing a code would merge them in every dashboard that
    // groups by it.
    expect(RUNNER_ERROR_CODES.START_DEADLINE_EXCEEDED).not.toBe('START_TIMEOUT');
    expect(executionErrorCodes()).toContain('START_TIMEOUT');
  });

  it('reserves TIMEOUT without emitting it: enforcement is story 10.13', () => {
    expect(errorCodeFor('total-timeout')).toBe('TIMEOUT');
    // Nothing under `src/` maps a condition it can observe today onto it. The only producer is
    // the parent-enforced total-runtime deadline, which this story passes through and does not
    // enforce (§8.2, scope: "the code is reserved here, not produced").
    const coordinator = readFileSync(
      join(packageRoot, 'src', 'server', 'runCoordinator.ts'),
      'utf8',
    );
    expect(coordinator).not.toContain("'total-timeout'");
  });
});

describe('AC-17(b) — the mapping is total in both directions', () => {
  it('gives every failure kind a code from the set', () => {
    for (const kind of RUN_FAILURE_KINDS) {
      expect(RUNNER_ERROR_CODE_VALUES).toContain(errorCodeFor(kind));
    }
  });

  it('produces every code in the set from some failure kind', () => {
    const produced = new Set(RUN_FAILURE_KINDS.map((kind) => errorCodeFor(kind)));
    // No code exists that nothing can produce: an unreachable code is a code nobody will ever
    // recognise in an incident, and it is exactly what a hand-maintained list accumulates.
    expect([...produced].sort()).toEqual([...RUNNER_ERROR_CODE_VALUES].sort());
  });

  it('maps each kind to the §8.2 result vocabulary', () => {
    // "A step locator or assertion timeout is FAILED; a parent-enforced total timeout is ERROR."
    // Everything that prevents an assertion outcome from existing is ERROR.
    expect(resultFor('step')).toBe('FAILED');
    for (const kind of RUN_FAILURE_KINDS.filter((entry) => entry !== 'step')) {
      expect(resultFor(kind)).toBe('ERROR');
    }
  });

  it('reuses the compat module’s code rather than declaring a second spelling of it', () => {
    expect(RUNNER_ERROR_CODES.RUNTIME_INCOMPATIBLE).toBe(RUNTIME_INCOMPATIBLE);
  });

  it('names each condition distinctly', () => {
    expect(new Set(RUNNER_ERROR_CODE_VALUES).size).toBe(RUNNER_ERROR_CODE_VALUES.length);
    expect(new Set(RUN_FAILURE_KINDS).size).toBe(RUN_FAILURE_KINDS.length);
  });

  it('covers every condition AC-17 enumerates', () => {
    const required: readonly RunFailureKind[] = [
      'artifact-revalidation',
      'runtime-incompatible',
      'browser-launch',
      'sandbox-unavailable',
      'start-deadline',
      'unsupported-multi-page',
      'recording',
      'step',
    ];
    for (const kind of required) expect(RUN_FAILURE_KINDS).toContain(kind);
  });
});

describe('AC-17 — 10.6’s placeholders are replaced or justified', () => {
  it('keeps STEP_FAILED, because a failing step is a real observable condition', () => {
    expect(errorCodeFor('step')).toBe('STEP_FAILED');
  });

  it('retires RUN_NOT_STARTED entirely', () => {
    // It described a run that could not start because no browser existed. There are now four
    // named reasons a run may not start, and a run that did not start for none of them is a
    // programming fault rather than a state worth a code of its own.
    expect(RUNNER_ERROR_CODE_VALUES).not.toContain('RUN_NOT_STARTED');
  });

  it('keeps RUN_ERROR as a justified residual rather than a catch-all', () => {
    expect(errorCodeFor('run-fault')).toBe('RUN_ERROR');
    // It is reachable only where no enumerated condition applies; every other kind has its own.
    const viaRunFault = RUN_FAILURE_KINDS.filter(
      (kind) => errorCodeFor(kind) === RUNNER_ERROR_CODES.RUN_ERROR,
    );
    expect(viaRunFault).toEqual(['run-fault']);
  });
});
