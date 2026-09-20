import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createValueResolver, executeSteps } from '../../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../../src/executor/adapters/fake.js';
import type { LocatorSegment, Operation } from '../../src/executor/operations.js';
import { validateArtifact } from '../../src/validator/index.js';
import { loadReferenceFixtures, normalise, packageRoot } from '../helpers/corpus.js';
import type { ReferenceFixture } from '../helpers/corpus.js';
import { startPageServer } from '../helpers/pageServer.js';
import type { PageServer } from '../helpers/pageServer.js';
import {
  literalUrlsFor,
  loadReferenceManifest,
  locatorSegmentsFor,
  operationsFor,
} from '../helpers/reference-manifest.js';
import { runReal } from './realRunner.js';

/**
 * Fixture-corpus tier (ADR-001 §7.1, story 10.3 AC-6a; story 10.12 AC-18a).
 *
 * Every reference example runs end to end through the `BrowserAdapter` seam against the controlled
 * local HTML page the manifest binds it to. Story 10.3 ran it through the fake adapter from 10.2,
 * because `ED-05` (the internal Playwright image) was open and there was no pinned Chromium to
 * launch. **Story 10.12 runs it through the real one**, on a developer machine — which the BRD
 * milestone "Real browser, real video (dev)" and `ED-05`'s `gate_note` explicitly permit — and
 * the placeholder that used to sit at the bottom of this file is deleted rather than re-skipped.
 *
 * What each half proves:
 *
 *  - the **seam** half (fake adapter): the corpus drives the exact trusted-call sequence a real
 *    adapter implements, every locator the corpus targets exists in the page it is bound to, and
 *    every literal URL is served by one of those pages;
 *  - the **real** half (`real-chromium.test.ts` and the block at the bottom of this file): a real
 *    Chromium at the pinned build resolves those locators in the live DOM — **CSS `locator()`
 *    selectors included**, which the seam half explicitly cannot verify — and does so
 *    deterministically across two runs.
 *
 * `ED-05` still gates the *in-image* form (AC-18b); that stays recorded as skipped, never passed.
 */

const manifest = loadReferenceManifest();
const fixtures = loadReferenceFixtures();
const pagesDirectory = join(packageRoot, 'fixtures', 'pages');

function readPage(page: string): string {
  const path = join(pagesDirectory, page);
  if (!existsSync(path)) throw new Error(`Fixture page ${page} is missing.`);
  return readFileSync(path, 'utf8');
}

const pageSource = new Map(
  Object.keys(manifest.pages).map((page) => [page, readPage(page)] as const),
);

/**
 * Tokens a locator segment requires the bound page to contain.
 *
 * The pages carry explicit `role` attributes (see `fixtures/pages/home.html`), so a role query maps
 * to one exact substring rather than to a guess at native-element role mapping. Only literal
 * matchers are checked: a regular expression or a `vars.get` value is resolved at run time, and a
 * CSS selector cannot be answered without a DOM — which is exactly what the real-browser block
 * below now supplies.
 */
function requiredTokens(segment: LocatorSegment): string[] {
  switch (segment.kind) {
    case 'getByRole': {
      const tokens = [`role="${segment.role}"`];
      const name = segment.options?.name;
      if (name?.kind === 'literal') tokens.push(name.value);
      const level = segment.options?.level;
      if (level !== undefined) tokens.push(`aria-level="${String(level)}"`);
      return tokens;
    }
    case 'getByText':
    case 'getByLabel':
      return segment.text.kind === 'literal' ? [segment.text.value] : [];
    case 'getByPlaceholder':
      return segment.text.kind === 'literal' ? [`placeholder="${segment.text.value}"`] : [];
    case 'getByTestId':
      return segment.testId.kind === 'literal' ? [`data-testid="${segment.testId.value}"`] : [];
    case 'locator':
      // Not statically verifiable here; the real-browser block resolves CSS selectors against the
      // live DOM (AC-18a).
      return [];
  }
}

