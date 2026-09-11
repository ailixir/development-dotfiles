import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  artifactRejectionDraft,
  awaitingDraft,
  CLAMPED_EXCERPT,
  CLAMPED_MESSAGE,
  clampedStringsDraft,
  compileReviewDrafts,
  documentTruncatedDraft,
  misalignedDraft,
  needsRevisionDraft,
  notExhaustedDraft,
  stepTruncatedDraft,
} from '@/services/mocks/studio/compileFixtures';
import {
  DIAGNOSTICS_CAPS,
  TRUNCATION_MARKER,
} from '@/services/mocks/studio/diagnosticsBounds';
import { renderPanel } from './reviewTestHarness';
import { SOURCE_UNAVAILABLE, SUMMARY_UNAVAILABLE } from './StepReviewList';

/**
 * Story 10.10 — the diagnostics document, rendered without turning a bounded report into a false
 * one (AC-6, AC-7, AC-8), and the two slots the contract cannot yet fill (AC-16a).
 */

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

describe('AC-16a: two slots, both unavailable, neither filled from the English', () => {
  it('renders the unavailable summary for every step and never the English line inside the slot', async () => {
    const view = renderPanel(awaitingDraft);
    await screen.findByTestId('step-review-list');

    for (let index = 0; index < awaitingDraft.steps.length; index += 1) {
      const slot = await screen.findByTestId(`step-summary-${index}`);
      expect(slot.textContent).toBe(SUMMARY_UNAVAILABLE);
      expect(slot.textContent).not.toContain(awaitingDraft.steps[index]);
    }

    const source = await screen.findByTestId('step-source-0');
    expect(source.textContent).toBe(SOURCE_UNAVAILABLE);
    view.unmount();
  });

  it('names the blocker rather than rendering an empty slot', async () => {
    renderPanel(awaitingDraft);
    const slot = await screen.findByTestId('step-summary-0');
    expect(slot.textContent).toMatch(/AC-15/);
    expect(slot.textContent?.trim().length).toBeGreaterThan(40);
  });

  it('imports neither the legacy grammar parser nor the Python generator', () => {
    // The property here is about imports, so the instrument is the module text. It is not a
    // substitute for a behavioural assertion — the one above is that.
    const dir = __dirname;
    const modules = fs
      .readdirSync(dir)
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(modules.length).toBeGreaterThan(5);

    for (const name of modules) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
      expect(imports, `${name} imports the legacy grammar parser`).not.toContain(
        '@/utils/studio/ir/parseSteps',
      );
      expect(imports, `${name} imports the retired Python generator`).not.toContain(
        '@/utils/studio/codegen/pythonGenerator',
      );
    }
  });
});
