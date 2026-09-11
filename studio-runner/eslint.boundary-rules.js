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

/**
 * The browser library, confined to one module (story 10.12 AC-1).
 *
 * `src/run/browser.ts` is the only file permitted to import it. Everything else — the validator,
 * the executor, the server, the reporting layer, and even the Playwright *adapter* — is written
 * against local structural types, so no Playwright type, value or import escapes the one place
 * that starts a browser. The adapter being on this side of the line is what lets the unit tier
 * exercise every one of its branches without launching anything (AC-25).
 *
 * Confined the same way `child_process` already is, and proven the same way: `fixtures/lint/`
 * carries a file per entry and `test/lint-boundary.test.ts` asserts each one trips the rule.
 */
export const PLAYWRIGHT_MODULES = ['playwright', 'playwright-core'];

const PLAYWRIGHT_MESSAGE =
  'Playwright is confined to src/run/browser.ts (story 10.12 AC-1, ADR-001 §6). Everything else ' +
  'is written against the structural page/locator surface in src/run/playwrightAdapter.ts, so no ' +
  'Playwright type escapes the module that starts a browser.';

/**
 * The flags that disable a Chromium sandbox (AC-6a, architecture §9.3, ADR-001 §8).
 *
 * §9.3 is explicit: *"do not disable it silently to make the image run"*. Playwright's
 * `chromiumSandbox` defaults to `false` — which adds `--no-sandbox` — so the default is the wrong
 * way round, and the failure mode this rule exists for is a future engineer adding one of these at
 * 2 a.m. to make a build pass. A reviewer cannot see an option that was never written; lint can.
 *
 * Assembled from parts rather than written out, so the rule definition is not itself a match for
 * the repo-wide scan in `test/run/sandbox.test.ts`.
 */
const SANDBOX_FLAG_PATTERN = [
  ['--no', '-sandbox'].join(''),
  ['--disable-setuid', '-sandbox'].join(''),
  ['--disable-gpu', '-sandbox'].join(''),
].join('|');

export const SANDBOX_FLAG_SYNTAX = [
  {
    selector: `Literal[value=/${SANDBOX_FLAG_PATTERN}/]`,
    message:
      'A Chromium sandbox-disabling flag is forbidden anywhere in this package: the launch option ' +
      'is chromiumSandbox: true and there is no path that turns it off (architecture §9.3, ' +
      'ADR-001 §8, story 10.12 AC-6a).',
  },
  {
    selector: `TemplateElement[value.raw=/${SANDBOX_FLAG_PATTERN}/]`,
    message:
      'A Chromium sandbox-disabling flag is forbidden anywhere in this package: the launch option ' +
      'is chromiumSandbox: true and there is no path that turns it off (architecture §9.3, ' +
      'ADR-001 §8, story 10.12 AC-6a).',
  },
];

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
    ...SANDBOX_FLAG_SYNTAX,
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
        ...PLAYWRIGHT_MODULES.map((name) => restrictedImport(name, PLAYWRIGHT_MESSAGE)),
      ],
    },
  ],
};

/**
 * Override applied to `src/run/**`, where the killable browser child process lives.
 *
 * `child_process` becomes permitted here; **Playwright does not**. The directory holds the
 * protocol, the launcher, the run clock, the recording vocabulary and the adapter, and none of
 * them needs the library — only `src/run/browser.ts` does, and it gets its own narrower override.
 */
export const runDirectoryRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        ...FORBIDDEN_MODULES.map((name) => restrictedImport(name, MESSAGE_FOR_MODULE[name])),
        ...PLAYWRIGHT_MODULES.map((name) => restrictedImport(name, PLAYWRIGHT_MESSAGE)),
      ],
    },
  ],
};

/**
 * Override applied to `src/run/browser.ts` alone: the one module that may import Playwright.
 *
 * Everything else the denylist forbids stays forbidden here, sandbox flags included.
 */
export const browserModuleRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: FORBIDDEN_MODULES.map((name) => restrictedImport(name, MESSAGE_FOR_MODULE[name])),
    },
  ],
};
