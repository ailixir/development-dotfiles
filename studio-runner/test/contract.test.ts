/**
 * AC-1 — conformance with the `internal`-tagged section of `docs/specs/studio/openapi.yaml`.
 *
 * **That file is story 10.1's deliverable and is not a dependency of this story.** It has not
 * merged: `docs/specs/studio/` does not exist. The conformance test below is therefore recorded
 * as **skipped, never passed** — the pattern story 10.3 established for its `ED-05`-gated stage
 * and that QA verified there. It is `skipIf`-gated rather than commented out, so the moment 10.1
 * lands the assertion runs on the next CI execution without anyone remembering to re-enable it.
 *
 * The routes this runner serves and the API routes it calls are asserted here in the meantime, so
 * a rename on either side is caught by *something* even while the frozen contract is missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';

const CONTRACT_PATH = join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml');
const CONTRACT_PRESENT = existsSync(CONTRACT_PATH);

/** Routes this runner serves (architecture §8.4). */
const RUNNER_ROUTES = ['/v1/validate', '/v1/runs', '/health', '/ready'] as const;

/** API routes this runner calls as a client. Story 10.7 implements the handlers. */
const API_ROUTES = [
  '/internal/studio/executions/{id}/admission',
  '/internal/studio/executions/{id}/progress',
] as const;

describe('AC-1 — internal contract', () => {
  it(
    CONTRACT_PRESENT
      ? 'the frozen contract from story 10.1 is present'
      : 'the frozen contract from story 10.1 has not merged: conformance is SKIPPED, never passed',
    () => {
      // Recorded either way. When this flips to present, the assertion below starts running.
      expect(typeof CONTRACT_PRESENT).toBe('boolean');
    },
  );

  it.skipIf(!CONTRACT_PRESENT)(
    'the four runner routes and the two API routes appear in the internal section',
    () => {
      const contract = readFileSync(CONTRACT_PATH, 'utf8');
      for (const route of RUNNER_ROUTES) expect(contract).toContain(route);
      for (const route of API_ROUTES) expect(contract).toContain(route);
      expect(contract).toContain('internal');
    },
  );

  it('serves exactly the four routes architecture §8.4 names, and no others', () => {
    const routes = readFileSync(join(packageRoot, 'src', 'server', 'routes.ts'), 'utf8');
    for (const route of RUNNER_ROUTES) expect(routes).toContain(`'${route}'`);
    // A fifth route would be a contract change, not an implementation detail.
    const declared = [...routes.matchAll(/path === '([^']+)'/gu)].map((match) => match[1]);
    expect([...new Set(declared)].sort()).toEqual([...RUNNER_ROUTES].sort());
  });

  it('calls exactly the two API routes architecture §8.4 names', () => {
    const admission = readFileSync(
      join(packageRoot, 'src', 'reporting', 'admissionClient.ts'),
      'utf8',
    );
    const report = readFileSync(join(packageRoot, 'src', 'reporting', 'reportClient.ts'), 'utf8');
    expect(admission).toContain('/internal/studio/executions/');
    expect(admission).toContain('/admission');
    expect(report).toContain('/internal/studio/executions/');
    expect(report).toContain('/progress');
  });
});
