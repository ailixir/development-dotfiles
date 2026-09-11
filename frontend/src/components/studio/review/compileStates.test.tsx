import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  compileReviewDrafts,
  draftsByCompileStatus,
  awaitingDraft,
  readyDraft,
  needsRevisionDraft,
  staleDraft,
  undeclaredCodeDraft,
  UNDECLARED_COMPILE_ERROR_CODE,
} from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { renderPanel } from './reviewTestHarness';
import { forbiddenClaimsIn } from './forbiddenClaims';
import { UNSUPPORTED_WORKFLOW_HEADING } from './unsupportedWorkflows';
import { COMPILE_ERROR_NARRATIVES, UNDECLARED_COMPILE_ERROR_NARRATIVE } from './compileErrorCodes';
import { narrativeFor } from './compileStateNarratives';

/**
 * Story 10.10 — the compile state is legible, and five states are not one state
 * (AC-1, AC-2, AC-3, AC-5, AC-9, AC-17, AC-19a).
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const DECLARED_STATES: string[] = openapi.components.schemas.TestDto.properties.compileStatus.enum;

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

async function renderState(test: TestDto) {
  const view = renderPanel(test);
  await screen.findByTestId('compile-state-region');
  return view;
}

describe('AC-1: every declared compileStatus renders its own state', () => {
  it('renders a distinct accessible name for each member of the document union [FX-STATE-COMPILING] [FX-STATE-AWAITING_CONFIRMATION] [FX-STATE-READY] [FX-STATE-NEEDS_REVISION] [FX-STATE-STALE]', async () => {
    expect(DECLARED_STATES.length).toBeGreaterThan(0);
    const seen = new Set<string>();

    for (const state of DECLARED_STATES) {
      const fixture = draftsByCompileStatus[state];
      expect(fixture, `no fixture covers compileStatus ${state}`).toBeDefined();
      const view = await renderState(fixture);
      const region = await screen.findByTestId('compile-state-region');
      const name = region.getAttribute('aria-label') ?? '';
      expect(name.length, `${state} renders an unnamed state`).toBeGreaterThan(0);
      expect(seen.has(name), `${state} renders the same state as an earlier member`).toBe(false);
      seen.add(name);
      view.unmount();
    }

    expect(seen.size).toBe(DECLARED_STATES.length);
  });
});

describe('AC-2: each state says what is true, what you may do, and what is blocked', () => {
  it.each(DECLARED_STATES)('%s renders its three facts and its own name', async (state) => {
    const narrative = narrativeFor(state);
    await renderState(draftsByCompileStatus[state]);

    const region = await screen.findByTestId('compile-state-region');
    const text = region.textContent ?? '';
    expect(text).toContain(narrative.title);
    expect(text).toContain(narrative.whatIsTrue);
    expect(text).toContain(narrative.whatYouCanDo);
    expect(text).toContain(narrative.whatIsBlocked);
  });

  it('AWAITING_CONFIRMATION says confirmation is the only route to runnable', async () => {
    await renderState(awaitingDraft);
    const text = (await screen.findByTestId('compile-state-region')).textContent ?? '';
    expect(text).toMatch(/not runnable/i);
    expect(text).toMatch(/only way this draft becomes runnable/i);
  });

  it('READY shows the identity of the revision that runs', async () => {
    await renderState(readyDraft);
    const identity = await screen.findByTestId('confirmed-identity');
    expect(identity.textContent).toContain(readyDraft.confirmedRevisionId!);
  });

  it('NEEDS_REVISION says retrying without editing will not help', async () => {
    await renderState(needsRevisionDraft);
    const text = (await screen.findByTestId('compile-state-region')).textContent ?? '';
    expect(text).toMatch(/without editing will reach the same place/i);
  });

  it('STALE says the draft is saved, an earlier confirmation still runs, and a recompile is the remedy', async () => {
    await renderState(staleDraft);
    const text = (await screen.findByTestId('compile-state-region')).textContent ?? '';
    expect(text).toMatch(/saved and unchanged/i);
    expect(text).toMatch(/still runs/i);
    expect(text).toMatch(/not in your steps/i);
    expect(text).toMatch(/ask for the translation again/i);
  });
});

describe('AC-3: a confirmed test whose draft moved is flagged, from the body', () => {
  const origins: Array<[string, TestDto]> = [
    [
      'a reload finding the candidate rejected',
      { ...needsRevisionDraft, confirmedRevisionId: '22222222-2222-2222-2222-222222222223' },
    ],
    [
      'a second tab finding a new candidate awaiting confirmation',
      { ...awaitingDraft, confirmedRevisionId: '22222222-2222-2222-2222-222222222223' },
    ],
    [
      'a configuration-only change that produced a new candidate',
      {
        ...awaitingDraft,
        confirmedRevisionId: '22222222-2222-2222-2222-222222222223',
        configurationRevision: awaitingDraft.configurationRevision + 1,
      },
    ],
  ];

  it.each(origins)('%s raises the flag', async (_name, fixture) => {
    await renderState(fixture);
    expect(await screen.findByTestId('needs-reconfirmation')).toBeInTheDocument();
  });

  it('a name or description change does not raise it — which is what proves the flag is not "dirty"', async () => {
    await renderState({
      ...readyDraft,
      name: 'Renamed after confirmation',
      description: 'Edited after confirmation',
    });
    await screen.findByTestId('compile-state-region');
    expect(screen.queryByTestId('needs-reconfirmation')).toBeNull();
  });
});

describe('AC-5: an undeclared compileError code renders honestly rather than blankly', () => {
  it('renders the generic narrative plus the code verbatim [FX-CODE-UNDECLARED]', async () => {
    await renderState(undeclaredCodeDraft);

    const panel = await screen.findByTestId('compile-error');
    expect(panel.textContent).toContain(UNDECLARED_COMPILE_ERROR_NARRATIVE);

    const code = await screen.findByTestId('compile-error-code');
    expect(code.textContent).toContain(UNDECLARED_COMPILE_ERROR_CODE);
    expect(code.textContent).not.toContain('undefined');
    expect(code.textContent?.trim().length).toBeGreaterThan(UNDECLARED_COMPILE_ERROR_CODE.length);

    // The generic STALE narrative is the one it borrows, so the state region still explains STALE.
    const region = await screen.findByTestId('compile-state-region');
    expect(region.getAttribute('aria-label')).toBe(narrativeFor('STALE').title);
  });

  it('renders a declared code with its own wording [FX-CODE-DECLARED]', async () => {
    await renderState(staleDraft);
    const panel = await screen.findByTestId('compile-error');
    expect(panel.textContent).toContain(COMPILE_ERROR_NARRATIVES.GATEWAY_TIMEOUT);
  });
});

describe('AC-17: the standing statement of what this version does not do', () => {
  it.each(['AWAITING_CONFIRMATION', 'NEEDS_REVISION'])(
    'is rendered in %s, before confirmation',
    async (state) => {
      await renderState(draftsByCompileStatus[state]);
      const standing = await screen.findByTestId('unsupported-workflows');
      expect(standing.textContent).toContain(UNSUPPORTED_WORKFLOW_HEADING);
      expect(standing.textContent).toMatch(/pop-up window/i);
      expect(standing.textContent).toMatch(/Multi-factor sign-on is not assumed to work/i);
    },
  );

  it('makes no per-step claim that a step is supported', async () => {
    await renderState(needsRevisionDraft);
    await screen.findByTestId('step-review-list');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/this step is supported/i);
    expect(text).not.toMatch(/supported step/i);
    // And it says up front that it did not look at the author's steps.
    expect(text).toMatch(/cannot look at your steps/i);
  });
});

describe('AC-9 / AC-19a: the surface makes no claim about what a step means', () => {
  it.each(compileReviewDrafts.map((fixture) => [fixture.compileStatus, fixture] as const))(
    'a %s fixture renders no forbidden claim',
    async (_state, fixture) => {
      const view = await renderState(fixture);
      // Rendered text, read back out of the DOM — never the component source, never the JSX.
      const rendered = view.container.textContent ?? '';
      expect(rendered.length).toBeGreaterThan(200);
      expect(forbiddenClaimsIn(rendered), `forbidden claim in a ${_state} render`).toEqual([]);
    },
  );

  it('says in words that an accepted step is not a statement of intent', async () => {
    await renderState(needsRevisionDraft);
    const row = await screen.findByTestId('step-diagnostics-0');
    expect(row.textContent).toMatch(/not a statement about whether the line matches what you had in mind/i);
  });

  it('no explanation is a bare enum value, and none leaves an identifier unrendered', async () => {
    for (const fixture of compileReviewDrafts) {
      const view = await renderState(fixture);
      const rendered = view.container.textContent ?? '';
      expect(rendered).not.toContain('undefined');
      expect(rendered).not.toContain('[object Object]');
      expect(rendered).not.toMatch(/^[A-Z_]+$/);
      view.unmount();
    }

    for (const [code, narrative] of Object.entries(COMPILE_ERROR_NARRATIVES)) {
      expect(narrative, `${code} is worded as its own name`).not.toBe(code);
      expect(narrative.split(' ').length, `${code} has a one-word explanation`).toBeGreaterThan(6);
    }
  });
});

describe('the tests waiting on a fixture that was actually written', () => {
  it('covers a draft carrying an opaque secret reference [FX-SECRET-REF]', async () => {
    const view = await renderState(awaitingDraft);
    const rendered = view.container.textContent ?? '';
    // §9.2: the MFE receives no resolved value, and this surface renders none either.
    expect(rendered).not.toContain('vault://studio/pilot-pw');
    expect(awaitingDraft.variables.some((variable) => variable.kind === 'secretRef')).toBe(true);
  });
});
