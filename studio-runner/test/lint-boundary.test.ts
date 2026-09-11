import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import {
  boundaryGlobals,
  executionBoundaryRules,
  runDirectoryRules,
  FORBIDDEN_MODULES,
  MESSAGE_FOR_MODULE,
  MODULE_GROUPS,
} from '../eslint.boundary-rules.js';
import { packageRoot } from './helpers/corpus.js';

/**
 * AC-2: a fixture containing each forbidden construct must fail lint.
 *
 * The rules under test come from `eslint.boundary-rules.js`, the same module `eslint.config.js`
 * consumes, so this test cannot drift from the real lint run. The boundary rules are all core
 * ESLint rules and need no type information, so the fixtures are linted with the TypeScript
 * parser alone — which is also why they can stay out of `tsconfig.json`.
 */

/** Each fixture, with the rule it must trip. */
const FIXTURES: readonly { readonly file: string; readonly rule: string }[] = [
  { file: 'eval.ts', rule: 'no-eval' },
  { file: 'implied-eval.ts', rule: 'no-implied-eval' },
  { file: 'new-function.ts', rule: 'no-new-func' },
  { file: 'new-function.ts', rule: 'no-restricted-syntax' },
  { file: 'function-call.ts', rule: 'no-restricted-syntax' },
  { file: 'dynamic-import.ts', rule: 'no-restricted-syntax' },
  { file: 'indirect-eval.ts', rule: 'no-restricted-properties' },
  { file: 'vm-import.ts', rule: 'no-restricted-imports' },
  { file: 'worker-threads-import.ts', rule: 'no-restricted-imports' },
  { file: 'child-process-import.ts', rule: 'no-restricted-imports' },
];

function boundaryLinter(rules: Record<string, unknown>): ESLint {
  return new ESLint({
    cwd: packageRoot,
    overrideConfigFile: true,
    baseConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          ecmaVersion: 2022,
          sourceType: 'module',
          globals: boundaryGlobals,
        },
        rules: rules as ESLint.Options['baseConfig'] extends never ? never : never,
      },
    ] as unknown as ESLint.Options['baseConfig'],
  });
}

async function messagesFor(file: string, rules: Record<string, unknown>): Promise<string[]> {
  const eslint = boundaryLinter(rules);
  const results = await eslint.lintFiles([join(packageRoot, 'fixtures', 'lint', file)]);
  return results.flatMap((result) => result.messages.map((message) => message.ruleId ?? 'unknown'));
}

describe('execution-boundary lint rules', () => {
  it.each(FIXTURES.map((fixture) => [`${fixture.file} trips ${fixture.rule}`, fixture] as const))(
    '%s',
    async (_label, fixture) => {
      const ruleIds = await messagesFor(
        fixture.file,
        executionBoundaryRules as unknown as Record<string, unknown>,
      );
      expect(ruleIds).toContain(fixture.rule);
    },
  );

  it('still forbids vm and worker_threads inside src/run/**', async () => {
    for (const file of ['vm-import.ts', 'worker-threads-import.ts']) {
      const ruleIds = await messagesFor(
        file,
        runDirectoryRules as unknown as Record<string, unknown>,
      );
      expect(ruleIds).toContain('no-restricted-imports');
    }
  });

  it('permits child_process inside src/run/** only', async () => {
    const ruleIds = await messagesFor(
      'child-process-import.ts',
      runDirectoryRules as unknown as Record<string, unknown>,
    );
    expect(ruleIds).not.toContain('no-restricted-imports');
  });

  it('keeps the lint fixtures out of the package lint run', () => {
    const config = readFileSync(join(packageRoot, 'eslint.config.js'), 'utf8');
    expect(config).toContain("'fixtures/lint/**'");
  });
});

/**
 * AC-22b: every isolation entry is proven to fire against its own fixture.
 *
 * One fixture file per entry, not one per category: "the rules are proven to fire rather than
 * assumed to" is only true if each name is exercised.
 *
 * ## What is iterated, and why it is not `FORBIDDEN_MODULES`
 *
 * QA (MED-2) found the original structure fail-open: the cases were generated **from**
 * `FORBIDDEN_MODULES`, so deleting a name from the denylist deleted the very iteration that would
 * have noticed. Shrinking the list silently shrank what was verified — in the one place that must
 * not happen, since this is the isolation boundary.
 *
 * The coverage set is now pinned by **three independent sources** that must all agree:
 *
 * 1. `FORBIDDEN_MODULES` — what lint actually enforces (the thing under test);
 * 2. `fixtures/lint/isolation-manifest.json` — the recorded name-to-fixture map (checked in);
 * 3. the `isolation-*.ts` files **present on disk** (discovered, not declared).
 *
 * The per-module lint assertions iterate source 2, and source 3 is asserted to match it exactly.
 * So removing a name from `FORBIDDEN_MODULES` alone leaves its case running and the rule no longer
 * fires — red. Removing it from the manifest as well leaves an orphan fixture on disk — red.
 * Shrinking coverage now takes three deliberate, visible edits, and the union of the three sources
 * is asserted in both directions rather than one being derived from another.
 *
 * These rules are still the **second** line of defence. The gate that catches the client nobody
 * predicted is `test/isolation.test.ts`'s allowlist over the resolved production dependency
 * closure; a denylist can only ever fail for a name somebody thought of.
 */
