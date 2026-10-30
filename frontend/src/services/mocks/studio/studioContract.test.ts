import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import AjvDraft07 from 'ajv';
import { parse as parseYaml } from 'yaml';
import { mockExecutions, mockTests, MOCK_READABLE_CSIS, OTHER_CSI } from './fixtures';
import { readinessDrafts } from './readinessFixtures';
import { ALL_SCENARIO_FRAMES, REPLAY_FAILURE_SCENARIOS } from './executionScenarios';
import {
  EXECUTION_ERROR_CODES,
  REPLAY_FAILURE_CODES,
  TEST_READINESS_VALUES,
  defaultConfiguration,
} from '@/types/studio/studioTypes';
import { READINESS } from '@/components/studio/tests/testListPresentation';
import {
  EXECUTE_CONFLICT_KEYS,
  EXECUTE_CONFLICT_NARRATIVES,
  EXECUTION_DISABLED_NARRATIVE,
  EXECUTION_ERROR_NARRATIVES,
  QUOTA_EXHAUSTED_NARRATIVE,
  RUN_MODE,
  EXECUTABLE_READINESS,
  executeRefusalFor,
  executionErrorNarrative,
  runModeFor,
} from '@/components/studio/run';
import { EXECUTION_FIXTURE_MATRIX, executionCorpus, replayFailureExecutions } from './executionFixtures';
import {
  NO_RUN_EVIDENCE_MESSAGE,
  RUN_IN_PROGRESS_EVIDENCE_MESSAGE,
  PARTIAL_RECORDING_QUALIFIER,
  PLAYBACK_FAILED_MESSAGE,
  VIDEO_EVIDENCE_NARRATIVES,
  videoEvidenceNarrative,
} from '@/components/studio/evidence';
import { studioMockServer } from './server';
import studioHandlers, { resetStudioMocks } from './handlers';
import { DEMO_DELETED_TEST_ID, demoExecutions, demoTests } from './demoFixtures';
import studioApi from '@/services/api/studioApi';
import { studioGuidedApi } from '@/services/api/studioGuidedApi';
import { isCancelledOutcome } from '@/components/studio/run/executionStatus';
import type { ExecutionSnapshot, TestDto } from '@/types/studio/studioTypes';

/**
 * Story 10.1 AC-21 — the mocks are checked against the frozen contract, not against themselves.
 *
 * Fixtures that drift from the contract are worse than no fixtures: the UI is built and demoed
 * against shapes the server will never send, and the gap only surfaces when the backend lands.
 * These tests read `docs/specs/studio/` directly, so the contract is the single arbiter.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');

const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });

const SPEC_ID = 'https://put.citi.com/schemas/studio/openapi.yaml';

/**
 * OpenAPI 3.0 spells an optional null as `nullable: true`; JSON Schema spells it as a type union.
 * Translating here keeps the contract document idiomatic OpenAPI while still letting a real
 * validator check the fixtures against it.
 */
function toJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(toJsonSchema);
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'nullable') {
      continue;
    }
    result[key] = toJsonSchema(value);
  }
  if (source.nullable === true && typeof source.type === 'string') {
    result.type = [source.type, 'null'];
  }
  return result;
}

const specSchema = { ...(toJsonSchema(openapi) as Record<string, unknown>), $id: SPEC_ID };
ajv.addSchema(specSchema);

function componentValidator(name: string) {
  expect(openapi.components.schemas[name], `openapi.yaml declares a ${name} schema`).toBeDefined();
  return ajv.compile({ $ref: `${SPEC_ID}#/components/schemas/${name}` });
}

function requiredPropertiesOf(name: string): string[] {
  return openapi.components.schemas[name].required ?? [];
}

function declaredPropertiesOf(name: string): string[] {
  return Object.keys(openapi.components.schemas[name].properties ?? {});
}

