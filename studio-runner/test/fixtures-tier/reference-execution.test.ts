import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createValueResolver, executeSteps } from '../../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from '../../src/executor/adapters/fake.js';
import type { LocatorSegment } from '../../src/executor/operations.js';
import { validateArtifact } from '../../src/validator/index.js';
import { loadReferenceFixtures, normalise, packageRoot } from '../helpers/corpus.js';
import {
  literalUrlsFor,
  loadReferenceManifest,
  locatorSegmentsFor,
  operationsFor,
} from '../helpers/reference-manifest.js';

/**
 * Fixture-corpus tier (ADR-001 §7.1, story 10.3 AC-6a).
 *
 * Every reference example runs end to end through the `BrowserAdapter` seam against the controlled
 * local HTML page the manifest binds it to. In this story the adapter is the fake from 10.2:
 * `ED-05` (the internal Playwright image) is open, so there is no pinned Chromium to launch and
 * nothing here downloads a browser — `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stays set everywhere.
 *
 * What this tier proves today:
 *  - the corpus drives the exact trusted-call sequence through the seam a real adapter implements;
 *  - every locator the corpus targets exists, by role/name/test-id/placeholder, in the page it is
 *    bound to, so the corpus and the pages cannot drift apart;
 *  - every literal URL the corpus uses is served by one of those pages.
 *
 * What it does **not** prove, and is deferred to 10.12 (AC-6b): that a real Chromium at the pinned
 * build resolves those locators in the live DOM. CSS `locator()` selectors in particular are not
 * verified here at all — see the skipped test at the bottom of this file.
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
 * matchers are checked: a regular expression or a `vars.get` value is resolved at run time and is
 * 10.12's business, and a CSS selector cannot be answered without a DOM.
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
      // Not statically verifiable; 10.12 resolves CSS selectors against the real DOM.
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
        fixture.source.map(() => 'PASSED'),
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

/**
 * AC-6b, verified in story 10.12 — deliberately skipped, never silently passed.
 *
 * Running the corpus on the real Playwright adapter needs a pinned Chromium build. `ED-05` (the
 * internal Playwright image) is open, so this stage is local-only and the pipeline records it as
 * **skipped** rather than green (ADR-001 §7.2 stage 6, `ci/stages.md`). 10.12 supplies the real
 * `BrowserAdapter`, serves `fixtures/pages/` at the URLs in `manifest.pages`, and replaces this
 * placeholder with the real assertion.
 */
describe('reference corpus on the real pinned Chromium (AC-6b)', () => {
  it.skip('executes every example against a real browser — deferred to story 10.12 (ED-05 open)', () => {
    expect.unreachable('Story 10.12 owns this assertion.');
  });
});
