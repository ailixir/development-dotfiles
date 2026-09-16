import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { parse as parseYaml } from 'yaml';
import { mockArtifact, mockExecutions, mockTests, MOCK_READABLE_CSIS, OTHER_CSI } from './fixtures';
import { compileReviewDrafts } from './compileFixtures';
import {
  COMPILE_STATE_NARRATIVES,
  narrativeFor,
} from '@/components/studio/review/compileStateNarratives';
import { COMPILE_ERROR_NARRATIVES } from '@/components/studio/review/compileErrorCodes';
import {
  CONFIRM_CONFLICT_NARRATIVES,
  COMPILE_CONFLICT_NARRATIVES,
  COMPILE_REJECTION_NARRATIVES,
} from '@/components/studio/review/conflictNarratives';
import { EXECUTION_ERROR_CODES, defaultConfiguration } from '@/types/studio/studioTypes';
import {
  EXECUTE_CONFLICT_KEYS,
  EXECUTE_CONFLICT_NARRATIVES,
  EXECUTION_DISABLED_NARRATIVE,
  EXECUTION_ERROR_NARRATIVES,
  QUOTA_EXHAUSTED_NARRATIVE,
  RUN_ENABLEMENT,
  RUNNABLE_COMPILE_STATUS,
  executeRefusalFor,
  executionErrorNarrative,
  runEnablementFor,
} from '@/components/studio/run';
import { EXECUTION_FIXTURE_MATRIX, executionCorpus } from './executionFixtures';

