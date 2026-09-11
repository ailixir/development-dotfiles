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
 *
 * ## What the armed assertion checks, after MED-3
 *
 * QA found the armed assertion was six `toContain` calls over the raw file: substring containment
 * proves a route *string* appears somewhere, which is not what AC-1 asks for and would have turned
 * AC-1 green on a contract the runner's bodies violate. Five stories code against this contract,
 * so a weak check here propagates.
 *
 * It now parses the document and asserts **body conformance in both directions**:
 *
 * - the **request bodies the runner sends** — the exact bytes captured from a real run through
 *   the fake HTTP client — against the `internal`-tagged admission and progress request schemas;
 * - the **response bodies the runner serves** — the exact bytes off its own socket for all four
 *   routes — against the contract's response schemas for the status codes it actually returns.
 *
 * The check is scoped to operations carrying the `internal` tag, and a body with an extra,
 * missing or wrongly typed field fails it. The machinery is proven against a stub contract in the
 * always-running block below, so the strength of the armed assertion is demonstrated **today**
 * rather than asserted for the day 10.1 lands.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';
import { createHarness, SERVICE_TOKEN, until } from './helpers/harness.js';
import type { YamlValue } from './helpers/openapi.js';
import {
  isInternal,
  parseYaml,
  requestSchema,
  responseSchema,
  validateAgainstSchema,
} from './helpers/openapi.js';
import { get, post, validJob } from './helpers/runner.js';

const CONTRACT_PATH = join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml');
const CONTRACT_PRESENT = existsSync(CONTRACT_PATH);

/** Routes this runner serves (architecture §8.4). */
const RUNNER_ROUTES = ['/v1/validate', '/v1/runs', '/health', '/ready'] as const;

/** API routes this runner calls as a client. Story 10.7 implements the handlers. */
const API_ROUTES = [
  '/internal/studio/executions/{id}/admission',
  '/internal/studio/executions/{id}/progress',
] as const;

// ── The bytes under test ──────────────────────────────────────────────────────────────────────

interface WireBodies {
  /** The admission request body, exactly as handed to the HTTP client. */
  readonly admissionRequest: string;
  /** Every progress and terminal report body, exactly as handed to the HTTP client. */
  readonly progressRequests: readonly string[];
  readonly validate200: string;
  readonly runs202: string;
  readonly health200: string;
  readonly ready200: string;
}

/**
 * Runs one job end to end and captures every body that crossed a boundary in either direction.
 *
 * Conformance is asserted on **these** strings rather than on hand-written examples: an example
 * that drifts from what the runner serializes would keep the contract test green while the runner
 * violates the contract, which is the failure mode MED-3 is about.
 */
async function captureWireBodies(): Promise<WireBodies> {
  const runner = createHarness();
  await runner.start();
  try {
    const job = validJob();
    const validate = await post(
      runner.port,
      '/v1/validate',
      JSON.stringify({ artifact: job.artifact, source: job.source, references: job.references }),
      SERVICE_TOKEN,
    );
    expect(validate.status).toBe(200);

    const health = await get(runner.port, '/health', SERVICE_TOKEN);
    expect(health.status).toBe(200);
    const ready = await get(runner.port, '/ready', SERVICE_TOKEN);
    expect(ready.status).toBe(200);

    const runs = await post(runner.port, '/v1/runs', JSON.stringify(job), SERVICE_TOKEN);
    expect(runs.status).toBe(202);
    await until(() => runner.app.coordinator.inFlight === 0);

    const admission = runner.http.admissionRequests[0]?.body;
    expect(admission).toBeDefined();
    expect(runner.http.reportRequests.length).toBeGreaterThanOrEqual(3);

    return {
      admissionRequest: admission ?? '',
      progressRequests: runner.http.reportRequests.map((request) => request.body),
      validate200: validate.body,
      runs202: runs.body,
      health200: health.body,
      ready200: ready.body,
    };
  } finally {
    await runner.stop();
  }
}

let wire: WireBodies;

beforeAll(async () => {
  wire = await captureWireBodies();
});

// ── The stub contract that proves the machinery ───────────────────────────────────────────────