describe('reference corpus against the fixture pages', () => {
  it('has a manifest entry for every example', () => {
    expect(manifest.examples.length).toBe(fixtures.length);
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    'executes %s through the BrowserAdapter seam',
    async (name, fixture) => {
      const entry = manifest.examples.find((example) => example.name === name);
      expect(entry, `no manifest entry for ${name}`).toBeDefined();

      const result = validateArtifact(fixture.artifact, fixture.source, fixture.references);
      expect(result.ok).toBe(true);

      const adapter = createFakeBrowserAdapter();
      const reporter = createRecordingStepReporter();
      const run = await executeSteps({
        steps: result.steps.map((step) => ({
          stepIndex: step.stepIndex,
          operations: step.operations ?? [],
        })),
        adapter,
        reporter,
        resolver: createValueResolver(fixture.values),
        clock: createFakeClock(),
      });

      expect(run.ok).toBe(true);
      expect(normalise(adapter.calls)).toEqual(fixture.expectedCalls);
      expect(reporter.finished.map((event) => event.status)).toEqual(
        fixture.source.map(() => 'PASS'),
      );
    },
  );

  it.each(manifest.examples.map((example) => [example.name, example] as const))(
    'targets elements that exist on the page %s is bound to',
    (name, example) => {
      const fixture = fixtures.find((entry) => entry.name === name);
      expect(fixture, `no fixture named ${name}`).toBeDefined();
      if (fixture === undefined) return;

      const html = pageSource.get(example.page);
      expect(html, `page ${example.page} is not declared in the manifest`).toBeDefined();
      if (html === undefined) return;

      const missing = locatorSegmentsFor(operationsFor(fixture))
        .flatMap(requiredTokens)
        .filter((token) => !html.includes(token));
      expect(missing, `missing from fixtures/pages/${example.page}`).toEqual([]);
    },
  );

  it('serves every literal URL the corpus uses from a fixture page', () => {
    const served = new Set(Object.values(manifest.pages));
    const unmapped = fixtures
      .flatMap((fixture) => literalUrlsFor(operationsFor(fixture)))
      .filter((url) => !served.has(url));
    expect([...new Set(unmapped)].sort()).toEqual([]);
  });
});

// ── AC-18a: the same corpus, on real pinned Chromium. This closes story 10.3 AC-6b. ────────────

/**
 * Rewrites every URL an operation carries onto the loopback fixture server.
 *
 * The corpus files themselves are **untouched**: story 10.3 pinned them and
 * `SYNTAX_REFERENCE_VERSION` is compared exactly by `src/compat`, so editing a fixture to point at
 * loopback would be a runtime-compatibility change dressed up as a test convenience. The rewrite
 * happens on the typed operations, after validation, on the way to the browser.
 *
 * It is also what makes AC-19 true by construction rather than by hope: `127.0.0.1` needs no DNS,
 * so there is nothing for the browser to resolve outside the machine.
 */
function rewriteOperation(operation: Operation, server: PageServer): Operation {
  const literal = (value: string): string =>
    value.startsWith('https://example.com') ? server.rewrite(value) : value;
  const pattern = (source: string): string =>
    source.replace(
      String.raw`https:\/\/example\.com`,
      `http:\\/\\/127\\.0\\.0\\.1:${String(server.port)}`,
    );

  // Only the three operations that carry a URL are rewritten; every other operation crosses
  // unchanged, which is the point — the corpus is *executed*, not rewritten.
  if (operation.op === 'goto') {
    return operation.url.kind === 'literal'
      ? { ...operation, url: { ...operation.url, value: literal(operation.url.value) } }
      : operation;
  }
  if (operation.op === 'waitForURL') {
    if (operation.url.kind === 'literal') {
      return { ...operation, url: { ...operation.url, value: literal(operation.url.value) } };
    }
    return operation.url.kind === 'regex'
      ? { ...operation, url: { ...operation.url, source: pattern(operation.url.source) } }
      : operation;
  }
  if (operation.op === 'expectUrl') {
    if (operation.expected.kind === 'literal') {
      return {
        ...operation,
        expected: { ...operation.expected, value: literal(operation.expected.value) },
      };
    }
    return operation.expected.kind === 'regex'
      ? { ...operation, expected: { ...operation.expected, source: pattern(operation.expected.source) } }
      : operation;
  }
  return operation;
}

/**
 * The example's operations, bound to the loopback server.
 *
 * A navigation to the page the manifest binds the example to is prepended to the **first step**: a
 * browser starts on `about:blank`, and the manifest binding is the corpus's own statement of which
 * page each example is about. The example's own operations are executed unchanged, the step count
 * is unchanged, and every step keeps its own index — so what is asserted below is the corpus, not
 * a rewritten version of it.
 */
function stepsFor(fixture: ReferenceFixture, page: string, server: PageServer) {
  const validation = validateArtifact(fixture.artifact, fixture.source, fixture.references);
  if (!validation.ok) throw new Error(`${fixture.name} does not validate`);
  const boundUrl = server.rewrite(manifest.pages[page] ?? '');

  return validation.steps.map((step, index) => ({
    stepIndex: step.stepIndex,
    operations: [
      ...(index === 0
        ? [
            {
              op: 'goto' as const,
              url: { kind: 'literal' as const, value: boundUrl },
              options: { waitUntil: 'load' as const },
            },
          ]
        : []),
      ...(step.operations ?? []).map((operation) => rewriteOperation(operation, server)),
    ],
  }));
}

describe('reference corpus on the real pinned Chromium (10.3 AC-6b, 10.12 AC-18a)', () => {
  let server: PageServer;

  beforeAll(async () => {
    server = await startPageServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /**
   * Two runs of the whole corpus, compared.
   *
   * Determinism is the property that makes the corpus a gate rather than a demo: "the same corpus
   * executed twice yields identical per-step statuses and identical step counts" (AC-18a). One
   * flaky locator would make every later claim about the runner unfalsifiable.
   */
  it(
    'executes all 28 examples twice, identically, with CSS locators resolved in the live DOM',
    async () => {
      expect(fixtures).toHaveLength(28);

      const observed: Record<string, string[]>[] = [];
      for (let pass = 0; pass < 2; pass += 1) {
        const statuses: Record<string, string[]> = {};
        for (const fixture of fixtures) {
          const entry = manifest.examples.find((example) => example.name === fixture.name);
          expect(entry, `no manifest entry for ${fixture.name}`).toBeDefined();
          const outcome = await runReal({
            steps: stepsFor(fixture, entry?.page ?? 'home.html', server),
            variables: fixture.values.variables,
            secrets: fixture.values.secrets,
          });
          try {
            statuses[fixture.name] = outcome.finished.map((event) => event.status);
            expect(
              outcome.finished.every((event) => event.status === 'PASS'),
              `${fixture.name} did not pass on real Chromium: ` +
                JSON.stringify(outcome.finished.map((event) => event.failure)),
            ).toBe(true);
            expect(outcome.finished).toHaveLength(fixture.source.length);
          } finally {
            outcome.clear();
          }
        }
        observed.push(statuses);
      }

      expect(observed[1]).toEqual(observed[0]);
      // The CSS-selector example is the one the seam tier explicitly could not verify.
      expect(observed[0]?.['locator-css-click']).toEqual(['PASS']);
    },
    600_000,
  );

  it('reached the loopback fixture server and nothing else', () => {
    // Every navigation the corpus made was served here. AC-19 asserts the complementary property
    // — that the browser issued no request to anywhere else — from the browser's own side.
    expect(server.requests.length).toBeGreaterThan(0);
    for (const request of server.requests) {
      expect(request.host).toBe(`127.0.0.1:${String(server.port)}`);
    }
  });
});

/**
 * AC-18b — the same corpus **inside the pinned internal Playwright image**.
 *
 * Deliberately skipped, never silently passed. `ED-05` (the internal image) is open, and
 * `ci/stages.md` stage 6 is where it will run; story 10.18 closes it and 10.19 confirms it. This
 * story installs a browser on a developer machine and does not build or publish an image.
 *
 * Note that this is a **different** skip from the one story 10.3 left here: that one deferred the
 * real adapter itself and is deleted above, replaced by the assertion that runs.
 */
describe('reference corpus inside the pinned internal image (AC-18b)', () => {
  it.skip('executes every example inside the internal Playwright image — deferred to ED-05/10.18', () => {
    expect.unreachable('Story 10.18 owns this assertion; ED-05 gates it.');
  });
});
