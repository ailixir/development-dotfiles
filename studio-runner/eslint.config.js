import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

import {
  boundaryGlobals,
  browserModuleRules,
  executionBoundaryRules,
  FORBIDDEN_MODULES,
  MESSAGE_FOR_MODULE,
  runDirectoryRules,
  stepCodeModuleRules,
} from './eslint.boundary-rules.js';

/**
 * ESLint 9 flat config (ADR-001 §6). Deliberately newer than `frontend/`'s ESLint 8 setup;
 * no config file is shared between the two packages. Formatting is not enforced (no Prettier).
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      // Generated, hash-pinned copy of the production collector used by the SPK-07 spike (never hand-edited).
      'evaluation/grounding/generated/**',
      // Deliberate violations used as lint-rule fixtures; asserted by test/lint-boundary.test.ts.
      'fixtures/lint/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: boundaryGlobals,
    },
    plugins: { import: importPlugin },
    rules: {
      ...executionBoundaryRules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: false, optionalDependencies: false, peerDependencies: false },
      ],
    },
  },
  {
    files: ['src/run/**/*.ts'],
    rules: runDirectoryRules,
  },
  {
    // The one module permitted to import Playwright (story 10.12 AC-1). Ordered after the
    // directory rule so it narrows it rather than being narrowed by it.
    files: ['src/run/browser.ts'],
    rules: browserModuleRules,
  },
  {
    // The one module that may construct step code (ADR-SC-008 D3.1): the async function construct is allowed here and nowhere else.
    files: ['src/run/stepCode.ts'],
    rules: stepCodeModuleRules,
  },
  {
    // Build-time scripts are not shipped in the image and never see artifact content. They may
    // import the freshly built `dist/versions.js` to read the constants they record.
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Function"]',
          message: 'The Function constructor turns strings into code (architecture §4.5).',
        },
        {
          selector: 'CallExpression[callee.name="Function"]',
          message: 'The Function constructor turns strings into code (architecture §4.5).',
        },
      ],
    },
  },
  {
    // The local-start tooling (dev.sh's helper and its node:test check) runs `openssl`, the JDK `keytool` and
    // `scripts/print-observed-catalog.mjs`. **This does not spend ADR-001 §6**: the property it protects is that artifact
    // content never reaches a process spawn in the shipped package (`test/run/confinement.test.ts` scans `src/**`). These
    // two files are not shipped, never see an artifact, and pass only arguments written in them.
    files: ['scripts/local-stack.mjs', 'scripts/local-stack.check.mjs'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['test/**/*.ts', '*.config.ts', 'eslint.config.js', 'eslint.boundary-rules.js'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  {
    // The chart-rendering harness (story 10.18a) invokes `helm` and `docker`, which are external
    // processes and cannot be reached any other way.
    //
    // **This does not spend ADR-001 §6.** The property §6 protects is that artifact content never
    // reaches a process spawn *in the shipped package*, and it is asserted where it lives:
    // `test/run/confinement.test.ts` scans `src/**` and requires `node:child_process` to appear
    // only under `src/run/**`. Nothing here ships — the test tier is not in the image — and the
    // arguments passed are chart paths and `--set` overrides written in this file, never anything
    // derived from an artifact. Scoped to the two harness files rather than to `test/**`, so the
    // ban stays in force everywhere else in the tier.
    files: ['test/deployment/helm.ts', 'test/deployment/image.ts', 'test/deployment/sec2.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: FORBIDDEN_MODULES.map((name) => ({ name, message: MESSAGE_FOR_MODULE[name] })),
        },
      ],
      // Rendered Kubernetes keys are SCREAMING_SNAKE environment names and YAML field names read
      // out of a parsed document; dot notation on a `Record<string, string>` index is not the
      // clearer form here.
      '@typescript-eslint/dot-notation': 'off',
    },
  },
  {
    files: ['test/deployment/*.test.ts'],
    rules: { '@typescript-eslint/dot-notation': 'off' },
  },
  {
    // SPK-07 spike harness (not shipped, untracked tooling): untyped .mjs whose in-world programs are
    // sent to a page as strings, so page globals and the Function-based source decoder appear in it.
    // Scoped to this one directory; no rule is relaxed for src/ or test/.
    files: ['evaluation/grounding/**/*.mjs'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-undef': 'off', 'no-restricted-syntax': 'off', 'no-new-func': 'off' },
  },
  {
    // CommonJS fixtures (the committed verbatim copy of the spike gate functions and its facts helper): Node's module globals.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', exports: 'writable', Buffer: 'readonly' },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
);