/**
 * A stand-in for 10.1's document, written here to exercise the reader and the checker.
 *
 * It is **not** the contract and nothing conforms *to* it for AC-1's purposes — it exists so the
 * parse, the `internal`-tag scoping, the `$ref` resolution and the violation reporting are all
 * executed and asserted while the real file is absent. It deliberately uses `$ref`, a flow
 * sequence for `tags`, a block scalar for a description and a quoted status key, because those
 * are the shapes an OpenAPI document actually takes.
 */
const STUB_CONTRACT = `
openapi: 3.0.3
info:
  title: Studio internal API (stub)
  version: 0.0.0
paths:
  /internal/studio/executions/{id}/admission:
    post:
      tags: [internal]
      summary: >
        Claims exclusive ownership of one attempt.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AdmissionRequest'
      responses:
        '200':
          description: Admitted
          content:
            application/json:
              schema:
                type: object
  /v1/runs:
    post:
      tags: [internal]
      responses:
        '202':
          description: Accepted
          content:
            application/json:
              schema:
                type: object
                required:
                  - code
                additionalProperties: false
                properties:
                  code:
                    type: string
                  detail:
                    type: array
                    items:
                      type: object
  /public/thing:
    get:
      tags:
        - public
      responses:
        '200':
          description: Not part of the internal section
          content:
            application/json:
              schema:
                type: object
components:
  schemas:
    AdmissionRequest:
      type: object
      additionalProperties: false
      required:
        - executionId
        - attemptId
        - runnerInstanceId
        - admissionId
        - runtimeVersions
      properties:
        executionId:
          type: string
        attemptId:
          type: string
        runnerInstanceId:
          type: string
        admissionId:
          type: string
        runtimeVersions:
          type: object
`;

const ADMISSION_OPERATION = { path: API_ROUTES[0], method: 'post' } as const;

