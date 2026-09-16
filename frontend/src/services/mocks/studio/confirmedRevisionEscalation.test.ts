import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Story 10.11c AC-32 — a Class C escalation, carried as a live contract test and **committed red**.
 *
 * ADR-002 §12: *"A story that finds a divergence it may not fix leaves the contract test failing
 * and refers the question."* §19 narrows who holds the diff, never who decides. This story
 * **proposes nothing and amends nothing here**: it lands ADR-002 §21's authorized shape and
 * escalates the one thing §21 did not settle.
 *
 * **The divergence.** `TestDto` invites a client to act on **two** revisions — it publishes
 * `currentCandidateRevisionId` and `confirmedRevisionId`, and the `READY` state's whole meaning
 * is *"the confirmed revision is what will run"*. After §21 lands, the **candidate's** artifact
 * and artifact hash are reachable from a declared `2xx` response
 * (`currentCandidateArtifactHash`, `currentCandidateArtifact`). The **confirmed** revision's are
 * reachable from nothing: no `tests`-tagged `2xx` response returns them, and there is no revision
 * read route. §21.3 says so in as many words and invites exactly this escalation:
 *
 * > *"10.11's Code view wants the **confirmed** revision — true, and `confirmedRevisionId` is
 * > already on `TestDto`; if 10.11 needs the confirmed artifact as well as the candidate's, that
 * > is a third additive property on the same body, not a route."*
 *
 * **Why the candidate is not rendered in its place.** A `READY` draft's confirmed revision and
 * its current candidate are the same object only until the draft is edited again. §21.7 states
 * the consequence: `currentCandidateArtifact` is the **candidate's**, `steps` is the draft's
 * current English, and the two can disagree by design. A Code view that renders the candidate
 * while claiming to show what will run is the precise confusion the confirmation step exists to
 * prevent, and it is what architecture §8.3 retires the client grammar path to end. So story
 * 10.11a's Code view stays an honest unavailable state naming this blocker, and this test carries
 * the question rather than approximating an answer.
 *
 * **This file is expected to fail today, and that is the point.** It is written as a plain
 * `it()` rather than `it.fails()` for the reason story 10.10's escalation gives: `it.fails()`
 * would be green today and red on the amendment, which inverts an escalation into a tripwire. As
 * written it goes green the moment the document declares the confirmed revision's pair, **with no
 * edit to this file** — under any naming an architect chooses, because the rule below counts
 * qualified forms rather than pinning a spelling nobody has ruled yet. That is the property that
 * makes it an escalation rather than a `TODO`. Precedents in this epic: 10.7's
 * `ExecutionErrorCodeContractEscalationTest` (1/2 → 2/2 untouched on §15), 10.9's AC-22, and
 * 10.10's AC-15, which §21 closes and which this file succeeds.
 *
 * **What its eventual green would and would not mean, stated here because §21.4 had to say it of
 * the test this one succeeds.** The rule below is syntactic. It can see that *a* qualified
 * artifact hash exists for every revision identifier the surface publishes; it cannot see that
 * the right one does — a property named for the hash of explicitly the wrong revision would
 * satisfy it identically. Its green is **necessary and not sufficient**; the correct field is
 * named by ruling, not by this test.
 *
 * **It is an escalation and not a detector.** It is red on every run until the question is ruled,
 * so it has no second observable state left to signal anything else with, and nothing in this
 * story is guarded by it. That distinction is this epic's twentieth catalogued vacuous-guard
 * shape and it is written down here so the next reader does not mistake the red for coverage of
 * something.
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
  responses?: Record<string, unknown>;
}

function taggedOperations(tag: string): Operation[] {
  const operations: Operation[] = [];
  for (const methods of Object.values(openapi.paths as Record<string, unknown>)) {
    for (const operation of Object.values(methods as Record<string, unknown>)) {
      const candidate = operation as Operation;
      if (candidate && Array.isArray(candidate.tags) && candidate.tags.includes(tag)) {
        operations.push(candidate);
      }
    }
  }
  return operations;
}

/** Every property name a client can read from a declared `2xx` response on this surface. */
function readableProperties(tag: string): Set<string> {
  const readable = new Set<string>();
  for (const operation of taggedOperations(tag)) {
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (!/^2\d\d$/.test(status)) {
        continue;
      }
      const content = (response as { content?: Record<string, unknown> })?.content ?? {};
      for (const media of Object.values(content)) {
        reachableProperties((media as { schema?: unknown }).schema).forEach((name) =>
          readable.add(name),
        );
      }
    }
  }
  return readable;
}

