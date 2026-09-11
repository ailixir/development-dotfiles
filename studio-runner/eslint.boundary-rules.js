/**
 * Execution-boundary lint rules (ADR-001 §6, architecture §4.5).
 *
 * These encode "generated source is never evaluated" in tooling: no `eval`, no `Function`
 * constructor, no Node VM (which the Node documentation explicitly excludes as a security
 * mechanism), no worker threads, and no `child_process` outside `src/run/**`.
 *
 * This module is the single source of truth. It is consumed both by `eslint.config.js`
 * (the real lint run) and by `test/lint-boundary.test.ts`, which asserts that a fixture
 * containing each forbidden construct actually fails lint.
 */

/** Modules that must never be imported anywhere in the package. */
export const FORBIDDEN_MODULES = ['vm', 'node:vm', 'worker_threads', 'node:worker_threads'];

/** Modules that may only be imported from `src/run/**` (child-process browser launch, 10.12). */
export const RUN_ONLY_MODULES = ['child_process', 'node:child_process'];

const restrictedImport = (name, message) => ({ name, message });

/** Rules that apply to every linted file in the package. */
export const executionBoundaryRules = {
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-restricted-properties': [
    'error',
    {
      object: 'globalThis',
      property: 'eval',
      message: 'Indirect eval is forbidden (architecture §4.5).',
    },
  ],
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
    {
      selector: 'ImportExpression',
      message:
        'Dynamic import() is forbidden in package sources; artifact content must never reach a module loader (architecture §4.5).',
    },
  ],
  'no-restricted-imports': [
    'error',
    {
      paths: [
        ...FORBIDDEN_MODULES.map((name) =>
          restrictedImport(
            name,
            'Node VM and worker threads are not security boundaries and are forbidden (architecture §4.5).',
          ),
        ),
        ...RUN_ONLY_MODULES.map((name) =>
          restrictedImport(
            name,
            'child_process is only permitted in src/run/** (ADR-001 §6).',
          ),
        ),
      ],
    },
  ],
};

/** Override applied to `src/run/**`, where the killable browser child process lives. */
export const runDirectoryRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: FORBIDDEN_MODULES.map((name) =>
        restrictedImport(
          name,
          'Node VM and worker threads are not security boundaries and are forbidden (architecture §4.5).',
        ),
      ),
    },
  ],
};