function parsedAdmissionBody(): Record<string, unknown> {
  return JSON.parse(wire.admissionRequest) as Record<string, unknown>;
}

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
    'the request bodies the runner sends conform to the internal-tagged request schemas',
    () => {
      const document: YamlValue = parseYaml(readFileSync(CONTRACT_PATH, 'utf8'));

      for (const route of API_ROUTES) {
        const where = { path: route, method: 'post' };
        // Scoped to the internal tag, as AC-1 words it — not to the file as a whole.
        expect(isInternal(document, where), `${route} is not tagged internal`).toBe(true);
      }

      const admissionViolations = validateAgainstSchema(
        parsedAdmissionBody(),
        requestSchema(document, { path: API_ROUTES[0], method: 'post' }),
        document,
        'admissionRequest',
      );
      expect(admissionViolations).toEqual([]);

      const progressSchema = requestSchema(document, { path: API_ROUTES[1], method: 'post' });
      for (const [index, body] of wire.progressRequests.entries()) {
        const violations = validateAgainstSchema(
          JSON.parse(body),
          progressSchema,
          document,
          `progressRequest[${String(index)}]`,
        );
        expect(violations).toEqual([]);
      }
    },
  );

  it.skipIf(!CONTRACT_PRESENT)(
    'the response bodies the runner serves conform to the internal-tagged response schemas',
    () => {
      const document: YamlValue = parseYaml(readFileSync(CONTRACT_PATH, 'utf8'));

      const served: readonly {
        readonly path: string;
        readonly method: string;
        readonly status: number;
        readonly body: string;
      }[] = [
        { path: '/v1/validate', method: 'post', status: 200, body: wire.validate200 },
        { path: '/v1/runs', method: 'post', status: 202, body: wire.runs202 },
        { path: '/health', method: 'get', status: 200, body: wire.health200 },
        { path: '/ready', method: 'get', status: 200, body: wire.ready200 },
      ];

      for (const entry of served) {
        const where = { path: entry.path, method: entry.method };
        expect(isInternal(document, where), `${entry.path} is not tagged internal`).toBe(true);
        const violations = validateAgainstSchema(
          JSON.parse(entry.body),
          responseSchema(document, where, entry.status),
          document,
          `${entry.method.toUpperCase()} ${entry.path} ${String(entry.status)}`,
        );
        expect(violations).toEqual([]);
      }
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

/**
 * The conformance machinery, exercised against the stub while the real contract is absent.
 *
 * Every one of these runs today. They are what makes the armed assertion above a guard rather
 * than a promise: the same parse, the same tag scoping and the same checker are shown here to
 * accept the bytes the runner really sends and to reject bodies that violate the schema.
 */
describe('AC-1 — the conformance check itself', () => {
  const document = parseYaml(STUB_CONTRACT);

  it('reads the document shapes an OpenAPI file uses', () => {
    expect(isInternal(document, ADMISSION_OPERATION)).toBe(true);
    // Flow sequence, block sequence and the non-internal operation are all read correctly.
    expect(isInternal(document, { path: '/v1/runs', method: 'post' })).toBe(true);
    expect(isInternal(document, { path: '/public/thing', method: 'get' })).toBe(false);
    // A quoted status key and a `$ref` into components both resolve.
    expect(responseSchema(document, { path: '/v1/runs', method: 'post' }, 202)).toBeDefined();
    const schema = requestSchema(document, ADMISSION_OPERATION);
    expect(validateAgainstSchema({}, schema, document)).not.toEqual([]);
  });

  it('accepts the exact admission bytes the runner sends', () => {
    const violations = validateAgainstSchema(
      parsedAdmissionBody(),
      requestSchema(document, ADMISSION_OPERATION),
      document,
      'admissionRequest',
    );
    expect(violations).toEqual([]);
  });

  it('accepts the exact 202 bytes the runner serves on POST /v1/runs', () => {
    const violations = validateAgainstSchema(
      JSON.parse(wire.runs202),
      responseSchema(document, { path: '/v1/runs', method: 'post' }, 202),
      document,
      'runs202',
    );
    expect(violations).toEqual([]);
  });

  const badBodies: readonly {
    readonly label: string;
    readonly mutate: (body: Record<string, unknown>) => Record<string, unknown>;
    readonly expected: string;
  }[] = [
    {
      label: 'a required property is missing',
      mutate: (body) => {
        const rest = { ...body };
        delete rest.admissionId;
        return rest;
      },
      expected: 'admissionRequest.admissionId: required property is missing',
    },
    {
      label: 'a property has the wrong type',
      mutate: (body) => ({ ...body, executionId: 42 }),
      expected: 'admissionRequest.executionId: expected type string, got integer',
    },
    {
      label: 'an object property arrives as an array',
      mutate: (body) => ({ ...body, runtimeVersions: ['playwright'] }),
      expected: 'admissionRequest.runtimeVersions: expected type object, got array',
    },
    {
      label: 'a property the contract does not declare is sent',
      mutate: (body) => ({ ...body, resolvedSecrets: { PW: 'x' } }),
      expected: 'admissionRequest.resolvedSecrets: property is not permitted by the contract',
    },
    {
      label: 'a nullable-looking property arrives as null',
      mutate: (body) => ({ ...body, attemptId: null }),
      expected: 'admissionRequest.attemptId: expected type string, got null',
    },
  ];

  it.each(badBodies.map((entry) => [entry.label, entry] as const))(
    'rejects a body where %s',
    (_label, entry) => {
      const violations = validateAgainstSchema(
        entry.mutate(parsedAdmissionBody()),
        requestSchema(document, ADMISSION_OPERATION),
        document,
        'admissionRequest',
      );
      expect(violations).toContain(entry.expected);
    },
  );

  it('fails loudly on a document it cannot read, rather than passing vacuously', () => {
    // A contract the reader does not understand must not become a green conformance run.
    expect(() => parseYaml('paths:\n\tbroken: true')).toThrow();
    expect(() => requestSchema(parseYaml('paths: {}'), ADMISSION_OPERATION)).toThrow();
    expect(() =>
      requestSchema(parseYaml(STUB_CONTRACT), { path: '/public/thing', method: 'get' }),
    ).toThrow();
    expect(() =>
      responseSchema(parseYaml(STUB_CONTRACT), { path: '/v1/runs', method: 'post' }, 500),
    ).toThrow();
  });
});