/**
 * The three vocabularies, all derived from the document rather than transcribed from it.
 *
 * The qualification is **capitalized-suffix**, which is story 10.10's rule and ADR-002 §21.4's
 * construction: a property qualified by which revision it belongs to, so a reader of the confirm
 * call can see the two fields agree without consulting the ADR. `currentCandidateArtifactHash`
 * ends with `ArtifactHash`; a bare `artifactHash` deliberately would not count, because on a body
 * carrying two revision identifiers an unqualified hash does not say which revision it is for —
 * that is §21.4's rejection of the bare name, applied as a rule rather than repeated as prose.
 *
 * `CompileDiagnostics.artifact` — lowercase, artifact-**level** diagnostics belonging to no single
 * step — is on this surface and is deliberately **not** counted by either suffix. It is not an
 * artifact; it is a list of complaints about one, and counting it would make this escalation green
 * on a property that answers nothing.
 */
function revisionIdentifiers(readable: ReadonlySet<string>): string[] {
  return [...readable].filter((name) => /.RevisionId$/.test(name)).sort();
}

function qualifiedArtifactHashes(readable: ReadonlySet<string>): string[] {
  return [...readable].filter((name) => /.ArtifactHash$/.test(name)).sort();
}

function qualifiedArtifacts(readable: ReadonlySet<string>): string[] {
  return [...readable].filter((name) => /.Artifact$/.test(name)).sort();
}

describe('ADR-002 §12 escalation: a revision a client may act on must have a readable artifact', () => {
  it('the document still publishes the revision identifiers this property is asserted over', () => {
    // Without this, both assertions below could pass by finding nothing to check: zero revision
    // identifiers makes every "at least as many" comparison vacuously true.
    const readable = readableProperties(TAG);
    const revisions = revisionIdentifiers(readable);

    expect(readable.size, 'the tests surface returns almost nothing; re-check this guard')
      .toBeGreaterThan(10);
    expect(revisions.length, 'the tests surface no longer publishes two revision identifiers')
      .toBeGreaterThanOrEqual(2);
    // Named, because an escalation that cannot say what it is about is one nobody acts on. This
    // is the escalation's *subject*, not a derived expectation.
    expect(revisions).toContain('confirmedRevisionId');
    expect(revisions).toContain('currentCandidateRevisionId');
  });

  it('the capitalized-suffix qualification is live, not dead code', () => {
    // Without this, the three filters could degrade to something that matches nothing and the
    // escalation would be red for the wrong reason for ever — which is how a red test stops being
    // read. After ADR-002 §21 lands, exactly one qualified hash and one qualified artifact exist,
    // and this is the assertion that says the rule can see them at all.
    const readable = readableProperties(TAG);
    expect(qualifiedArtifactHashes(readable).length + qualifiedArtifacts(readable).length)
      .toBeGreaterThan(0);
    expect(revisionIdentifiers(readable)).not.toContain('sourceRevision');
    expect(qualifiedArtifacts(readable), 'artifact-level diagnostics are not an artifact')
      .not.toContain('artifact');
  });

  it('EXPECTED RED (story 10.11c AC-32, Class C, @architect): every revision identifier a tests response publishes has its artifact hash reachable from a tests response — the confirmed revision’s is not', () => {
    const readable = readableProperties(TAG);
    const revisions = revisionIdentifiers(readable);
    const hashes = qualifiedArtifactHashes(readable);

    expect(
      hashes.length,
      `the tests surface publishes ${revisions.length} revision identifiers (${revisions.join(
        ', ',
      )}) and ${hashes.length} qualified artifact hashes (${hashes.join(', ') || 'none'}); a ` +
        'client is invited to act on a revision whose canonical artifact hash the contract gives ' +
        'it no declared way to read',
    ).toBeGreaterThanOrEqual(revisions.length);
  });

  it('EXPECTED RED (story 10.11c AC-32, Class C, @architect): every revision identifier a tests response publishes has its artifact reachable from a tests response — the confirmed revision’s is not', () => {
    const readable = readableProperties(TAG);
    const revisions = revisionIdentifiers(readable);
    const artifacts = qualifiedArtifacts(readable);

    expect(
      artifacts.length,
      `the tests surface publishes ${revisions.length} revision identifiers (${revisions.join(
        ', ',
      )}) and ${artifacts.length} qualified artifacts (${artifacts.join(', ') || 'none'}); the ` +
        'review surface can show what was validated for the candidate and cannot show it for the ' +
        'revision that actually runs (architecture §4.7, epic §10.11 "Code view renders the ' +
        'confirmed source")',
    ).toBeGreaterThanOrEqual(revisions.length);
  });
});
