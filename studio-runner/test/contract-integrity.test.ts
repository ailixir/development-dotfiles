/**
 * REF-DANGLE-1 — every `$ref` in `docs/specs/studio/openapi.yaml` resolves.
 *
 * ## Why this file exists, stated accurately
 *
 * The finding as first recorded was that *"nothing in this repository resolves an OpenAPI `$ref`"*.
 * That is **false**, and the correction is the point. `test/helpers/openapi.ts` has resolved local
 * `$ref`s since story 10.6: `resolveRef` throws `` `$ref does not resolve: ${pointer}` `` on a
 * dangling pointer, `` `Only local $ref is supported` `` on a remote one, and `` `Circular $ref` ``
 * on a cycle. What was missing is not a resolver — it is **anyone walking it over the document**.
 *
 * `contract.test.ts` resolves only the refs it happens to traverse on its way to four runner routes
 * and two API callbacks. The mutation that exposed the gap pointed **both sides** of the
 * `getExecutionVideo` `403` comparison at `#/components/responses/NoSuchForbidden`, a component
 * that does not exist, and every suite in the estate stayed green — because nothing walks the
 * public routes, not because nothing can resolve a ref.
 *
 * So this file is the walk, and nothing more: it collects every `$ref` node in the parsed document
 * and hands each one to **the same `resolveRef` the conformance checker calls** — not a copy of it,
 * so a regression in the resolver reddens here too.
 *
 * ## What this does NOT prove, so that nobody reads more into a green run than it earns
 *
 * A `$ref` that resolves to a **real but semantically wrong** component passes this file. Pointing
 * a `404` at `#/components/responses/Forbidden` is a resolvable, wrong, and *green* contract here.
 * Catching that needs an assertion about which component each operation names — `pins.test.ts`
 * carries the value pins that do that for the operations it covers, and this file makes no claim
 * about the rest. It closes exactly one hazard: a pointer that names nothing.
 *
 * It also does not read `discriminator.mapping`, which names components by string without a `$ref`
 * key. No operation in this document uses one (measured); if one appears, this walk will not see it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';
import type { YamlValue } from './helpers/openapi.js';
import { parseYaml, resolveRef } from './helpers/openapi.js';

const CONTRACT_PATH = join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml');

/**
 * The contract is a committed file of this repository, so its absence is a failure and not a
 * reason to skip. An `existsSync` guard that skips is the shape that lets a tier disarm itself
 * silently; this one throws.
 */
function readContract(): string {
  if (!existsSync(CONTRACT_PATH)) {
    throw new Error(`The contract is absent from the repository: ${CONTRACT_PATH}`);
  }
  return readFileSync(CONTRACT_PATH, 'utf8');
}

interface RefSite {
  /** The pointer exactly as the document writes it. */
  readonly pointer: string;
  /** Where in the document it sits, for a failure message that names the offender. */
  readonly at: string;
}

function isMapping(value: unknown): value is Record<string, YamlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `$ref` node in the tree, in document order, each with its own location. */
function collectRefs(node: YamlValue, at = '$'): RefSite[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => collectRefs(entry, `${at}[${String(index)}]`));
  }
  if (!isMapping(node)) return [];
  const sites: RefSite[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      sites.push({ pointer: value, at });
      continue;
    }
    sites.push(...collectRefs(value, `${at}.${key}`));
  }
  return sites;
}

describe('REF-DANGLE-1 — the contract document is internally consistent', () => {
  const text = readContract();
  const document = parseYaml(text);
  const sites = collectRefs(document);

  it('finds every $ref the file text contains, so a walk that stops early is visible', () => {
    // Both sides are measured from the same file on every run, so the contract may grow freely.
    // What this catches is a *collector* that stops descending: the parsed count drops below the
    // textual one and this reddens before the resolution assertion has a chance to pass vacuously.
    const textual = text.match(/\$ref:/gu)?.length ?? 0;
    expect(textual, 'the contract declares no $ref at all — the file under test is not the one')
      .toBeGreaterThan(0);
    expect(sites.length, 'the walk did not reach every $ref the file writes').toBe(textual);
  });

  it('resolves every $ref through the resolver the conformance checker itself uses', () => {
    const failures: string[] = [];
    for (const site of sites) {
      try {
        resolveRef(document, { $ref: site.pointer });
      } catch (error) {
        failures.push(`${site.at}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    expect(failures, 'a $ref in the contract names nothing, or names it unreachably').toEqual([]);
  });

  it('every $ref names an object, because a pointer into a scalar is a malformed reference', () => {
    // `#/info/title` resolves — to a string. The resolver is right to return it and wrong to be
    // read as approval; a `$ref` target in OpenAPI is always an object.
    const scalars: string[] = [];
    for (const site of sites) {
      let target: YamlValue;
      try {
        target = resolveRef(document, { $ref: site.pointer });
      } catch {
        // An unresolvable pointer is the assertion above's failure, reported there with its
        // message. Reporting it twice buries the one line a reader needs.
        continue;
      }
      if (!isMapping(target)) scalars.push(`${site.at} -> ${site.pointer}`);
    }
    expect(scalars, 'a $ref resolves to a scalar rather than to a component object').toEqual([]);
  });
});
