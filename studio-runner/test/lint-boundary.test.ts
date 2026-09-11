import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { boundaryGlobals, executionBoundaryRules, runDirectoryRules } from '../eslint.boundary-rules.js';
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
