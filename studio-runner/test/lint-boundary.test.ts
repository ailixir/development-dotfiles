import { existsSync, readFileSync } from 'node:fs';
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
 * assumed to" is only true if each name is exercised. `fixtures/lint/isolation-manifest.json` maps
 * module name to fixture file and is generated alongside the fixtures, so an entry added to
 * `MODULE_GROUPS` without a fixture fails the completeness test below rather than passing quietly.
 *
 * These rules are the **second** line of defence. The gate that catches the client nobody
 * predicted is `test/isolation.test.ts`'s allowlist over the resolved production dependency
 * closure; a denylist can only ever fail for a name somebody thought of.
 */
type FixtureManifest = Readonly<Record<string, string>>;

const isolationManifest = JSON.parse(
  readFileSync(join(packageRoot, 'fixtures', 'lint', 'isolation-manifest.json'), 'utf8'),
) as FixtureManifest;

/** The four evaluation entries predate this story and keep their original fixtures. */
const EVALUATION_MODULES = new Set(
  MODULE_GROUPS.find((group) => group.id === 'evaluation')?.modules ?? [],
);

const ISOLATION_MODULES = FORBIDDEN_MODULES.filter((name) => !EVALUATION_MODULES.has(name));

describe('isolation lint rules (AC-22b)', () => {
  it('has a fixture for every forbidden isolation module', () => {
    const withoutFixture = ISOLATION_MODULES.filter(
      (name) => {
        const fixture = isolationManifest[name];
        return fixture === undefined || !existsSync(join(packageRoot, 'fixtures', 'lint', fixture));
      },
    );
    expect(withoutFixture).toEqual([]);
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

  it.each(ISOLATION_MODULES.map((name) => [name] as const))(
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

  it.each(ISOLATION_MODULES.map((name) => [name] as const))(
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
    for (const group of MODULE_GROUPS) {
      for (const name of group.modules) {
        expect(MESSAGE_FOR_MODULE[name]).toBe(group.message);
      }
    }
  });
});
