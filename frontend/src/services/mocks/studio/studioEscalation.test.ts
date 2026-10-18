import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Story 10.10 AC-15 — a Class C escalation, carried as a live contract test. **Now green, and it
 * went green with no edit to a single assertion.** (STUDIO-OBS-012B: the confirmation route is
 * retired by ADR-SC-005, so the one guard that named it now asserts its absence; the reachability
 * property itself is unchanged and still runs over every remaining `tests` write.)
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

/**
 * A document a `$ref` can point into, and where it lives: a ref inside a loaded file is relative to
 * that file, so the file travels with every step of the walk.
 */
interface RefContext {
  readonly doc: unknown;
  readonly file: string;
}

const ROOT: RefContext = { doc: openapi, file: path.join(SPEC_DIR, 'openapi.yaml') };
const loaded = new Map<string, unknown>();

/**
 * The v3 contract schemas reference one another by absolute `$id` URL as well as by relative path.
 * Both name the same file, so the URL is mapped to it through the files' own `$id`s.
 */
const V3_DIR = path.resolve(SPEC_DIR, '../studio-observed-authoring/contracts/v3');
let fileById: Map<string, string> | null = null;
function fileForId(id: string): string {
  if (fileById === null) {
    fileById = new Map();
    for (const name of fs.readdirSync(V3_DIR).filter((entry) => entry.endsWith('.schema.json'))) {
      const file = path.join(V3_DIR, name);
      const schemaId = (JSON.parse(fs.readFileSync(file, 'utf8')) as { $id?: string }).$id;
      if (schemaId) fileById.set(schemaId, file);
    }
  }
  const file = fileById.get(id);
  if (!file) throw new Error(`$ref ${id} names no v3 contract schema`);
  return file;
}

/** Loaded once per file, so the `seen` cycle guard compares the same objects on every visit. */
function loadDocument(file: string): unknown {
  if (!loaded.has(file)) {
    const text = fs.readFileSync(file, 'utf8');
    loaded.set(file, /\.ya?ml$/u.test(file) ? parseYaml(text) : JSON.parse(text));
  }
  return loaded.get(file);
}

/**
 * Follows a local (`#/components/...`) or cross-file (`../x/y.schema.json#/definitions/Z`) ref. The
 * file part is relative to the referring document; the returned context is the target's, so refs
 * inside it resolve against it.
 */
function resolveRef(ref: string, from: RefContext = ROOT): { node: Record<string, unknown>; context: RefContext } {
  const [filePart, fragment = ''] = ref.split('#');
  const context: RefContext =
    filePart === ''
      ? from
      : (() => {
          const file = /^https?:/u.test(filePart)
            ? fileForId(filePart)
            : path.resolve(path.dirname(from.file), filePart);
          return { doc: loadDocument(file), file };
        })();
  const segments = fragment.split('/').filter((segment) => segment !== '');
  let node = context.doc as Record<string, unknown>;
  for (const segment of segments) {
    node = node[segment.replace(/~1/gu, '/').replace(/~0/gu, '~')] as Record<string, unknown>;
  }
  return { node, context };
}

/** Every property name reachable from a schema, following `$ref`, `items`, and composition. */
function reachableProperties(
  schema: unknown,
  seen: Set<unknown> = new Set(),
  found: Set<string> = new Set(),
  context: RefContext = ROOT,
): Set<string> {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) {
    return found;
  }
  seen.add(schema);
  const node = schema as Record<string, unknown>;

  if (typeof node.$ref === 'string') {
    const target = resolveRef(node.$ref, context);
    return reachableProperties(target.node, seen, found, target.context);
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [name, child] of Object.entries(node.properties as Record<string, unknown>)) {
      found.add(name);
      reachableProperties(child, seen, found, context);
    }
  }
  for (const key of ['items', 'additionalProperties']) {
    reachableProperties(node[key], seen, found, context);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const branches = node[key];
    if (Array.isArray(branches)) {
      branches.forEach((branch) => reachableProperties(branch, seen, found, context));
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
      schema && typeof schema.$ref === 'string' ? resolveRef(schema.$ref).node : (schema ?? {});
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
    // The confirmation route this escalation was written about was retired with the single path
    // (ADR-SC-005, STUDIO-OBS-012A); the property is still asserted over every write that remains.
    expect(operations.map((operation) => operation.operationId)).not.toContain('confirmCompile');
    expect(operations.map((operation) => operation.operationId)).toContain('updateTest');
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