type FixtureManifest = Readonly<Record<string, string>>;

const LINT_FIXTURE_DIR = join(packageRoot, 'fixtures', 'lint');

const isolationManifest = JSON.parse(
  readFileSync(join(LINT_FIXTURE_DIR, 'isolation-manifest.json'), 'utf8'),
) as FixtureManifest;

/** Source 2: the names the manifest claims are covered. Drives every case below. */
const MANIFEST_MODULES = Object.keys(isolationManifest);

/** Source 3: the isolation fixtures that actually exist, discovered from the directory. */
const FIXTURES_ON_DISK = readdirSync(LINT_FIXTURE_DIR)
  .filter((file) => file.startsWith('isolation-') && file.endsWith('.ts'))
  .sort();

/** The four evaluation entries predate this story and keep their original fixtures. */
const EVALUATION_MODULES = new Set(
  MODULE_GROUPS.find((group) => group.id === 'evaluation')?.modules ?? [],
);

const ISOLATION_MODULES = FORBIDDEN_MODULES.filter((name) => !EVALUATION_MODULES.has(name));

describe('isolation lint rules (AC-22b)', () => {
  it('the denylist and the manifest name exactly the same modules, in both directions', () => {
    // Superset and subset in one assertion. A name dropped from either side fails here, and the
    // per-module cases below keep running from the manifest regardless.
    expect([...MANIFEST_MODULES].sort()).toEqual([...ISOLATION_MODULES].sort());
  });

  it('the manifest and the fixture directory name exactly the same files, in both directions', () => {
    // Source 3. Deleting an entry from both the denylist and the manifest still leaves the fixture
    // behind, and an orphan fixture fails this. Coverage cannot be reduced by omission.
    expect([...new Set(Object.values(isolationManifest))].sort()).toEqual(FIXTURES_ON_DISK);
  });

  it('every manifest fixture exists on disk and every module has one', () => {
    const withoutFixture = MANIFEST_MODULES.filter((name) => {
      const fixture = isolationManifest[name];
      return fixture === undefined || !existsSync(join(LINT_FIXTURE_DIR, fixture));
    });
    expect(withoutFixture).toEqual([]);
    expect(MANIFEST_MODULES.length).toBe(FIXTURES_ON_DISK.length);
  });

  it('covers all four credential classes architecture §9.2 names', () => {
    expect(MODULE_GROUPS.map((group) => group.id).sort()).toEqual([
      'database',
      'evaluation',
      'gateway',
      'identity',
      'vault',
    ]);
  });

  it.each(MANIFEST_MODULES.map((name) => [name] as const))(
    'importing %s trips no-restricted-imports',
    async (name) => {
      const fixture = isolationManifest[name];
      expect(fixture).toBeDefined();
      const ruleIds = await messagesFor(
        fixture ?? '',
        executionBoundaryRules as unknown as Record<string, unknown>,
      );
      expect(ruleIds).toContain('no-restricted-imports');
    },
  );

  it.each(MANIFEST_MODULES.map((name) => [name] as const))(
    'still forbids %s inside src/run/**',
    async (name) => {
      const ruleIds = await messagesFor(
        isolationManifest[name] ?? '',
        runDirectoryRules as unknown as Record<string, unknown>,
      );
      expect(ruleIds).toContain('no-restricted-imports');
    },
  );

  it('reports each entry with its own credential-class message', () => {
    for (const name of MANIFEST_MODULES) {
      const group = MODULE_GROUPS.find((candidate) => candidate.modules.includes(name));
      expect(group, `${name} belongs to no credential class`).toBeDefined();
      expect(MESSAGE_FOR_MODULE[name]).toBe(group?.message);
    }
    // And the denylist's own entries keep their class message, evaluation included.
    for (const group of MODULE_GROUPS) {
      for (const name of group.modules) {
        expect(MESSAGE_FOR_MODULE[name]).toBe(group.message);
      }
    }
  });
});
