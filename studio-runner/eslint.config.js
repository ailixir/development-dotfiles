import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

import { boundaryGlobals, executionBoundaryRules, runDirectoryRules } from './eslint.boundary-rules.js';

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
    files: ['test/**/*.ts', '*.config.ts', 'eslint.config.js', 'eslint.boundary-rules.js'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
);
