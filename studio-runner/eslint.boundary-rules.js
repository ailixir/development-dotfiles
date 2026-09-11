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

/**
 * Globals `no-implied-eval` must be able to resolve. Without them the rule cannot tell that
 * `setTimeout` is the global one and silently passes, so they are declared alongside the rules
 * rather than left to whichever environment preset happens to be active.
 */
export const boundaryGlobals = {
  setTimeout: 'readonly',
  setInterval: 'readonly',
  setImmediate: 'readonly',
  execScript: 'readonly',
};

/**
 * Isolation module groups (story 10.6 AC-22b, architecture §9.2).
 *
 * Architecture §9.2: *"the runner … has no platform user session or DB/vault/CSI/LLM
 * credentials"*. These entries encode that in tooling — a fast, readable denylist that fails in
 * the editor rather than at review time.
 *
 * **This is a second line of defence, not the gate.** A denylist only ever fails for a client
 * somebody predicted, and the whole point of AC-22 is the one nobody predicted. The gate that
 * actually catches the unanticipated case is `test/isolation.test.ts`, which allowlists the
 * resolved production dependency closure and fails for **any** package not on it, whatever it is.
 * These rules exist because a named error at the import line is a better developer experience
 * than a dependency-closure diff, not because they are sufficient.
 *
 * Each group carries its own message, and `test/lint-boundary.test.ts` proves every entry fires
 * against a fixture in `fixtures/lint/`.
 */
export const MODULE_GROUPS = [
  {
    id: 'evaluation',
    modules: ['vm', 'node:vm', 'worker_threads', 'node:worker_threads'],
    message:
      'Node VM and worker threads are not security boundaries and are forbidden (architecture §4.5).',
  },
  {
    id: 'database',
    modules: [
      'pg',
      'mysql',
      'mysql2',
      'mssql',
      'tedious',
      'oracledb',
      'mongodb',
      'redis',
      'ioredis',
      'knex',
      'typeorm',
      'sequelize',
      '@prisma/client',
      'better-sqlite3',
      'sqlite3',
    ],
    message:
      'The runner has no database credential and must never link a database driver ' +
      '(architecture §9.2). Persistence of admission, progress and terminal reports is the API ' +
      "side's (story 10.7).",
  },
  {
    id: 'vault',
    modules: ['node-vault', 'hashi-vault-js', '@hashicorp/vault-client', 'vault-api'],
    message:
      'The runner has no vault credential (architecture §9.2). Secrets are resolved by the worker ' +
      'at dispatch and arrive as ephemeral per-run values.',
  },
  {
    id: 'identity',
    modules: [
      'openid-client',
      'oidc-client-ts',
      'passport',
      '@azure/identity',
      'google-auth-library',
      '@okta/okta-sdk-nodejs',
    ],
    message:
      'The runner holds no platform user session and no CSI/identity client (architecture §9.2). ' +
      'Its only identity is the restricted service credential on its internal routes.',
  },
  {
    id: 'gateway',
    modules: [
      'openai',
      '@anthropic-ai/sdk',
      '@google-cloud/vertexai',
      '@google/generative-ai',
      'langchain',
      '@langchain/core',
    ],
    message:
      'The runner has no LLM gateway credential (architecture §9.2). Artifact generation happens ' +
      'in the backend compile path, never in the process that opens untrusted pages.',
  },
];

/** Modules that must never be imported anywhere in the package. */
export const FORBIDDEN_MODULES = MODULE_GROUPS.flatMap((group) => group.modules);

/** The message a given forbidden module must be reported with. */
export const MESSAGE_FOR_MODULE = Object.fromEntries(
  MODULE_GROUPS.flatMap((group) => group.modules.map((name) => [name, group.message])),
);

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
        ...FORBIDDEN_MODULES.map((name) => restrictedImport(name, MESSAGE_FOR_MODULE[name])),
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
      paths: FORBIDDEN_MODULES.map((name) => restrictedImport(name, MESSAGE_FOR_MODULE[name])),
    },
  ],
};
