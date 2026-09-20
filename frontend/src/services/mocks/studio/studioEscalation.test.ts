import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Story 10.10 AC-15 — a Class C escalation, carried as a live contract test. **Now green, and it
 * went green with no edit to a single assertion.**
 *
 * ADR-002 §12: *"A story that finds a divergence it may not fix leaves the contract test failing
 * and refers the question."*
 *
 * The divergence was: `ConfirmCompileRequest.required` names `artifactHash`, and `artifactHash`
 * was reachable from **no** declared `2xx` response schema of any `tests`-tagged operation. It
 * appeared on a request *example*, on `ConfirmCompileRequest` itself, and on the internal
 * `RunJob` — and an example is not a schema (§14.6) while `RunJob` is not a public response. So
 * the client was required to send a value it had no declared way to obtain, which also denied
 * story 10.10 the action/target/assertion summary and the expandable source (AC-16b), both of
 * which are derived from validated operations (§4.7).
 *
 * **Ruled and closed by ADR-002 §21, landed by story 10.11c.** Candidate **A**: `TestDto` gains
 * nullable `currentCandidateArtifactHash` and `currentCandidateArtifact`, both nulled in the
 * `GET /tests` list projection. Candidate B — a revision read route — was rejected on
 * **correctness** rather than cost: `ConfirmCompileRequest` is a conditional transaction whose
 * four fields must come from one read, and B would let the draft recompile between the two
 * requests and produce an internally inconsistent body `STALE_CANDIDATE` was never designed to
 * name (§21.3).
 *
 * **This file was byte-unchanged by that story apart from this comment, and it is the property
 * that made it an escalation rather than a `TODO`.** It was written as a plain `it()` rather than
 * `it.fails()` deliberately: `it.fails()` would have been green while the divergence stood and red
 * on the amendment, which inverts an escalation into a tripwire. As written it went 2/3 → 3/3 the
 * moment the document was amended. The precedent is 10.7's
 * `ExecutionErrorCodeContractEscalationTest`, which went 1/2 → 2/2 untouched when §15 landed.
 *
 * ---
 *
 * **What this file's green does and does not mean — ADR-002 §21.4, recorded here because the next
 * reader will otherwise take it as acceptance.**
 *
 * The rule below is **syntactic**. `isReachable` accepts an exact name or a property whose name
 * ends with the field's name capitalized, and @architect proved by simulation against the real
 * document that injecting `supersededRevisionArtifactHash` — the hash of explicitly the **wrong**
 * revision — empties the unobtainable list **identically** to the correct field.
 *
 * So: **this test is a tripwire that *a* qualified hash exists, not a check that the right one
 * does. Its green is necessary and it is not sufficient.** The correct field was named by ruling
 * (§21.4), not by this test, and the name `currentCandidateArtifactHash` is normative for exactly
 * that reason — it is paired with the existing `currentCandidateRevisionId` so the name itself
 * states which revision it hashes.
 *
 * The qualified-suffix half is **not** sloppiness and must not be "tightened" to an exact-name
 * check: without it this escalation would report `revisionId` as a second, false divergence,
 * because `revisionId` is genuinely obtainable only through `currentCandidateRevisionId`. The
 * sibling test below pins that half as live rather than dead code. An escalation that cries about
 * two things when one is real is an escalation nobody acts on.
 *
 * **The question §21 did not settle is escalated separately, not folded in here.** The
 * **confirmed** revision's artifact and hash are still reachable from no declared response;
 * §21.3 says that would be *"a third additive property on the same body, not a route"* and nobody
 * has ruled it. See `confirmedRevisionEscalation.test.ts`, story 10.11c AC-32, committed red.
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
