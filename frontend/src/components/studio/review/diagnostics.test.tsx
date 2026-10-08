import {
  artifactRejectionDraft,
  CLAMPED_EXCERPT,
  CLAMPED_MESSAGE,
  clampedStringsDraft,
  compileReviewDrafts,
  documentTruncatedDraft,
  misalignedDraft,
  needsRevisionDraft,
  noCandidateArtifactDraft,
  notExhaustedDraft,
  stepTruncatedDraft
} from '@/services/mocks/studio/compileFixtures';
import {
  DIAGNOSTICS_CAPS,
  TRUNCATION_MARKER,
} from '@/services/mocks/studio/diagnosticsBounds';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { studioMockServer } from '@/services/mocks/studio/server';
import { screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderPanel } from './reviewTestHarness';
import { SOURCE_UNAVAILABLE, SUMMARY_UNAVAILABLE } from './StepReviewList';

/**
 * Story 10.10 — the diagnostics document, rendered without turning a bounded report into a false
 * one (AC-6, AC-7, AC-8), and the two slots the contract cannot yet fill (AC-16a).
 */

const REVIEW_DIR = __dirname;
const MOCKS_DIR = path.resolve(__dirname, '../../../services/mocks/studio');

/** Every non-test module this story adds, in both directories it touches. */
function collectModules(dir: string, added: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectModules(full, added);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      added.push(full);
    }
  }
  return added;
}

const STORY_SOURCE_MODULES = [...collectModules(REVIEW_DIR), ...collectModules(MOCKS_DIR)];

