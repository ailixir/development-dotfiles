import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Story 10.10 AC-15 — a Class C escalation, carried as a live contract test and **committed red**.
 *
 * ADR-002 §12: *"A story that finds a divergence it may not fix leaves the contract test failing
 * and refers the question."*
 *
 * The divergence: `ConfirmCompileRequest.required` names `artifactHash`, and `artifactHash` is
 * reachable from **no** declared `2xx` response schema of any `tests`-tagged operation. It
 * appears on a request *example*, on `ConfirmCompileRequest` itself, and on the internal
 * `RunJob` — and an example is not a schema (§14.6) while `RunJob` is not a public response. So
 * the client is required to send a value it has no declared way to obtain, which also denies this
 * story the action/target/assertion summary and the expandable source (AC-16b), both of which are
 * derived from validated operations (§4.7).
 *
 * **This file is expected to fail today, and that is the point.** @po filed the escalation on
 * 2026-09-11, classified it Class C, and ratified the property below as correct and re-usable:
 * *every field named in a request body's `required` list is reachable from some declared `2xx`
 * response schema of an operation carrying the same tag.* It is true of every other route in the
 * document. It is written as a plain `it()` rather than `it.fails()` deliberately: `it.fails()`
 * would be **green today and red on the amendment**, which inverts an escalation into a tripwire.
 * As written it goes green the moment the document is amended, with no edit to this file — which
 * is the property that makes it an escalation rather than a `TODO`. The precedent is 10.7's
 * `ExecutionErrorCodeContractEscalationTest`, which went 1/2 → 2/2 untouched when §15 landed.
 *
 * Two candidate shapes were filed with the escalation and **neither was taken**:
 *   A — additive `TestDto` fields: the candidate's `artifactHash` and its `source` artifact.
 *   B — a revision read route, `GET /tests/{id}/revisions/{revisionId}`.
 * @po recorded a non-binding product preference for A. The shape is @architect's.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));

const TAG = 'tests';

function resolveRef(ref: string): Record<string, unknown> {
  const segments = ref.replace(/^#\//, '').split('/');
  let node: Record<string, unknown> = openapi;
  for (const segment of segments) {
    node = node[segment] as Record<string, unknown>;
  }
  return node;
}

/** Every property name reachable from a schema, following `$ref`, `items`, and composition. */
function reachableProperties(
  schema: unknown,
  seen: Set<unknown> = new Set(),
  found: Set<string> = new Set(),
): Set<string> {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) {
    return found;
  }
  seen.add(schema);
  const node = schema as Record<string, unknown>;

  if (typeof node.$ref === 'string') {
    return reachableProperties(resolveRef(node.$ref), seen, found);
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [name, child] of Object.entries(node.properties as Record<string, unknown>)) {
      found.add(name);
      reachableProperties(child, seen, found);
    }
  }
  for (const key of ['items', 'additionalProperties']) {
    reachableProperties(node[key], seen, found);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const branches = node[key];
    if (Array.isArray(branches)) {
      branches.forEach((branch) => reachableProperties(branch, seen, found));
    }
  }
  return found;
}

interface Operation {
  operationId: string;
  tags?: string[];
  requestBody?: Record<string, any>;
  responses?: Record<string, any>;
}

function taggedOperations(tag: string): Operation[] {
  const operations: Operation[] = [];
  for (const methods of Object.values(openapi.paths as Record<string, any>)) {
    for (const operation of Object.values(methods as Record<string, any>)) {
      if (operation && Array.isArray(operation.tags) && operation.tags.includes(tag)) {
        operations.push(operation as Operation);
      }
    }
  }
  return operations;
}

function readableProperties(tag: string): Set<string> {
  const readable = new Set<string>();
  for (const operation of taggedOperations(tag)) {
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (!/^2\d\d$/.test(status)) {
        continue;
      }
      const content = (response as any)?.content ?? {};
      for (const media of Object.values(content as Record<string, any>)) {
        reachableProperties((media as any).schema).forEach((name) => readable.add(name));
      }
    }
  }
  return readable;
}

/**
 * What "reachable" means, stated as a rule rather than tuned to one field.
 *
 * A required field is reachable when a declared response property carries the same name, **or**
 * carries a qualified form of it — a property whose name ends with the field's name capitalized.
 * That is a real correspondence rather than a courtesy: `ConfirmCompileRequest.revisionId` is
 * genuinely obtainable, because `TestDto.currentCandidateRevisionId` is the revision the caller
 * would confirm and `TestDto.confirmedRevisionId` is the one already confirmed. Insisting on an
 * exact spelling would report a field the client can plainly read as unobtainable, and an
 * escalation that cries about two things when one is real is an escalation nobody acts on.
 *
 * `artifactHash` fails both halves: nothing in any `tests` response is named `artifactHash`, and
 * nothing is named `…ArtifactHash`.
 */
function isReachable(field: string, readable: ReadonlySet<string>): boolean {
  if (readable.has(field)) {
    return true;
  }
  const qualified = field.charAt(0).toUpperCase() + field.slice(1);
  return [...readable].some((name) => name.endsWith(qualified));
}

function requiredRequestFields(operation: Operation): string[] {
  const content = operation.requestBody?.content ?? {};
  const required = new Set<string>();
  for (const media of Object.values(content as Record<string, any>)) {
    const schema = (media as any).schema;
    const resolved =
      schema && typeof schema.$ref === 'string' ? resolveRef(schema.$ref) : (schema ?? {});
    for (const field of ((resolved as any).required ?? []) as string[]) {
      required.add(field);
    }
  }
  return [...required];
}

describe('ADR-002 §12 escalation: a request body may not require what no response returns', () => {
  it('the document still declares the operations this property is asserted over', () => {
    // Without this, the assertion below could pass by finding nothing to check.
    const operations = taggedOperations(TAG).filter(
      (operation) => requiredRequestFields(operation).length > 0,
    );
    expect(operations.map((operation) => operation.operationId).sort()).toContain('confirmCompile');
    expect(operations.length).toBeGreaterThanOrEqual(2);
    expect(readableProperties(TAG).size).toBeGreaterThan(10);
  });

  it('the qualified-name half of the reachability rule is live, not dead code', () => {
    // Without this, `isReachable` could degrade to an exact-name check and the escalation would
    // start reporting a second, false divergence — which is how an escalation stops being acted
    // on. `revisionId` is reachable only through the qualified form, and stays so after any
    // amendment that adds the hash.
    const readable = readableProperties(TAG);
    expect(readable.has('revisionId'), 'revisionId is now spelled exactly; re-check this guard')
      .toBe(false);
    expect(isReachable('revisionId', readable)).toBe(true);
  });

  it('EXPECTED RED (story 10.10 AC-15, Class C, @architect): every field required on a tests request body is reachable from some declared 2xx tests response — artifactHash is not', () => {
    const readable = readableProperties(TAG);
    const unobtainable: string[] = [];

    for (const operation of taggedOperations(TAG)) {
      for (const field of requiredRequestFields(operation)) {
        if (!isReachable(field, readable)) {
          unobtainable.push(`${operation.operationId}.${field}`);
        }
      }
    }

    expect(
      unobtainable,
      'a client is required to send a value the contract gives it no way to read',
    ).toEqual([]);
  });
});
