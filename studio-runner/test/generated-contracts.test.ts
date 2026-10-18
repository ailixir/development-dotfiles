/**
 * STUDIO-OBS-012A AC-5 — the four generated runner bundles are byte-identical to a fresh
 * regeneration from `docs/specs/studio-observed-authoring/contracts/v3`.
 *
 * `tools/build-studio-observed-schemas.cjs` is the only writer of `src/guided/schemas.json`,
 * `src/guided/types.ts`, `src/validator/observedSchemas.json` and
 * `src/executor/observedOperations.ts`. A hand edit, or a v3 schema edit without regeneration,
 * makes the checked-in bundle a second source of truth; this default-tier test is the gate that
 * refuses it. The generator runs in-process (no child process) and writes nothing in check mode.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

interface Generator {
  check(): string;
  readonly outputs: Readonly<Record<string, string>>;
}

const generator = createRequire(import.meta.url)('../../tools/build-studio-observed-schemas.cjs') as Generator;

describe('generated observed v3 bundles', () => {
  it('names exactly the four runner outputs it owns', () => {
    expect(Object.keys(generator.outputs).sort()).toEqual([
      'studio-runner/src/executor/observedOperations.ts',
      'studio-runner/src/guided/schemas.json',
      'studio-runner/src/guided/types.ts',
      'studio-runner/src/validator/observedSchemas.json',
    ]);
  });

  it('matches a fresh regeneration from contracts/v3 byte for byte', () => {
    expect(generator.check()).toMatch(/four byte-identical outputs$/u);
  });
});