/** `import`/`export … from`, bare `import '…'`, dynamic `import(…)` and `require(…)`, any quote. */
function moduleSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|[^\w$])(?:import|export)\s[^;]*?from\s*(['"`])([^'"`]+)\1/gs,
    /(?:^|[^\w$])import\s*(['"`])([^'"`]+)\1/g,
    /(?:^|[^\w$])(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  ];
  const found = new Set<string>();
  const ordered: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      ordered.push(match[2]);
      found.add(match[2]);
    }
  }
  return ordered;
}

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('AC-6: one row per original step, index aligned', () => {
  it('attributes each reason to the line it belongs to, with an accepted step between two rejected ones [FX-ACCEPTED-BETWEEN-REJECTED]', async () => {
    renderPanel(needsRevisionDraft);
    await screen.findByTestId('step-review-list');

    // The fixture is deliberately not degenerate: an off-by-one join lands a reason on the
    // accepted step in the middle rather than landing coincidentally right.
    const rejectedFirst = await screen.findByTestId('step-diagnostics-1');
    expect(rejectedFirst.textContent).toContain('Nothing on the page is described as "Sign On"');

    const accepted = await screen.findByTestId('step-diagnostics-2');
    expect(accepted.textContent).not.toContain('Nothing on the page is described as "Sign On"');
    expect(accepted.textContent).not.toContain('Checking the address bar');

    const rejectedSecond = await screen.findByTestId('step-diagnostics-3');
    expect(rejectedSecond.textContent).toContain('Checking the address bar');

    expect(screen.queryByTestId('alignment-defect')).toBeNull();
  });

  it('renders exactly one row per step for every fixture', async () => {
    for (const fixture of compileReviewDrafts) {
      const view = renderPanel(fixture);
      await screen.findByTestId('step-review-list');
      const rows = view.container.querySelectorAll('[data-testid^="step-review-row-"]');
      expect(rows.length, `${fixture.id} rendered ${rows.length} rows`).toBe(fixture.steps.length);
      view.unmount();
    }
  });

  it('surfaces a document that does not line up as a defect rather than padding it [FX-MISALIGNED-DOCUMENT]', async () => {
    renderPanel(misalignedDraft);
    const defect = await screen.findByTestId('alignment-defect');
    expect(defect.textContent).toMatch(/do not line up/i);
    expect(defect.textContent).toContain(
      `${misalignedDraft.compileDiagnostics!.steps.length} entries for ${misalignedDraft.steps.length} lines`,
    );
    // Nothing was shifted or padded into the rows.
    expect(screen.queryByTestId('step-diagnostics-0')).toBeNull();
  });

  it('renders artifact-level rejections in their own region, attached to no step [FX-ARTIFACT-REJECTION]', async () => {
    renderPanel(artifactRejectionDraft);
    const region = await screen.findByTestId('artifact-diagnostics');
    expect(region.textContent).toContain('more actions than one test may hold');
    expect(region.textContent).toMatch(/belong to no single line/i);

    for (let index = 0; index < artifactRejectionDraft.steps.length; index += 1) {
      const row = await screen.findByTestId(`step-diagnostics-${index}`);
      expect(row.textContent).not.toContain('more actions than one test may hold');
    }
  });
});

describe('AC-7: all three truncation levels, each on a fixture that actually carries it', () => {
  it('level 1 — a clamped message and excerpt keep the marker the bounder put there [FX-TRUNC-CLAMPED-STRING]', async () => {
    // The fixture was produced by running the bounder's own clamp over a string that was really
    // over the cap, so the marker sits where the server would have put it. What this asserts is
    // that the marker survives rendering: not trimmed by the layout, not ellipsised away, not
    // lost to a second clamp.
    expect(CLAMPED_MESSAGE.length).toBe(DIAGNOSTICS_CAPS.maxMessageChars);
    expect(CLAMPED_EXCERPT.length).toBe(DIAGNOSTICS_CAPS.maxExcerptChars);

    const view = renderPanel(clampedStringsDraft);
    const row = await screen.findByTestId('step-diagnostics-1');

    const rendered = row.textContent ?? '';
    expect(rendered).toContain(CLAMPED_MESSAGE);
    expect(rendered).toContain(CLAMPED_EXCERPT);
    expect(rendered).toContain(TRUNCATION_MARKER);
    // The whole clamped string is present, marker and all — nothing shortened it on the way.
    expect(rendered.indexOf(CLAMPED_MESSAGE) + CLAMPED_MESSAGE.length).toBeLessThanOrEqual(
      rendered.length,
    );
    view.unmount();
  });

  it('level 2 — a step that lost diagnostics says so, in words distinct from "nothing more was wrong" [FX-TRUNC-STEP]', async () => {
    renderPanel(stepTruncatedDraft);
    const flag = await screen.findByTestId('step-truncated-1');
    expect(flag.textContent).toMatch(/more problems with this line than we are showing/i);
    expect(flag.textContent).toMatch(/not the same as there being no more problems/i);

    // A step with nothing wrong reads differently, which is the distinction the flag exists for.
    const quiet = await screen.findByTestId('step-diagnostics-0');
    expect(quiet.textContent).toMatch(/raised nothing against this line/i);
    expect(screen.queryByTestId('step-truncated-0')).toBeNull();
  });

  it('level 3 — a document that shed whole steps says which fact that is [FX-TRUNC-DOCUMENT]', async () => {
    renderPanel(documentTruncatedDraft);
    const flag = await screen.findByTestId('document-truncation');
    expect(flag.textContent).toMatch(/this list is incomplete/i);
    expect(flag.textContent).toMatch(/whole steps' reasons were left out/i);
    expect(flag.textContent).toContain('TOTAL_BYTES');
    expect(flag.textContent).toMatch(/may still have had one/i);
  });

  it('a document with no truncation renders no truncation flag', async () => {
    renderPanel(notExhaustedDraft);
    await screen.findByTestId('step-review-list');
    expect(screen.queryByTestId('document-truncation')).toBeNull();
    expect(screen.queryByTestId('step-truncated-1')).toBeNull();
  });
});

describe('AC-8: attempts and exhausted render as what they mean', () => {
  it('exhausted: true says the bound was reached and offers no retry [FX-EXHAUSTED-TRUE]', async () => {
    renderPanel(needsRevisionDraft);
    const repair = await screen.findByTestId('repair-attempts');
    expect(repair.textContent).toContain('Attempts: 3');
    expect(repair.textContent).toMatch(/as many times as it is allowed/i);
    expect(repair.textContent).toMatch(/asking again will reach the same place/i);
    expect(screen.queryByTestId('recompile-control')).toBeNull();
  });

  it('exhausted: false with attempts: 1 does not imply a repair happened [FX-EXHAUSTED-FALSE]', async () => {
    renderPanel(notExhaustedDraft);
    const repair = await screen.findByTestId('repair-attempts');
    expect(repair.textContent).toContain('Attempts: 1');
    expect(repair.textContent).toMatch(/tried once/i);
    expect(repair.textContent).toMatch(/nothing was re-attempted/i);
    expect(repair.textContent).not.toMatch(/re-working its own output/i);
  });

  it('says the document is the last attempt only, never a history', async () => {
    renderPanel(notExhaustedDraft);
    const repair = await screen.findByTestId('repair-attempts');
    expect(repair.textContent).toMatch(/last try only, not a history/i);
  });
});

/**
 * **Re-pointed by story 10.11c AC-28, not deleted.** Story 10.10 wrote these against a surface
 * where both slots were unavailable for every draft, because `artifactHash` and the artifact were
 * reachable from no declared response (AC-15). ADR-002 §21 closed that escalation and the slots
 * are now filled from `currentCandidateArtifact` — so the fixture moves to the draft that still
 * has no artifact, and the property 10.10 was actually protecting is kept verbatim: **the slot is
 * never filled from the English**. What the slots do when an artifact *is* present is
 * `artifactReview.test.tsx`'s, which is where the discriminating fixture lives.
 */
describe('AC-16a: with no artifact, both slots are unavailable and neither is filled from the English', () => {
  it('renders the unavailable summary for every step and never the English line inside the slot [FX-ARTIFACT-ABSENT]', async () => {
    const view = renderPanel(noCandidateArtifactDraft);
    await screen.findByTestId('step-review-list');

    for (let index = 0; index < noCandidateArtifactDraft.steps.length; index += 1) {
      const slot = await screen.findByTestId(`step-summary-${index}`);
      expect(slot.textContent).toBe(SUMMARY_UNAVAILABLE);
      expect(slot.textContent).not.toContain(noCandidateArtifactDraft.steps[index]);
    }

    const source = await screen.findByTestId('step-source-0');
    expect(source.textContent).toBe(SOURCE_UNAVAILABLE);
    view.unmount();
  });

  it('names why rather than rendering an empty slot [FX-ARTIFACT-ABSENT]', async () => {
    renderPanel(noCandidateArtifactDraft);
    const slot = await screen.findByTestId('step-summary-0');
    // No longer "AC-15": that escalation is closed. The reason is now the draft's own state, and
    // the sentence still has to be a sentence — 10.10's floor against an empty slot dressed up as
    // an honest one is kept.
    expect(slot.textContent).toMatch(/no translated candidate/i);
    expect(slot.textContent).toMatch(/nothing is guessed/i);
    expect(slot.textContent?.trim().length).toBeGreaterThan(40);
  });

  it('imports neither the legacy grammar parser nor the Python generator', () => {
    // The property here is about imports, so the instrument is the module text. It is not a
    // substitute for a behavioural assertion — the one above is that.
    //
    // Every module this story adds is scanned, not one directory of them, and every specifier
    // form is read, not one quote style: a single-quoted `from '…'` scan is blind to a
    // double-quoted import, a backtick `await import(…)`, and a `require(…)`, which is three ways
    // for the shortcut to be taken under time pressure without the guard noticing.
    const modules = STORY_SOURCE_MODULES.map((file) => [file, fs.readFileSync(file, 'utf8')] as const);
    expect(modules.length).toBeGreaterThanOrEqual(13);

    // Both modules were deleted by story 10.51. The paths stay as string literals (never imports) so
    // that re-introducing either module, and importing it from a story module, still fails here.
    const RETIRED = ['@/utils/studio/ir/parseSteps', '@/utils/studio/codegen/pythonGenerator'];

    for (const [file, source] of modules) {
      const specifiers = moduleSpecifiers(source);
      for (const retired of RETIRED) {
        const offending = specifiers.filter(
          (specifier) => specifier === retired || specifier.endsWith(retired.replace('@/', '/')),
        );
        expect(offending, `${path.relative(REVIEW_DIR, file)} imports ${retired}`).toEqual([]);
      }
    }
  });

  it('the pinned AC-2 expectations cannot be derived from the module they pin', () => {
    /*
     * QA finding PIN-1, the twelfth vacuity shape: a header comment is not a guard. QA performed
     * the refactor `pinnedNarratives.ts` warns against — deriving the phrases from
     * `COMPILE_STATE_NARRATIVES` — and the suite stayed fully green, because nothing compared the
     * pin's *provenance*. The layering held for blanking (the minimum-phrase and
     * minimum-rendered-length guards are independent of the pin) but fourteen of the fifteen facts
     * became silently rewordable, which is the regression path straight back into VAC-11.
     *
     * This is the one edge that must not exist. `studioContract.test.ts` stays free to import the
     * narratives module: it asserts set-equality against the **document's** enum, title
     * distinctness and the unknown-status throw — never rendered content against the module.
     */
    const pin = STORY_SOURCE_MODULES.find((file) => file.endsWith('pinnedNarratives.ts'));
    expect(pin, 'pinnedNarratives.ts is no longer where this guard looks for it').toBeDefined();

    const derived = moduleSpecifiers(fs.readFileSync(pin!, 'utf8')).filter((specifier) =>
      /(^|[./])compileStateNarratives$/.test(specifier.replace(/\.tsx?$/, '')),
    );

    expect(
      derived,
      'pinnedNarratives.ts imports the module it pins — the expected text would then be read back ' +
        'out of the thing under test, which is exactly the assertion VAC-11 removed',
    ).toEqual([]);
  });

  it('the import scanner sees every specifier form, so its silence means something', () => {
    // Without this, the scan above could be reading nothing at all — the shape this epic keeps
    // finding. Each line below is a way a module could reach the retired path.
    const planted = [
      "import { buildDefaultTestIR } from '@/utils/studio/ir/parseSteps';",
      'import { generatePythonFromIR } from "@/utils/studio/codegen/pythonGenerator";',
      "const mod = await import('@/utils/studio/ir/parseSteps');",
      "const gen = require('@/utils/studio/codegen/pythonGenerator');",
      'export { buildDefaultTestIR } from "@/utils/studio/ir/parseSteps";',
    ].join('\n');

    const found = moduleSpecifiers(planted);
    expect(found).toHaveLength(5);
    expect(found.filter((s) => s === '@/utils/studio/ir/parseSteps')).toHaveLength(3);
    expect(found.filter((s) => s === '@/utils/studio/codegen/pythonGenerator')).toHaveLength(2);

    // And it finds the real imports the modules genuinely have, so it is reading the files.
    const real = STORY_SOURCE_MODULES.flatMap((file) =>
      moduleSpecifiers(fs.readFileSync(file, 'utf8')),
    );
    expect(real).toContain('@/types/studio/studioTypes');
    expect(real).toContain('@mui/material');
  });
});