describe('the mock fixtures match the OpenAPI component schemas', () => {
  it('every execution fixture carries every required snapshot field', () => {
    const required = requiredPropertiesOf('ExecutionSnapshot');
    const declared = declaredPropertiesOf('ExecutionSnapshot');
    expect(required.length).toBeGreaterThan(0);

    for (const execution of mockExecutions) {
      for (const field of required) {
        expect(
          Object.prototype.hasOwnProperty.call(execution, field),
          `${execution.executionId} is missing ${field}`,
        ).toBe(true);
      }
      // And carries nothing the contract does not declare.
      for (const field of Object.keys(execution)) {
        expect(declared, `${execution.executionId} has undeclared field ${field}`).toContain(field);
      }
    }
  });

  it('every execution fixture validates against the snapshot schema', () => {
    const validate = componentValidator('ExecutionSnapshot');
    for (const execution of mockExecutions) {
      expect(validate(execution), `${execution.executionId}: ${JSON.stringify(validate.errors)}`)
        .toBe(true);
    }
  });

  it('every test fixture validates against the test schema', () => {
    const validate = componentValidator('TestDto');
    for (const test of mockTests) {
      expect(validate(test), `${test.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('only the canonical engine appears in any fixture', () => {
    for (const test of mockTests) {
      expect(test.configuration.browser).toBe('chromium');
    }
  });
});

describe('the fixtures exercise the whole contract surface', () => {
  it('covers every terminal outcome', () => {
    const statuses = new Set(mockExecutions.map((execution) => execution.status));
    expect(statuses).toContain('PENDING');
    expect(statuses).toContain('RUNNING');
    expect(statuses).toContain('PASSED');
    expect(statuses).toContain('FAILED');
    expect(statuses).toContain('ERROR');
  });

  it('covers every evidence state', () => {
    const states = new Set(mockExecutions.map((execution) => execution.video.status));
    for (const state of ['PROCESSING', 'AVAILABLE', 'FAILED', 'UNAVAILABLE', 'EXPIRED']) {
      expect(states, `no fixture has evidence state ${state}`).toContain(state);
    }
  });

  it('represents a timeout as ERROR with a code, never as a status', () => {
    const timedOut = mockExecutions.find((execution) => execution.errorCode === 'TIMEOUT');
    expect(timedOut?.status).toBe('ERROR');
    expect(mockExecutions.some((execution) => execution.status === ('TIMEOUT' as never))).toBe(
      false,
    );
  });

  it('gives skipped and unstarted steps null timings', () => {
    const skipped = mockExecutions
      .flatMap((execution) => execution.stepResults)
      .filter((step) => step.status === 'SKIPPED' || step.status === 'PENDING');

    expect(skipped.length).toBeGreaterThan(0);
    for (const step of skipped) {
      expect(step.offsetMs).toBeNull();
      expect(step.durationMs).toBeNull();
    }
  });

  it('never exposes a storage key or an external URL as the video source', () => {
    for (const execution of mockExecutions) {
      if (execution.videoPath !== null) {
        expect(execution.videoPath).toMatch(
          /^\/api\/v1\/studio\/executions\/[0-9a-f-]+\/video$/,
        );
      }
    }
  });

  it('invents no confirmation metadata for legacy history', () => {
    const legacy = mockExecutions.find((execution) => execution.revisionId === null);
    expect(legacy).toBeDefined();
    expect(legacy?.runtime.playwright).toBeNull();
    expect(legacy?.runtime.chromium).toBeNull();
  });

  it('contains data for a CSI the mock principal cannot read', () => {
    // Without this, the scoping test below would pass vacuously.
    expect(MOCK_READABLE_CSIS).not.toContain(OTHER_CSI);
    expect(mockTests.some((test) => test.csiId === OTHER_CSI)).toBe(true);
    expect(mockExecutions.some((execution) => execution.csiId === OTHER_CSI)).toBe(true);
  });
});


/**
 * Story 10.10 — the document-reading assertions, installed here once (ADR-002 §18.3).
 *
 * *"Story 10.10 is the first frontend story to consume a code set of that kind, a wave earlier
 * than 10.11. Whichever lands first should install the document-reading assertion once, and the
 * other should extend it rather than write a second one. Two hand-maintained copies of one
 * vocabulary in two languages is the arrangement that produced INT-4."*
 *
 * Story 10.11 extends {@link assertSameSet} for `ExecutionErrorCode` (O-12). It does not write a
 * second parser of this document.
 */

/** Both directions, always. A one-way "every code has an entry" check is named insufficient. */
function assertSameSet(fromDocument: readonly string[], fromUi: readonly string[], what: string) {
  const document = [...fromDocument].sort();
  const ui = [...fromUi].sort();
  const missingFromUi = document.filter((code) => !ui.includes(code));
  const missingFromDocument = ui.filter((code) => !document.includes(code));

  expect(missingFromUi, `${what}: declared but with no wording in the UI`).toEqual([]);
  expect(missingFromDocument, `${what}: worded in the UI but not declared`).toEqual([]);
  expect(ui, what).toEqual(document);
}

function readinessEnum(): string[] {
  return openapi.components.schemas.TestDto.properties.readiness.enum;
}

function conflictCodesOf(pathKey: string, method: string): string[] {
  return openapi.paths[pathKey][method].responses['409']['x-conflict-codes'];
}

describe('STUDIO-OBS-012B: the readiness vocabulary is read from the document, never transcribed', () => {
  it('TestDto.readiness matches the runtime carrier in both directions', () => {
    const declared = readinessEnum();
    expect(declared.length).toBeGreaterThan(0);
    assertSameSet(declared, TEST_READINESS_VALUES, 'TestDto.readiness');
  });

  it('the tests-list chip words every declared readiness, each distinctly', () => {
    const declared = readinessEnum();
    assertSameSet(declared, Object.keys(READINESS), 'tests-list readiness chip');
    const labels = declared.map((state) => (READINESS as Record<string, { label: string }>)[state].label);
    expect(new Set(labels).size, 'two states render the same chip').toBe(labels.length);
  });

  it('LEARN_REQUIRED is the execute conflict a non-READY draft answers', () => {
    expect(conflictCodesOf('/tests/{id}/execute', 'post')).toContain('LEARN_REQUIRED');
  });
});

describe('story 10.11c: ADR-002 §21’s two properties, and the examples that carry them', () => {
  it("every getTest example validates against the schema getTest's 200 declares", () => {
    // §18.5: an example that does not validate is the decorative artefact §14.6 complains about.
    // This runs over the **document's own** examples rather than over the fixtures, which is the
    // half AC-25 adds — the fixture half is 10.10's and is below.
    // The schema is read from the operation, not named here: the single-path authoring contract
    // (STUDIO-OBS-015) answers `GET /tests/{id}` with `TestDetailDto` (`AuthoringStep` objects),
    // while `TestDto` stays the list projection, so naming either would test the wrong shape.
    const content = openapi.paths['/tests/{id}'].get.responses['200'].content['application/json'];
    const declaredRef: string = content.schema.$ref;
    expect(declaredRef, 'getTest 200 declares a component schema').toMatch(
      /^#\/components\/schemas\/[A-Za-z]+$/,
    );
    const validate = componentValidator(declaredRef.split('/').pop() as string);
    const examples: Record<string, { value: unknown }> = content.examples;

    expect(Object.keys(examples).length, 'getTest declares no examples to validate').toBeGreaterThan(
      0,
    );
    for (const [name, example] of Object.entries(examples)) {
      expect(validate(example.value), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('declares the confirmed artifact pair on TestDto and nulls it on the list projection', () => {
    const declared = declaredPropertiesOf('TestDto');
    expect(declared).toContain('confirmedRevisionArtifactHash');
    expect(declared).toContain('confirmedRevisionArtifact');
    expect(requiredPropertiesOf('TestDto')).not.toContain('confirmedRevisionArtifactHash');
    expect(requiredPropertiesOf('TestDto')).not.toContain('confirmedRevisionArtifact');

    // The list projection's omission is **declared** rather than discovered (§16.5's precedent).
    const listDescription: string = openapi.paths['/tests'].get.description;
    expect(listDescription).toContain('confirmedRevisionArtifact');
    expect(listDescription).toContain('confirmedRevisionArtifactHash');
    expect(listDescription).toMatch(/always `null` on/u);
  });
});

/**
 * STUDIO-OBS-008 inherited obligation item g2. Before this, the harness validated fixtures and the
 * document's own examples, so a handler could drift from the contract without a red test. The body a
 * handler returns for `getTest`, `createTest` and `updateTest` must validate against the schema that
 * operation's success response declares. That schema is read from the operation's `$ref` and never
 * named here, and the payloads are the landed shared contract fixtures
 * (`docs/specs/studio/examples/context-authoring-valid.json`), not hand-written ones.
 */
describe('STUDIO-OBS-008 g2: authoring handler bodies validate against the declared schemas', () => {
  const ORIGIN = 'http://localhost/api/v1/studio';
  beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    studioMockServer.resetHandlers();
    resetStudioMocks();
  });
  afterAll(() => studioMockServer.close());

  /** The component schema a declared `application/json` schema `$ref`s, as a validator. */
  const validatorFor = (declared: { $ref?: string } | undefined, what: string) => {
    expect(declared?.$ref, `${what} declares a component schema`).toMatch(/^#\/components\/schemas\/[A-Za-z]+$/u);
    return componentValidator((declared!.$ref as string).split('/').pop() as string);
  };
  const successSchema = (route: string, method: string, status: string) =>
    openapi.paths[route][method].responses[status].content['application/json'].schema;
  const requestSchema = (route: string, method: string) =>
    openapi.paths[route][method].requestBody.content['application/json'].schema;

  const validCases = (
    JSON.parse(fs.readFileSync(path.join(SPEC_DIR, 'examples', 'context-authoring-valid.json'), 'utf8')) as {
      cases: Array<{ name: string; request?: { authoringSchemaVersion: 2; steps: unknown[] } }>;
    }
  ).cases.filter((candidate) => candidate.request !== undefined);

  const bodyOf = (request: unknown, extra: Record<string, unknown> = {}) => ({
    ...(request as object),
    name: 'Contract fixture',
    // The CSI the shared fixtures' evidence references name.
    csiId: '60406',
    environment: 'Production',
    variables: [],
    configuration: defaultConfiguration(),
    ...extra,
  });

  const send = (method: string, route: string, payload: unknown) =>
    fetch(`${ORIGIN}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('has landed fixture cases to run over, so the loop below is not vacuous', () => {
    expect(validCases.length).toBeGreaterThanOrEqual(5);
  });

  it('createTest and updateTest accept and answer as the document declares, for every landed valid case', async () => {
    const validateRequest = validatorFor(requestSchema('/tests', 'post'), 'createTest request');
    const validateCreated = validatorFor(successSchema('/tests', 'post', '201'), 'createTest 201');
    const validateSaved = validatorFor(successSchema('/tests/{id}', 'put', '200'), 'updateTest 200');
    const validateRead = validatorFor(successSchema('/tests/{id}', 'get', '200'), 'getTest 200');

    for (const { name, request } of validCases) {
      const payload = bodyOf(request);
      expect(validateRequest(payload), `${name} request: ${JSON.stringify(validateRequest.errors)}`).toBe(true);

      const created = await send('POST', '/tests', payload);
      expect(created.status, name).toBe(201);
      const createdBody = await created.json();
      expect(validateCreated(createdBody), `${name} createTest: ${JSON.stringify(validateCreated.errors)}`).toBe(true);

      const read = await (await fetch(`${ORIGIN}/tests/${createdBody.id}`)).json();
      expect(validateRead(read), `${name} getTest: ${JSON.stringify(validateRead.errors)}`).toBe(true);

      const saved = await send(
        'PUT',
        `/tests/${createdBody.id}`,
        bodyOf(request, {
          description: 'saved',
          sourceRevision: createdBody.sourceRevision,
          configurationRevision: createdBody.configurationRevision,
        }),
      );
      expect(saved.status, name).toBe(200);
      const savedBody = await saved.json();
      expect(validateSaved(savedBody), `${name} updateTest: ${JSON.stringify(validateSaved.errors)}`).toBe(true);
    }
  });

  it('getTest answers every fixture and readiness draft as the declared detail shape', async () => {
    const validateRead = validatorFor(successSchema('/tests/{id}', 'get', '200'), 'getTest 200');
    const drafts = [...mockTests, ...readinessDrafts].filter((test) => MOCK_READABLE_CSIS.includes(test.csiId!));
    expect(drafts.length).toBeGreaterThan(4);
    for (const test of drafts) {
      const response = await fetch(`${ORIGIN}/tests/${test.id}`);
      expect(response.status, test.id).toBe(200);
      const body = await response.json();
      expect(validateRead(body), `${test.id}: ${JSON.stringify(validateRead.errors)}`).toBe(true);
      expect(body.steps.map((step: { text: string }) => step.text), test.id).toEqual(test.steps);
    }
  });

  it('the composed guided mirror serves the guided video route: 403 for an unknown session, the recording for a started one', async () => {
    const unknown = await fetch(`${ORIGIN}/guided-sessions/00000000-0000-4000-8000-00000000f00d/video`);
    expect(unknown.status).toBe(403);
    expect((await unknown.json()).error).toBe('STUDIO_FORBIDDEN');

    const target = mockTests.find((test) => test.steps.length > 0 && MOCK_READABLE_CSIS.includes(test.csiId!))!;
    const capabilities = await (await fetch(`${ORIGIN}/tests/${target.id}/capabilities`)).json();
    expect(capabilities.guidedStart.available, 'the fixture draft can start a guided session').toBe(true);
    const started = await fetch(`${ORIGIN}/guided-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'contract-video-1' },
      body: JSON.stringify(capabilities.guidedStart.context),
    });
    expect(started.status).toBeLessThan(300);
    const sessionId = (await started.json()).session.sessionId as string;

    const video = await fetch(`${ORIGIN}/guided-sessions/${sessionId}/video`);
    expect(video.status).toBe(200);
    expect(video.headers.get('content-type')).toBe('video/webm');
    const ranged = await fetch(`${ORIGIN}/guided-sessions/${sessionId}/video`, { headers: { Range: 'bytes=0-9' } });
    expect(ranged.status).toBe(206);
  });

  it('a v1 write is refused with the declared error body, and the v1 body is not a valid TestRequest', async () => {
    const validateRequest = validatorFor(requestSchema('/tests', 'post'), 'createTest request');
    const validateRefusal = validatorFor(openapi.paths['/tests'].post.responses['400'].content['application/json'].schema, 'createTest 400');
    const v1 = {
      name: 'Old shape',
      csiId: MOCK_READABLE_CSIS[0],
      environment: 'Production',
      steps: ['Go to "https://www.citi.com"'],
      variables: [],
      configuration: defaultConfiguration(),
    };
    expect(validateRequest(v1), 'the contract must not admit a v1 body').toBe(false);

    const refused = await send('POST', '/tests', v1);
    expect(refused.status).toBe(400);
    const body = await refused.json();
    expect(validateRefusal(body), JSON.stringify(validateRefusal.errors)).toBe(true);
    expect(body.error).toBe('INVALID_AUTHORING');
  });
});

/**
 * PO ruling 2026-10-13 (STUDIO-OBS-012B): `confirmedRevisionArtifact` is declared opaque in the
 * public document, whose description names its normative schema — the observed
 * `contracts/v3/replay-artifact.schema.json`. Every non-null fixture is validated against that
 * schema here. The v3 schemas are draft-07, so they load into a draft-07 Ajv instance; the document
 * itself is still parsed once, above.
 */
const V3_DIR = path.resolve(SPEC_DIR, '../studio-observed-authoring/contracts/v3');
const REPLAY_ARTIFACT_ID = 'https://checks.citi.example/contracts/observed/v3/replay-artifact.schema.json';

function replayArtifactValidator() {
  const v3 = new AjvDraft07({ strict: false, allErrors: true, logger: false });
  for (const file of fs.readdirSync(V3_DIR).filter((name) => name.endsWith('.schema.json'))) {
    v3.addSchema(JSON.parse(fs.readFileSync(path.join(V3_DIR, file), 'utf8')));
  }
  const validate = v3.getSchema(REPLAY_ARTIFACT_ID);
  expect(validate, 'contracts/v3 no longer publishes replay-artifact.schema.json').toBeDefined();
  return validate!;
}

describe('STUDIO-OBS-012B: every published artifact fixture is the v3 replay artifact', () => {
  it('every non-null confirmedRevisionArtifact fixture validates against contracts/v3/replay-artifact.schema.json', () => {
    // The document names the schema; the join is checked here rather than assumed.
    expect(
      openapi.components.schemas.TestDto.properties.confirmedRevisionArtifact.description,
    ).toContain('contracts/v3/replay-artifact.schema.json');
    const validate = replayArtifactValidator();
    const fixtures = [...mockTests, ...readinessDrafts, ...demoTests].filter(
      (test) => test.confirmedRevisionArtifact != null,
    );
    expect(fixtures.length, 'no fixture carries a published artifact to check').toBeGreaterThan(0);
    for (const test of fixtures) {
      expect(validate(test.confirmedRevisionArtifact), `${test.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
    // And the validator discriminates: an artifact-1 shape is not a replay artifact.
    expect(validate({ version: 1, steps: [{ stepIndex: 0, originalText: 'x', code: 'y' }] })).toBe(false);
  });
});

describe('STUDIO-OBS-012B: the readiness fixtures match the contract', () => {
  it('every readiness fixture validates against TestDto', () => {
    const validate = componentValidator('TestDto');
    for (const test of readinessDrafts) {
      expect(validate(test), `${test.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('no readiness fixture carries a field the contract does not declare', () => {
    const declared = declaredPropertiesOf('TestDto');
    for (const test of readinessDrafts) {
      for (const field of Object.keys(test)) {
        expect(declared, `${test.id} has undeclared field ${field}`).toContain(field);
      }
    }
  });
});

/**
 * Story 10.11a — the execution vocabularies, read from the document through the **same** binding
 * (ADR-002 §18.3, O-12).
 *
 * §18.3 assigns O-12 here as *"a requirement rather than a note"*: *"generate the union from this
 * document or assert it against this document."* It also says which mechanism to use — *"install
 * the document-reading assertion once, and the other should extend it rather than write a second
 * one"* — so these assertions use the {@link assertSameSet} helper and the `openapi` binding
 * already parsed at the top of this file. **No second `parseYaml` of this document is added.**
 * That constraint is a review constraint and not a guard, and it is recorded as such in the story
 * rather than dressed as a criterion: nothing in this suite can fail because someone added one.
 *
 * The expected value is **never** imported from `studioTypes.ts`. An expected value read out of
 * the module under test is VAC-11, the shape @qa measured on story 10.10 — where blanking seven
 * required facts left the whole suite green — and AC-5 is the assertion it is most naturally
 * written into, because the nearest list of eight strings lives in the file being checked.
 */

/**
 * The document's error-code vocabulary, as a function of a parsed document.
 *
 * Parameterised on purpose. A reader that ignores its argument and returns a literal is the
 * catalogued *"pinned copy whose provenance nothing checks"*, and the only way to tell the two
 * apart is to hand it a document that says something different and see whether the answer changes.
 * `PROV-ERRCODE` below does exactly that.
 */
function executionErrorCodesOf(document: any): string[] {
  const declared: unknown[] = document.components.schemas.ExecutionErrorCode.enum;
  return declared.filter((value): value is string => typeof value === 'string');
}

function executionErrorCodeEnum(): string[] {
  return executionErrorCodesOf(openapi);
}

describe('story 10.11a: the terminal error vocabulary is asserted against the document (O-12)', () => {
  it('ExecutionErrorCode matches the runtime carrier in both directions', () => {
    const declared = executionErrorCodeEnum();
    expect(declared.length).toBeGreaterThan(0);

    // The carrier, not the type: a TypeScript union is erased at run time, which is precisely why
    // the drift ADR-002 §15.5 records went unnoticed through two stories.
    assertSameSet(declared, EXECUTION_ERROR_CODES, 'ExecutionErrorCode');
  });

  it('every declared code has a rendered narrative, and every narrative a declared code', () => {
    // A union asserted and unconsumed reproduces §15.5's own diagnosis — the drift was invisible
    // *because nothing narrowed on it* — one layer up.
    assertSameSet(
      executionErrorCodeEnum(),
      Object.keys(EXECUTION_ERROR_NARRATIVES),
      'ExecutionErrorCode narratives',
    );

    const titles = executionErrorCodeEnum().map((code) => executionErrorNarrative(code).title);
    expect(new Set(titles).size, 'two codes render the same name').toBe(titles.length);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(10);
    }
  });

  it('a code outside the document is an error rather than a generic failure', () => {
    expect(() => executionErrorNarrative('SOMETHING_ELSE')).toThrow(/Unknown ExecutionErrorCode/);
  });

  it('[PROV-ERRCODE] the expectation is read from the document rather than transcribed', () => {
    /*
     * The provenance guard AC-5's fourth falsification names. Replacing the document read with an
     * in-test literal of the eight values leaves every assertion above green — the expectation and
     * the carrier would agree because both were written by the same hand — so the only thing that
     * can tell a reader apart from a literal is whether its answer follows its argument.
     *
     * The real document is never edited. A structurally identical copy is, which is the same
     * instrument AC-1 and AC-4 use for their "a sixth member" falsifications.
     */
    const asDeclared = structuredClone(openapi);
    asDeclared.components.schemas.ExecutionErrorCode.enum = ['ONLY_THIS_ONE', null];
    expect(
      executionErrorCodesOf(asDeclared),
      'the reader ignored the document it was handed, so it is a literal wearing a function',
    ).toEqual(['ONLY_THIS_ONE']);

    // And it is genuinely reading the file this suite parsed, not a copy of its own.
    expect(executionErrorCodeEnum()).toEqual(
      openapi.components.schemas.ExecutionErrorCode.enum.filter(
        (value: unknown) => typeof value === 'string',
      ),
    );

    // The nulls the document declares are not members of the union; they are the absence of one.
    expect(openapi.components.schemas.ExecutionErrorCode.enum).toContain(null);
    expect(executionErrorCodeEnum()).not.toContain(null);
  });
});

describe('story 10.11a: the execute route’s refusals are read from the document', () => {
  it("execute's conflict codes match the UI's, in both directions", () => {
    const declared = conflictCodesOf('/tests/{id}/execute', 'post');
    expect(declared.length).toBeGreaterThan(0);
    assertSameSet(declared, EXECUTE_CONFLICT_KEYS, 'executeTest x-conflict-codes');
  });

  it('every execute refusal names who clears it, and the two definite ones offer no retry', () => {
    // ADR-002 §14.3 puts `TEST_DELETED` and `TEST_QUARANTINED` on the not-retriable side, and the
    // `tests` tag's own table is where the remedy owners come from.
    for (const code of conflictCodesOf('/tests/{id}/execute', 'post')) {
      const narrative = EXECUTE_CONFLICT_NARRATIVES[code];
      expect(narrative, `${code} has no narrative`).toBeDefined();
      expect(narrative.whoClearsIt.trim().length, `${code} does not say who clears it`).toBeGreaterThan(
        30,
      );
    }
    expect(EXECUTE_CONFLICT_NARRATIVES.TEST_DELETED.callerCanRetry).toBe(false);
    expect(EXECUTE_CONFLICT_NARRATIVES.TEST_QUARANTINED.callerCanRetry).toBe(false);
  });

  it('the 429 and 503 narratives exist without borrowing a code the document only exemplifies', () => {
    // §14.6: an example is not assertable. `DISPATCH_DISABLED` reaches the document only as one,
    // so it is not a key here — which is what this asserts.
    expect(Object.keys(EXECUTE_CONFLICT_NARRATIVES)).not.toContain('DISPATCH_DISABLED');
    expect(executeRefusalFor(429, null)).toBe(QUOTA_EXHAUSTED_NARRATIVE);
    expect(executeRefusalFor(503, null)).toBe(EXECUTION_DISABLED_NARRATIVE);
    expect(executeRefusalFor(503, 'DISPATCH_DISABLED')).toBe(EXECUTION_DISABLED_NARRATIVE);
    expect(EXECUTION_DISABLED_NARRATIVE.scope).toBe('platform');
    expect(QUOTA_EXHAUSTED_NARRATIVE.scope).toBe('quota');
  });
});

/**
 * STUDIO-OBS-012B AC-3 — **no handler for a route that no longer exists; every surviving public
 * route has a handler** (PO ruling 2026-10-13, `docs/qa/evidence/STUDIO-OBSERVED-NEXT/
 * po-ruling-012B-allowlist.json`, P1–P6).
 *
 * P1: *public* is every operation in the document without `x-internal: true`, derived here at test
 * time and never transcribed. P2/P3: every public operation has a composed studio MSW handler or a
 * PO-ruled allowlist entry, and every studio MSW handler maps to a documented public operation.
 * P4: an entry whose operation has gained a handler, left the document or turned internal fails as
 * stale. P5: the allowlist is this closed literal, keyed by `operationId`, outside the module under
 * test. A new uncovered public operation with no PO-ruled entry fails closed.
 *
 * Contract steps: the class-A guided-session video operation (`getGuidedSessionVideo`) landed with
 * contract step C1 (STUDIO-OBS-013) during STUDIO-OBS-012B's run and is entered below. The five
 * class-C OBS-014 guided-policy operations were entered at the post-C2b re-run and removed with the
 * governed policy itself (STUDIO-GOV-001.3).
 */
type AllowlistClass = 'A' | 'B' | 'C';
interface AllowlistEntry {
  readonly class: AllowlistClass;
  readonly owner: string;
  readonly reason: string;
}

const UNCOVERED_PUBLIC_OPERATIONS: Readonly<Record<string, AllowlistEntry>> = {
  // Class A — empty. STUDIO-OBS-008 composed the guided, capability and secrets mirrors at F1 and
  // removed its ten entries; `getStudioTestCapabilities` was never allowlisted.
  // Class B — permanent: the stream route's contract-checked mirror is the 10.11b scripted
  // transport, whose frames are validated against ExecutionSnapshot in this file.
  streamExecution: { class: 'B', owner: 'story 10.11b scripted transport', reason: 'text/event-stream; mirrored by executionScenarios.ts, not by an MSW handler' },
};

const STUDIO_HANDLER_BASE = '*/api/v1/studio';
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

/** `/tests/{id}` and `/tests/:id` both become `/tests/:_`, so the two spellings compare equal. */
function routeKey(method: string, route: string): string {
  return `${method.toUpperCase()} ${route.replace(/\{[^}]+\}/gu, ':_').replace(/:[A-Za-z_]\w*/gu, ':_')}`;
}

/** The slice of a parsed OpenAPI document the coverage check reads. */
interface OperationDocument {
  paths: Record<string, Record<string, { operationId?: string; 'x-internal'?: boolean } | undefined>>;
}

interface DocumentOperation {
  readonly operationId: string;
  readonly key: string;
  readonly internal: boolean;
}

/** P1 — read from a parsed document, never transcribed. */
function operationsOf(document: OperationDocument): DocumentOperation[] {
  const operations: DocumentOperation[] = [];
  for (const [route, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation) continue;
      operations.push({
        operationId: operation.operationId ?? '',
        key: routeKey(method, route),
        internal: operation['x-internal'] === true,
      });
    }
  }
  return operations;
}

/** Every composed studio MSW handler as a route key, read from the handlers themselves. */
function handlerKeysOf(handlers: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const handler of handlers) {
    const info = (handler as { info?: { method?: unknown; path?: unknown } }).info;
    const method = typeof info?.method === 'string' ? info.method : '';
    const route = typeof info?.path === 'string' ? info.path : String(info?.path ?? '');
    keys.push(
      route.startsWith(STUDIO_HANDLER_BASE)
        ? routeKey(method, route.slice(STUDIO_HANDLER_BASE.length))
        : `${method.toUpperCase()} ${route}`,
    );
  }
  return keys;
}

/** P2, P3 and P4 over one document and one handler set; returns every violation it finds. */
function handlerCoverageViolations(
  document: OperationDocument,
  handlerKeys: readonly string[],
  allowlist: Readonly<Record<string, AllowlistEntry>>,
): string[] {
  const operations = operationsOf(document);
  const publicOperations = operations.filter((operation) => !operation.internal);
  const handled = new Set(handlerKeys);
  const publicKeys = new Set(publicOperations.map((operation) => operation.key));
  const violations: string[] = [];

  for (const operation of publicOperations) {
    if (!handled.has(operation.key) && !(operation.operationId in allowlist)) {
      violations.push(`P2: public ${operation.operationId} (${operation.key}) has no MSW handler and no PO-ruled allowlist entry`);
    }
  }
  for (const key of new Set(handlerKeys)) {
    if (!publicKeys.has(key)) {
      violations.push(`P3: MSW handler ${key} maps to no public operation in openapi.yaml`);
    }
  }
  for (const [operationId, entry] of Object.entries(allowlist)) {
    const operation = operations.find((candidate) => candidate.operationId === operationId);
    if (!operation) {
      violations.push(`P4: allowlist entry ${operationId} (class ${entry.class}) is stale — the operation left the document; remove the entry`);
    } else if (operation.internal) {
      violations.push(`P4: allowlist entry ${operationId} (class ${entry.class}) is stale — the operation is x-internal; remove the entry`);
    } else if (handled.has(operation.key)) {
      violations.push(`P4: allowlist entry ${operationId} (class ${entry.class}) is stale — it has a handler now; remove the entry`);
    }
  }
  return violations;
}

describe('STUDIO-OBS-012B AC-3: every public operation has an MSW handler or a PO-ruled entry', () => {
  it('derives the public operations from the document, so the check has something to cover', () => {
    const publicOperations = operationsOf(openapi).filter((operation) => !operation.internal);
    expect(publicOperations.length).toBeGreaterThanOrEqual(20);
    expect(publicOperations.map((operation) => operation.operationId)).toContain('validateTestVariables');
    expect(handlerKeysOf(studioHandlers).length).toBeGreaterThan(10);
  });

  it('no handler for a route that no longer exists; every surviving public route has a handler', () => {
    expect(handlerCoverageViolations(openapi, handlerKeysOf(studioHandlers), UNCOVERED_PUBLIC_OPERATIONS)).toEqual([]);
  });

  it('every allowlist entry carries a class, an owner and a reason', () => {
    for (const [operationId, entry] of Object.entries(UNCOVERED_PUBLIC_OPERATIONS)) {
      expect(['A', 'B', 'C'], operationId).toContain(entry.class);
      expect(entry.owner.trim().length, operationId).toBeGreaterThan(0);
      expect(entry.reason.trim().length, operationId).toBeGreaterThan(10);
    }
  });

  it('fails closed: a new public operation with no handler and no entry is reported', () => {
    const amended = structuredClone(openapi);
    amended.paths['/tests/{id}/hypothetical'] = { get: { operationId: 'hypotheticalRead', responses: {} } };
    expect(
      handlerCoverageViolations(amended, handlerKeysOf(studioHandlers), UNCOVERED_PUBLIC_OPERATIONS),
    ).toEqual([expect.stringMatching(/^P2: public hypotheticalRead/u)]);
  });
});

describe('story 10.11a: the run gate covers the readiness states the document declares', () => {
  it('every readiness maps to a Run mode, and exactly one of them replays', () => {
    const declared = readinessEnum();
    expect(declared.length).toBeGreaterThan(0);

    assertSameSet(declared, Object.keys(RUN_MODE), 'run mode over readiness');

    const replaying = declared.filter((state) => runModeFor(state) === 'replay');
    expect(replaying, 'more or fewer than one state replays without learning').toEqual([
      EXECUTABLE_READINESS,
    ]);
  });

  it('every other declared state learns, relearns or keeps Run off', () => {
    const declared = readinessEnum();
    const notReplay = declared.filter((state) => runModeFor(state) !== 'replay');
    expect(notReplay.slice().sort()).toEqual(
      declared.filter((state) => state !== EXECUTABLE_READINESS).slice().sort(),
    );
    for (const state of notReplay) {
      expect(['learn', 'relearn', 'busy'], state).toContain(runModeFor(state));
    }
  });

  it('a readiness outside the document is an error rather than a permissive default', () => {
    expect(() => runModeFor('SOMETHING_ELSE')).toThrow(/Unknown readiness/);
  });
});

/**
 * STUDIO-OBS-008 AC-1 (W5-5): "every guided route has a client method". The handler half is P2 above.
 * The operations are derived from the document; the closed literal below names the one
 * `studioGuidedApi` member each is sent through, so a route with no member, or a member for a route
 * the document no longer has, turns this red.
 */
const GUIDED_CLIENT_METHOD: Readonly<Record<string, keyof typeof studioGuidedApi>> = {
  startGuidedSession: 'startSession',
  readGuidedSession: 'readSession',
  readGuidedResult: 'readResult',
  readGuidedClarification: 'readClarification',
  clarifyGuidedSession: 'clarify',
  cancelGuidedSession: 'cancel',
  finalizeObservedPublication: 'finalize',
  getGuidedSessionVideo: 'videoPath',
  readLatestGuidedAttempts: 'readLatestAttempts',
};

describe('STUDIO-OBS-008 AC-1: every guided route has a client method', () => {
  it('STUDIO-OBS-008 AC-1: every public operation under /guided-sessions maps to a studioGuidedApi member, and the map has no stale entry (W5-5)', () => {
    const guidedPaths = Object.entries((openapi as OperationDocument).paths).filter(([route]) =>
      route.startsWith('/guided-sessions'),
    );
    const derived: string[] = [];
    for (const [, item] of guidedPaths) {
      for (const method of HTTP_METHODS) {
        const operation = item[method];
        if (operation && operation['x-internal'] !== true) derived.push(operation.operationId ?? '');
      }
    }
    // D-2: eight public guided operations, and the ninth added by STUDIO-UNIFY-001.6 (AC-10).
    expect(derived).toHaveLength(9);
    assertSameSet(derived, Object.keys(GUIDED_CLIENT_METHOD), 'guided operation → client method');
    for (const [operationId, member] of Object.entries(GUIDED_CLIENT_METHOD)) {
      expect(typeof studioGuidedApi[member], `${operationId} → studioGuidedApi.${String(member)}`).toBe('function');
    }
  });
});

describe('story 10.11a: the execution corpus matches the contract', () => {
  it('every 10.11a execution fixture validates against the snapshot schema', () => {
    const validate = componentValidator('ExecutionSnapshot');
    expect(executionCorpus.length).toBeGreaterThan(10);
    for (const execution of executionCorpus) {
      expect(validate(execution), `${execution.executionId}: ${JSON.stringify(validate.errors)}`)
        .toBe(true);
    }
  });

  it('no 10.11a execution fixture carries a field the contract does not declare', () => {
    const declared = declaredPropertiesOf('ExecutionSnapshot');
    for (const execution of executionCorpus) {
      for (const field of Object.keys(execution)) {
        expect(declared, `${execution.executionId} has undeclared field ${field}`).toContain(field);
      }
    }
  });
});

/**
 * Story 10.11b — **AC-17**. Every scripted transport frame is validated against the document's own
 * `ExecutionSnapshot`, through the harness this file already has. No second Ajv instance and no
 * second parse of `openapi.yaml`: ADR-002 §18.3 — *"install the document-reading assertion once,
 * and the other should extend it rather than write a second one."*
 */
describe('story 10.11b: the scripted transport frames match the contract', () => {
  it('every scenario frame validates against ExecutionSnapshot', () => {
    const validate = componentValidator('ExecutionSnapshot');
    expect(ALL_SCENARIO_FRAMES.length).toBeGreaterThan(0);
    for (const frame of ALL_SCENARIO_FRAMES) {
      expect(
        validate(frame),
        `revision ${frame.revision}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });

  it('every scenario frame carries every required field and nothing the contract does not declare', () => {
    const required = requiredPropertiesOf('ExecutionSnapshot');
    const declared = declaredPropertiesOf('ExecutionSnapshot');
    expect(required.length).toBeGreaterThan(0);

    for (const frame of ALL_SCENARIO_FRAMES) {
      for (const field of required) {
        expect(
          Object.prototype.hasOwnProperty.call(frame, field),
          `revision ${frame.revision} is missing ${field}`,
        ).toBe(true);
      }
      for (const field of Object.keys(frame)) {
        expect(declared, `revision ${frame.revision} has undeclared field ${field}`).toContain(
          field,
        );
      }
    }
  });
});

/**
 * STUDIO-OBS-008 T0 ruling A1 — `ExecutionSnapshot.replayFailure`.
 *
 * The enum is read from the document and compared with the UI's set in both directions, the three
 * snapshots are compared field for field with the document's own `getExecution` examples, and one
 * negative fixture proves the schema's `if/then/else` actually discriminates: a `TARGET_DRIFT`
 * carrying `loginStepsPresent` is refused, which a validator that ignored the `allOf` would pass.
 */
describe('STUDIO-OBS-008 A1: replayFailure is the document’s, in the types, the fixtures and the handlers', () => {
  const ORIGIN = 'http://localhost/api/v1/studio';
  beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    studioMockServer.resetHandlers();
    resetStudioMocks();
  });
  afterAll(() => studioMockServer.close());

  const examples = (): Record<string, { value: unknown }> => openapi.components.examples;
  const EXAMPLE_NAMES = {
    loginRequiredNoLoginSteps: 'SnapshotLoginRequiredNoLoginSteps',
    loginRequiredLoginStepsFailed: 'SnapshotLoginRequiredLoginStepsFailed',
    targetDrift: 'SnapshotTargetDrift',
  } as const;
  const STEP_ID = '00000000-0000-4000-8000-000000000002';

  it('REPLAY_FAILURE_CODES equals ReplayFailure.code in the document, in both directions', () => {
    assertSameSet(
      openapi.components.schemas.ReplayFailure.properties.code.enum,
      REPLAY_FAILURE_CODES,
      'ReplayFailure.code',
    );
  });

  it('ExecutionSnapshot declares replayFailure as the ReplayFailure component and does not require it', () => {
    expect(declaredPropertiesOf('ExecutionSnapshot')).toContain('replayFailure');
    expect(requiredPropertiesOf('ExecutionSnapshot')).not.toContain('replayFailure');
    expect(openapi.components.schemas.ExecutionSnapshot.properties.replayFailure.$ref).toBe(
      '#/components/schemas/ReplayFailure',
    );
  });

  it('the three snapshots equal the document’s three getExecution examples, and are referenced by it', () => {
    const referenced = Object.values(
      openapi.paths['/executions/{id}'].get.responses['200'].content['application/json'].examples as Record<
        string,
        { value: { $ref: string } }
      >,
    ).map((example) => example.value.$ref);
    for (const [name, exampleName] of Object.entries(EXAMPLE_NAMES)) {
      expect(referenced, `${name}: getExecution does not reference its example`).toContain(
        `#/components/examples/${exampleName}/value`,
      );
      expect(examples()[exampleName], `${exampleName} is missing from the document`).toBeDefined();
      expect(replayFailureExecutions[name as keyof typeof EXAMPLE_NAMES], name).toEqual(
        examples()[exampleName].value,
      );
    }
  });

  it('the three snapshots cover both codes and both loginStepsPresent values, and each stops at a FAIL step', () => {
    const failures = Object.values(replayFailureExecutions).map((execution) => execution.replayFailure);
    expect(failures.map((failure) => failure?.code).sort()).toEqual(['LOGIN_REQUIRED', 'LOGIN_REQUIRED', 'TARGET_DRIFT']);
    const logins = failures.filter((failure) => failure?.code === 'LOGIN_REQUIRED');
    expect(logins.map((failure) => (failure as { loginStepsPresent: boolean }).loginStepsPresent).sort()).toEqual([false, true]);
    for (const execution of Object.values(replayFailureExecutions)) {
      const failure = execution.replayFailure!;
      expect(execution.stepResults[failure.stepIndex].status, execution.executionId).toBe('FAIL');
      expect(execution.errorCode, 'an API-assigned cause always wins, so errorCode is null here').toBeNull();
    }
    // The drift snapshot arrives as ERROR with no code: the UI must key on replayFailure, not status.
    expect(replayFailureExecutions.targetDrift.status).toBe('ERROR');
  });

  it('accepts replayFailure absent or null, and refuses malformed ones, so the schema discriminates', () => {
    const validate = componentValidator('ExecutionSnapshot');
    const base = replayFailureExecutions.targetDrift;
    const without = { ...base } as Record<string, unknown>;
    delete without.replayFailure;
    expect(validate(without), `absent: ${JSON.stringify(validate.errors)}`).toBe(true);
    expect(validate(base), `drift: ${JSON.stringify(validate.errors)}`).toBe(true);
    // The description says null and absent mean the same, so null is valid too.
    expect(validate({ ...base, replayFailure: null }), `null: ${JSON.stringify(validate.errors)}`).toBe(true);

    const refused = (replayFailure: unknown) => validate({ ...base, replayFailure });
    // The one negative fixture the ruling names: TARGET_DRIFT with loginStepsPresent.
    expect(refused({ code: 'TARGET_DRIFT', stepId: STEP_ID, stepIndex: 1, loginStepsPresent: true })).toBe(false);
    expect(refused({ code: 'LOGIN_REQUIRED', stepId: STEP_ID, stepIndex: 1 })).toBe(false);
    expect(refused({ code: 'SOMETHING_ELSE', stepId: STEP_ID, stepIndex: 1 })).toBe(false);
    expect(refused({ code: 'TARGET_DRIFT', stepId: STEP_ID, stepIndex: -1 })).toBe(false);
    expect(refused({ code: 'TARGET_DRIFT', stepId: STEP_ID, stepIndex: 1, message: 'page text' })).toBe(false);
  });

  it('the scripted replay-failure runs end in the document example and name no cause before they end', () => {
    for (const [name, frames] of Object.entries(REPLAY_FAILURE_SCENARIOS)) {
      expect(frames.length, name).toBe(3);
      const [pending, running, terminal] = frames;
      expect([pending.status, running.status], name).toEqual(['PENDING', 'RUNNING']);
      expect(terminal, name).toBe(replayFailureExecutions[name as keyof typeof EXAMPLE_NAMES]);
      for (const earlier of [pending, running]) {
        expect(earlier.replayFailure ?? null, `${name}: a non-terminal snapshot names no cause`).toBeNull();
        expect(earlier.streamComplete, name).toBe(false);
      }
      const revisions = frames.map((frame) => frame.revision);
      expect(revisions, name).toEqual([...revisions].sort((a, b) => a - b));
    }
  });

  it('GET /executions/{id} and the history list serve all three, with replayFailure intact', async () => {
    const validate = componentValidator('ExecutionSnapshot');
    for (const execution of Object.values(replayFailureExecutions)) {
      const served = await studioApi.getExecution(execution.executionId);
      // The server adds the live test's name to a read (`testName`); nothing else differs.
      const testName = mockTests.find((test) => test.id === execution.testId)!.name;
      expect(served, execution.executionId).toEqual({ ...execution, testName });
      expect(validate(served), JSON.stringify(validate.errors)).toBe(true);
    }
    const listed = (await studioApi.listExecutions({ size: 100 })).data;
    for (const execution of Object.values(replayFailureExecutions)) {
      expect(listed.find((item) => item.executionId === execution.executionId)?.replayFailure).toEqual(
        execution.replayFailure,
      );
    }
    const response = await fetch(`${ORIGIN}/executions/${replayFailureExecutions.targetDrift.executionId}`);
    expect(response.status).toBe(200);
  });
});

/**
 * Story 10.11a, @qa repair — **VAC-18: a coverage matrix whose required set is an editable
 * literal.**
 *
 * @qa deleted one run-gate state from `EXECUTION_FIXTURE_MATRIX` and the suite stayed
 * **green**: the matrix's own `it.each` rows vanish rather than fail, nothing read the total, and
 * its non-vacuity floor was `>= 20` against an actual 26 — so four required shapes could disappear
 * without a single assertion noticing. Two of its three families were transcribed literals.
 *
 * It is story 10.10's matrix finding one layer further out. There the per-entry predicate was
 * tautological; here the *required set itself* was editable, which is worse, because a tautological
 * predicate at least still runs.
 *
 * The repair lives here rather than in the matrix's own file, for §18.3's reason: this is where the
 * parsed document and `assertSameSet` already are, and a second copy of either is the arrangement
 * that produced INT-4. The ids the document **can** name are derived from its vocabularies; the
 * ones it cannot are pinned **in this file**, outside the module they check, because an expected
 * value read out of the thing under test is VAC-11.
 */

/**
 * The required shapes no declared vocabulary names.
 *
 * Each is a *situation* rather than a member of an enum — a step failure with a skipped tail, a log
 * array at its cap, a body whose prose contradicts its code — so there is nothing in `openapi.yaml`
 * to derive them from and a pin is the honest instrument. They are pinned here, in the test, and
 * never imported from `executionFixtures.ts`.
 */
const STANDALONE_REQUIRED_FIXTURE_IDS: readonly string[] = [
  'FX-ERRCODE-NULL',
  'FX-STEP-FAIL-SKIPPED-TAIL',
  'FX-LOGS-TRUNCATED-AT-CAP',
  'FX-LOGS-COMPLETE',
  'FX-EXECUTE-409-CONTRADICTORY',
  'FX-EXECUTE-409-UNDECLARED',
  'FX-EXECUTE-429',
  'FX-EXECUTE-503',
];

describe('story 10.11a: [VAC-18] the AC-22 required set is the document’s, not an editable literal', () => {
  it('the matrix ids are exactly the ids the document’s vocabularies imply, in both directions', () => {
    const fromDocument = [
      ...readinessEnum().map((state) => `FX-RUNGATE-STATE-${state}`),
      ...executionErrorCodeEnum().map((code) => `FX-ERRCODE-${code}`),
      ...conflictCodesOf('/tests/{id}/execute', 'post').map((code) => `FX-EXECUTE-409-${code}`),
      ...STANDALONE_REQUIRED_FIXTURE_IDS,
    ];
    // Without this the comparison could be empty against empty.
    expect(fromDocument.length).toBeGreaterThanOrEqual(26);

    assertSameSet(
      fromDocument,
      EXECUTION_FIXTURE_MATRIX.map((entry) => entry.id),
      'EXECUTION_FIXTURE_MATRIX ids',
    );
  });

  it('the matrix carries one entry per required id and no duplicates, counted rather than sampled', () => {
    // The half @qa found missing: nothing read the total. A vanished `it.each` row is now a
    // count that does not match, not an absence nobody looks for.
    const ids = EXECUTION_FIXTURE_MATRIX.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(
      readinessEnum().length +
        executionErrorCodeEnum().length +
        conflictCodesOf('/tests/{id}/execute', 'post').length +
        STANDALONE_REQUIRED_FIXTURE_IDS.length,
    );
  });
});

/**
 * Story 10.11a, @qa repair — **the timeout the page sends, which nothing guarded.**
 *
 * `timeoutSeconds` appeared in **zero** test files. The value the page sent was `30000` for the
 * whole life of the code: the legacy `TestIR` recorded a millisecond timeout and `toConfiguration`
 * carried it into a field the contract declares in **seconds**, capped at **120**. @qa checked the
 * other end and it is worse than a range violation — the request DTO guards only `<= 0`, no upper
 * bound exists anywhere in `studio/dto/`, and the dispatcher computes `timeoutSeconds * 1000L`,
 * which makes `30000` an **8 hour 20 minute** runtime budget.
 *
 * Retiring the legacy IR from the page's save path fixed it as a side effect. That is a latent
 * product defect fixed rather than a regression — and it is guarded now, because the fix was
 * unguarded and a value that was wrong for years can be wrong again.
 *
 * The bound is **read from the document**, never transcribed: a contract that raises its cap should
 * relax this assertion by itself, and a story that lowers the cap should turn it red.
 */
describe('story 10.11a: the configured timeout is inside the bound the contract declares', () => {
  function timeoutBound(): { minimum: number; maximum: number } {
    const schema = openapi.components.schemas.TestConfiguration.properties.timeoutSeconds;
    expect(typeof schema.minimum, 'TestConfiguration.timeoutSeconds declares no minimum').toBe(
      'number',
    );
    expect(typeof schema.maximum, 'TestConfiguration.timeoutSeconds declares no maximum').toBe(
      'number',
    );
    return { minimum: schema.minimum, maximum: schema.maximum };
  }

  it('the declared bound is narrow enough for the old value to violate it', () => {
    // The negative control. If the document declared no maximum, or one above 30000, every
    // assertion below would hold for the defect this guard exists to catch.
    const { minimum, maximum } = timeoutBound();
    expect(maximum).toBeLessThan(30000);
    expect(minimum).toBeGreaterThan(0);
  });

  it('defaultConfiguration() is inside it, and validates against TestConfiguration', () => {
    const { minimum, maximum } = timeoutBound();
    const configuration = defaultConfiguration();
    expect(configuration.timeoutSeconds).toBeGreaterThanOrEqual(minimum);
    expect(configuration.timeoutSeconds).toBeLessThanOrEqual(maximum);

    const validate = componentValidator('TestConfiguration');
    expect(validate(configuration), JSON.stringify(validate.errors)).toBe(true);
  });

  it('the legacy millisecond value would be caught by this schema, so the check discriminates', () => {
    const validate = componentValidator('TestConfiguration');
    expect(validate({ ...defaultConfiguration(), timeoutSeconds: 30000 })).toBe(false);
  });
});

/**
 * Story 10.16a — **AC-1**. The evidence vocabulary, asserted against the document through the
 * **same** {@link assertSameSet} and the same parsed `openapi` binding (ADR-002 §18.3: *"the other
 * should extend it rather than write a second one"*). The expected set is read from
 * `components.schemas.VideoStatus.enum` and never imported from `studioTypes.ts`.
 */
function videoStatusEnum(): string[] {
  return openapi.components.schemas.VideoStatus.enum;
}

describe('story 10.16a: every VideoStatus renders a distinct, named state (AC-1)', () => {
  it('the evidence narratives cover VideoStatus exactly, in both directions', () => {
    const declared = videoStatusEnum();
    expect(declared.length).toBeGreaterThan(0);
    assertSameSet(declared, Object.keys(VIDEO_EVIDENCE_NARRATIVES), 'VideoStatus narratives');
  });

  it('no two states render the same name, and none renders the same statement', () => {
    const declared = videoStatusEnum();
    const titles = declared.map((status) => videoEvidenceNarrative(status).title);
    expect(new Set(titles).size, 'two states render the same name').toBe(titles.length);
    const statements = declared.map((status) => videoEvidenceNarrative(status).statement);
    expect(new Set(statements).size, 'two states render the same statement').toBe(
      statements.length,
    );
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(10);
    }
  });

  it('no fixture anywhere says partial: true without an AVAILABLE or PROCESSING recording (AC-14(c))', () => {
    // ADR-002 §17.3: "It is `false` with `FAILED` and `UNAVAILABLE`, because a recording that does
    // not exist is not a partial one." EXPIRED has no playable object either. Over every corpus the
    // frontend ships, including the scripted transport frames that carried the defect.
    const everySnapshot = [...mockExecutions, ...executionCorpus, ...ALL_SCENARIO_FRAMES];
    expect(everySnapshot.some((snapshot) => snapshot.video.status === 'FAILED')).toBe(true);
    const contradicting = everySnapshot.filter(
      (snapshot) =>
        snapshot.video.partial &&
        snapshot.video.status !== 'AVAILABLE' &&
        snapshot.video.status !== 'PROCESSING',
    );
    expect(
      contradicting.map((snapshot) => `${snapshot.executionId}@${snapshot.revision}:${snapshot.video.status}`),
    ).toEqual([]);
  });

  it('a VideoStatus outside the document is an error rather than a generic panel', () => {
    expect(() => videoEvidenceNarrative('SOMETHING_ELSE')).toThrow(/Unknown VideoStatus/);
    // An inherited property name is not a state either.
    expect(() => videoEvidenceNarrative('toString')).toThrow(/Unknown VideoStatus/);
  });

  it('the playback-failure, partial and no-run wordings are none of the five states', () => {
    // AC-12: the media-error message must differ from all five narratives.
    const wordings = videoStatusEnum().flatMap((status) => {
      const narrative = videoEvidenceNarrative(status);
      return [narrative.title, narrative.statement];
    });
    for (const extra of [PLAYBACK_FAILED_MESSAGE, PARTIAL_RECORDING_QUALIFIER, NO_RUN_EVIDENCE_MESSAGE, RUN_IN_PROGRESS_EVIDENCE_MESSAGE]) {
      expect(wordings).not.toContain(extra);
    }
  });
});

/**
 * Story 10.16a — **AC-13**, the half that needs the document. The mock video route's refusal bodies
 * are validated against `ErrorResponse` with **this file's** Ajv harness, and every status the route
 * produces is one the document declares for `getExecutionVideo`. No second validator is added.
 *
 * The statuses are read from the operation's `responses`, never transcribed, so a ruling on ESC-1
 * that declares `401`/`403` changes this set without anyone editing the test.
 */
describe('story 10.16a: the mock video route answers only as the document declares (AC-13)', () => {
  const ORIGIN = 'http://localhost';
  const declaredStatuses = (): string[] =>
    Object.keys(openapi.paths['/executions/{id}/video'].get.responses);

  beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    studioMockServer.resetHandlers();
    resetStudioMocks();
  });
  afterAll(() => studioMockServer.close());

  async function requestVideo(executionId: string, headers?: Record<string, string>) {
    return fetch(`${ORIGIN}/api/v1/studio/executions/${executionId}/video`, { headers });
  }

  it('every refusal body validates against ErrorResponse, and names the declared example code', async () => {
    const validate = componentValidator('ErrorResponse');
    const responses = openapi.paths['/executions/{id}/video'].get.responses;
    // A response is either a route-local literal or a `$ref` to a shared component
    // (`#/components/responses/Video*`, architect ruling AR-1 E-1 at contract step C2a). Both read
    // the same example, so the asserted codes do not depend on which form the document uses.
    const exampleError = (status: string, example: string): string => {
      const declared = responses[status];
      const response =
        typeof declared?.$ref === 'string'
          ? declared.$ref
              .replace(/^#\//u, '')
              .split('/')
              .reduce((node: Record<string, unknown>, segment: string) => node[segment] as Record<string, unknown>, openapi)
          : declared;
      return response.content['application/json'].examples[example].value.error;
    };
    const expectedCode: Record<string, string> = {
      // `components.responses.Forbidden` carries no `examples` key, so there is nothing in the
      // document to read this one from. It is story 10.31's own literal, taken from the backend's
      // `StudioAccessDeniedException.CODE`, and the mock is asserted against it here.
      '403': 'STUDIO_FORBIDDEN',
      '404': exampleError('404', 'noEvidence'),
      '410': exampleError('410', 'expired'),
      '416': exampleError('416', 'unsatisfiable'),
    };

    const refusals: Response[] = [];
    for (const execution of mockExecutions) {
      if (execution.video.status !== 'AVAILABLE') {
        refusals.push(await requestVideo(execution.executionId));
      }
    }
    const available = mockExecutions.find(
      (execution) => execution.video.status === 'AVAILABLE' && MOCK_READABLE_CSIS.includes(execution.csiId!),
    )!;
    refusals.push(await requestVideo(available.executionId, { Range: 'bytes=100000-' }));

    const seen = new Set<number>();
    for (const response of refusals) {
      seen.add(response.status);
      expect(response.headers.get('content-type')).toMatch(/application\/json/u);
      const body = await response.json();
      expect(validate(body), `${response.status}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(body.error).toBe(expectedCode[String(response.status)]);
    }
    // All four refusals were actually produced, so none of the checks above held vacuously. The
    // 403 joined this set when ADR-002 §24.3's ruling landed (story 10.31): the OTHER_CSI
    // execution is filtered out by `readable()` before the handler sees it.
    expect([...seen].sort()).toEqual([403, 404, 410, 416]);
  });

  it('every status the route produces over the whole fixture set is declared for getExecutionVideo', async () => {
    const declared = declaredStatuses();

    const produced = new Set<string>();
    for (const execution of mockExecutions) {
      for (const headers of [undefined, { Range: 'bytes=0-9' }, { Range: 'bytes=100000-' }]) {
        const response = await requestVideo(execution.executionId, headers);
        produced.add(String(response.status));
      }
    }
    produced.add(String((await requestVideo('00000000-0000-0000-0000-000000000000')).status));

    // The unreadable CSI's execution is in the set above, and after ADR-002 §24.3's ruling it is
    // answered 403 — which the document now declares, so it is checked rather than excluded.
    expect(mockExecutions.some((execution) => execution.csiId === OTHER_CSI)).toBe(true);
    for (const status of produced) {
      expect(declared, `the mock produced undeclared status ${status}`).toContain(status);
    }
    // Exact equality, so the two statuses the mock cannot observe — an absent session (401) and an
    // unreachable evidence store (503) — are excluded by this line rather than by a comment.
    expect([...produced].sort()).toEqual(['200', '206', '403', '404', '410', '416']);
  });
});

describe('story 10.46: the demo-scale list fixtures match the contract', () => {
  it('every demo test validates against TestDto', () => {
    const validate = componentValidator('TestDto');
    for (const test of demoTests) {
      expect(validate(test), `${test.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('every demo run validates against ExecutionSnapshot and carries only declared fields', () => {
    const validate = componentValidator('ExecutionSnapshot');
    const required = requiredPropertiesOf('ExecutionSnapshot');
    const declared = declaredPropertiesOf('ExecutionSnapshot');
    for (const execution of demoExecutions) {
      expect(validate(execution), `${execution.executionId}: ${JSON.stringify(validate.errors)}`).toBe(true);
      for (const field of required) expect(Object.keys(execution)).toContain(field);
      for (const field of Object.keys(execution)) expect(declared).toContain(field);
    }
  });

  it('is rich enough to demo the lists', () => {
    expect(demoTests.length).toBeGreaterThanOrEqual(25);
    expect(new Set(demoTests.map((test) => test.csiId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(demoTests.map((test) => test.environment)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(demoTests.map((test) => test.readiness)).size).toBeGreaterThanOrEqual(4);
    expect(demoTests.some((test) => test.lastRunStatus === null)).toBe(true);

    expect(demoExecutions.length).toBeGreaterThanOrEqual(40);
    const statuses = new Set(demoExecutions.map((execution) => execution.status));
    for (const status of ['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR']) expect(statuses).toContain(status);
    expect(demoExecutions.some((e) => isCancelledOutcome(e.status, e.errorCode))).toBe(true);
    expect(demoExecutions.some((e) => e.status === 'ERROR' && e.errorCode !== null && !isCancelledOutcome(e.status, e.errorCode))).toBe(true);
    expect(demoExecutions.some((e) => e.durationMs !== null && e.durationMs < 1_000)).toBe(true);
    expect(demoExecutions.some((e) => e.durationMs !== null && e.durationMs > 3_600_000)).toBe(true);
    expect(demoExecutions.some((e) => e.testId === DEMO_DELETED_TEST_ID)).toBe(true);
  });
});

describe('story 10.46: the list query parameters are emulated as the contract declares', () => {
  const ORIGIN = 'http://localhost/api/v1/studio';
  beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    studioMockServer.resetHandlers();
    resetStudioMocks();
  });
  afterAll(() => studioMockServer.close());

  const ids = <T,>(items: T[], idOf: (item: T) => string) => items.map(idOf);

  it('tests: default sort is updatedAt,desc with an id tie-breaker, and pages do not overlap', async () => {
    const all = await studioApi.listTests({ size: 100 });
    const keys = all.data.map((test) => [test.updatedAt ?? '', test.id] as const);
    for (let index = 1; index < keys.length; index += 1) {
      const [previousAt, previousId] = keys[index - 1];
      const [at, id] = keys[index];
      const previous = new Date(previousAt).getTime();
      const current = new Date(at).getTime();
      expect(previous > current || (previous === current && previousId > id)).toBe(true);
    }
    const first = await studioApi.listTests({ page: 0, size: 10 });
    const second = await studioApi.listTests({ page: 1, size: 10 });
    expect(first.totalElements).toBe(all.totalElements);
    expect(first.totalPages).toBe(Math.ceil(all.totalElements / 10));
    const overlap = ids(first.data, (t) => t.id).filter((id) => ids(second.data, (t) => t.id).includes(id));
    expect(overlap).toEqual([]);
  });

  it('tests: q, environment, csiId and lastRun narrow the list', async () => {
    const byName = await studioApi.listTests({ q: 'LOGIN', size: 100 });
    expect(byName.data.length).toBeGreaterThan(0);
    expect(byName.data.every((t) => `${t.name} ${t.description ?? ''}`.toLowerCase().includes('login'))).toBe(true);

    const uat = await studioApi.listTests({ environment: 'UAT', size: 100 });
    expect(uat.data.length).toBeGreaterThan(0);
    expect(uat.data.every((t) => t.environment === 'UAT')).toBe(true);

    const csi = await studioApi.listTests({ csiId: '178672', size: 100 });
    expect(csi.data.length).toBeGreaterThan(0);
    expect(csi.data.every((t) => t.csiId === '178672')).toBe(true);

    const never = await studioApi.listTests({ lastRun: 'NEVER', size: 100 });
    expect(never.data.length).toBeGreaterThan(0);
    expect(never.data.every((t) => t.lastRunStatus === null)).toBe(true);

    const failed = await studioApi.listTests({ lastRun: 'FAILED', size: 100 });
    expect(failed.data.every((t) => t.lastRunStatus === 'FAILED')).toBe(true);
  });

  it('tests: name sort is case-insensitive and lastRunAt keeps never-run drafts last', async () => {
    const byName = (await studioApi.listTests({ sort: 'name,asc', size: 100 })).data.map((t) => t.name.toLowerCase());
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'en')));

    for (const sort of ['lastRunAt,asc', 'lastRunAt,desc'] as const) {
      const rows: TestDto[] = (await studioApi.listTests({ sort, size: 100 })).data;
      const firstNever = rows.findIndex((t) => t.lastRunAt === null);
      expect(firstNever).toBeGreaterThan(0);
      expect(rows.slice(firstNever).every((t) => t.lastRunAt === null)).toBe(true);
    }
  });

  it('caps size at 100', async () => {
    const page = await studioApi.listExecutions({ size: 500 });
    expect(page.size).toBe(100);
    expect(page.data.length).toBeLessThanOrEqual(100);
  });

  it('executions: default sort is acceptedAt,desc with an id tie-breaker', async () => {
    const rows = (await studioApi.listExecutions({ size: 100 })).data;
    for (let index = 1; index < rows.length; index += 1) {
      const previous = new Date(rows[index - 1].acceptedAt).getTime();
      const current = new Date(rows[index].acceptedAt).getTime();
      expect(
        previous > current || (previous === current && rows[index - 1].executionId > rows[index].executionId),
      ).toBe(true);
    }
  });

  it('executions: every item carries testName, null for a deleted test', async () => {
    const rows = (await studioApi.listExecutions({ size: 100 })).data;
    expect(rows.every((e) => e.testName !== undefined)).toBe(true);
    const orphan = rows.find((e) => e.testId === DEMO_DELETED_TEST_ID);
    expect(orphan?.testName).toBeNull();
    const named = rows.find((e) => e.testId === demoTests[0].id);
    expect(named?.testName).toBe(demoTests[0].name);
    expect((await studioApi.getExecution(named!.executionId)).testName).toBe(demoTests[0].name);
  });

  it('executions: deleting a test turns its runs into testName null and hides the test', async () => {
    const target = demoTests[1];
    await studioApi.deleteTest(target.id);
    const runs = (await studioApi.listExecutions({ size: 100 })).data.filter((e) => e.testId === target.id);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((e) => e.testName === null)).toBe(true);
    expect((await studioApi.listTests({ size: 100 })).data.map((t) => t.id)).not.toContain(target.id);
  });

  it('executions: status filter maps CANCELLED like isCancelledOutcome, and ERROR excludes it', async () => {
    const cancelled = (await studioApi.listExecutions({ status: 'CANCELLED', size: 100 })).data;
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((e) => isCancelledOutcome(e.status, e.errorCode))).toBe(true);

    const errored = (await studioApi.listExecutions({ status: 'ERROR', size: 100 })).data;
    expect(errored.length).toBeGreaterThan(0);
    expect(errored.every((e) => e.status === 'ERROR' && !isCancelledOutcome(e.status, e.errorCode))).toBe(true);

    const running = (await studioApi.listExecutions({ status: 'RUNNING', size: 100 })).data;
    expect(running.length).toBeGreaterThan(0);
    expect(running.every((e) => e.status === 'RUNNING')).toBe(true);
  });

  it('executions: q matches the test name, csiId narrows, durationMs sorts with nulls last', async () => {
    const zelle = (await studioApi.listExecutions({ q: 'zelle', size: 100 })).data;
    expect(zelle.length).toBeGreaterThan(0);
    expect(zelle.every((e) => (e.testName ?? '').toLowerCase().includes('zelle'))).toBe(true);

    const csi = (await studioApi.listExecutions({ csiId: '169001', size: 100 })).data;
    expect(csi.length).toBeGreaterThan(0);
    expect(csi.every((e) => e.csiId === '169001')).toBe(true);

    const longest: ExecutionSnapshot[] = (await studioApi.listExecutions({ sort: 'durationMs,desc', size: 100 })).data;
    const firstNull = longest.findIndex((e) => e.durationMs === null);
    const timed = longest.slice(0, firstNull).map((e) => e.durationMs as number);
    expect(timed).toEqual([...timed].sort((a, b) => b - a));
    expect(longest.slice(firstNull).every((e) => e.durationMs === null)).toBe(true);
  });

  it('executions: unfinished runs order newest accepted first in both duration directions (QA 10.46)', async () => {
    for (const sort of ['durationMs,asc', 'durationMs,desc'] as const) {
      const all: ExecutionSnapshot[] = (await studioApi.listExecutions({ sort, size: 100 })).data;
      const untimed = all.filter((e) => e.durationMs === null).map((e) => Date.parse(e.acceptedAt));
      expect(untimed.length).toBeGreaterThan(1);
      expect(untimed).toEqual([...untimed].sort((a, b) => b - a));
    }
  });

  it.each([
    ['/tests?sort=createdAt,desc'],
    ['/tests?sort=name,sideways'],
    ['/tests?lastRun=SKIPPED'],
    ['/executions?sort=name,asc'],
    ['/executions?status=TIMEOUT'],
  ])('answers 400 for %s', async (path) => {
    const response = await fetch(`${ORIGIN}${path}`);
    expect(response.status).toBe(400);
    expect(componentValidator('ErrorResponse')(await response.json())).toBe(true);
  });

  it('lastRun and status filter values are case-insensitive, as on the backend (MNT-001)', async () => {
    const lower = await (await fetch(`${ORIGIN}/tests?lastRun=never&size=100`)).json();
    const upper = await studioApi.listTests({ lastRun: 'NEVER', size: 100 });
    expect(lower.totalElements).toBeGreaterThan(0);
    expect(lower.totalElements).toBe(upper.totalElements);

    const runningLower = await (await fetch(`${ORIGIN}/executions?status=running&size=100`)).json();
    const runningUpper = await studioApi.listExecutions({ status: 'RUNNING', size: 100 });
    expect(runningLower.totalElements).toBeGreaterThan(0);
    expect(runningLower.totalElements).toBe(runningUpper.totalElements);
  });

  it('an unknown execution answers 404 (MNT-001)', async () => {
    const response = await fetch(`${ORIGIN}/executions/no-such-run`);
    expect(response.status).toBe(404);
    expect(componentValidator('ErrorResponse')(await response.json())).toBe(true);
  });
});
