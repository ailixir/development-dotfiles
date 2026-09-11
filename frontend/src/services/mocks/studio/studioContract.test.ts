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