/**
 * Story 10.1 AC-21 — the mocks are checked against the frozen contract, not against themselves.
 *
 * Fixtures that drift from the contract are worse than no fixtures: the UI is built and demoed
 * against shapes the server will never send, and the gap only surfaces when the backend lands.
 * These tests read `docs/specs/studio/` directly, so the contract is the single arbiter.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');

const artifactSchema = JSON.parse(
  fs.readFileSync(path.join(SPEC_DIR, 'artifact.schema.json'), 'utf8'),
);
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

describe('the mock artifact matches artifact.schema.json', () => {
  const validate = ajv.compile(artifactSchema);

  it('validates the fixture artifact', () => {
    expect(validate(mockArtifact), JSON.stringify(validate.errors)).toBe(true);
  });

  it('validates every example the schema itself declares', () => {
    for (const example of artifactSchema.examples) {
      expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('keeps one entry per source line, index aligned', () => {
    mockArtifact.steps.forEach((step, index) => {
      expect(step.stepIndex).toBe(index);
      expect(step.originalText.length).toBeGreaterThan(0);
    });
  });

  it('rejects an artifact whose step lost its generated code', () => {
    const broken = {
      version: 1,
      steps: [{ stepIndex: 0, originalText: 'Go to "https://citi.com"' }],
    };
    expect(validate(broken)).toBe(false);
  });
});

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

function compileStatusEnum(): string[] {
  return openapi.components.schemas.TestDto.properties.compileStatus.enum;
}

function conflictCodesOf(pathKey: string, method: string): string[] {
  return openapi.paths[pathKey][method].responses['409']['x-conflict-codes'];
}

describe('story 10.10: the compile vocabularies are read from the document, never transcribed', () => {
  it('every compileStatus the document declares renders a distinct, named state', () => {
    const declared = compileStatusEnum();
    expect(declared.length).toBeGreaterThan(0);

    assertSameSet(declared, Object.keys(COMPILE_STATE_NARRATIVES), 'compileStatus');

    const titles = declared.map((status) => narrativeFor(status).title);
    expect(new Set(titles).size, 'two states render the same name').toBe(titles.length);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it('a compileStatus outside the document is an error rather than a generic state', () => {
    // AC-1: no `default:` branch and no `??` fallback. A sixth value must be loud.
    expect(() => narrativeFor('SOMETHING_ELSE')).toThrow(/Unknown compileStatus/);
  });

  it('the compileError code set matches x-compile-error-codes in both directions', () => {
    const declared: string[] = openapi.components.schemas.CompileError['x-compile-error-codes'];
    expect(declared.length).toBeGreaterThan(0);
    assertSameSet(declared, Object.keys(COMPILE_ERROR_NARRATIVES), 'compileError codes');
  });

  it("confirm-compile's conflict codes match the UI's, in both directions", () => {
    assertSameSet(
      conflictCodesOf('/tests/{id}/confirm-compile', 'post'),
      Object.keys(CONFIRM_CONFLICT_NARRATIVES),
      'confirmCompile x-conflict-codes',
    );
  });

  it("compile's conflict codes match the UI's, in both directions", () => {
    assertSameSet(
      conflictCodesOf('/tests/{id}/compile', 'post'),
      Object.keys(COMPILE_CONFLICT_NARRATIVES),
      'compileTest x-conflict-codes',
    );
  });

  it("compile's four authoring-bound 400 codes are the four the UI words", () => {
    // The four are named in the operation's own 400 description; the examples are not the source
    // (§14.6), so the description is read and the codes extracted from it.
    const description: string =
      openapi.paths['/tests/{id}/compile'].post.responses['400'].description;
    const declared = [
      'SOURCE_TOO_MANY_STEPS',
      'SOURCE_LINE_TOO_LONG',
      'SOURCE_TOO_LARGE',
      'INLINE_CREDENTIAL',
    ].filter((code) => description.includes(code));
    expect(declared, 'the 400 description no longer names the four authoring bounds').toHaveLength(
      4,
    );
    assertSameSet(declared, Object.keys(COMPILE_REJECTION_NARRATIVES), 'compileTest 400 codes');
  });
});

describe('story 10.10: the compile-review fixtures match the amended contract', () => {
  it('every compile-review fixture validates against TestDto', () => {
    const validate = componentValidator('TestDto');
    for (const test of compileReviewDrafts) {
      expect(validate(test), `${test.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('no compile-review fixture carries a field the contract does not declare', () => {
    const declared = declaredPropertiesOf('TestDto');
    for (const test of compileReviewDrafts) {
      for (const field of Object.keys(test)) {
        expect(declared, `${test.id} has undeclared field ${field}`).toContain(field);
      }
    }
  });

  it('every diagnostics document validates against CompileDiagnostics', () => {
    const validate = componentValidator('CompileDiagnostics');
    const documents = compileReviewDrafts
      .map((test) => test.compileDiagnostics)
      .filter((document) => document != null);
    expect(documents.length).toBeGreaterThan(0);
    for (const document of documents) {
      expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('compileError and compileDiagnostics are never both present on one fixture', () => {
    for (const test of compileReviewDrafts) {
      expect(
        !(test.compileError && test.compileDiagnostics),
        `${test.id} carries both compileError and compileDiagnostics`,
      ).toBe(true);
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

describe('story 10.11a: the run gate covers the compile states the document declares', () => {
  it('every compileStatus maps, and Run is available in exactly one of them', () => {
    const declared = compileStatusEnum();
    expect(declared.length).toBeGreaterThan(0);

    assertSameSet(declared, Object.keys(RUN_ENABLEMENT), 'run enablement over compileStatus');

    const runnable = declared.filter((status) => runEnablementFor(status).canRun);
    expect(runnable, 'Run is available in more or fewer than one declared state').toEqual([
      RUNNABLE_COMPILE_STATUS,
    ]);
  });

  it('a compileStatus outside the document is an error rather than a permissive default', () => {
    expect(() => runEnablementFor('SOMETHING_ELSE')).toThrow(/Unknown compileStatus/);
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
 * Story 10.11a, @qa repair — **VAC-18: a coverage matrix whose required set is an editable
 * literal.**
 *
 * @qa deleted `AWAITING_CONFIRMATION` from `EXECUTION_FIXTURE_MATRIX` and the suite stayed
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
      ...compileStatusEnum().map((state) => `FX-RUNGATE-STATE-${state}`),
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
      compileStatusEnum().length +
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
