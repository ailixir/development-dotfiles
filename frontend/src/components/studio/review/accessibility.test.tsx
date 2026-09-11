import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  awaitingDraft,
  draftsByCompileStatus,
  needsRevisionDraft,
  staleDraft,
} from '@/services/mocks/studio/compileFixtures';
import { renderPanel } from './reviewTestHarness';
import { CONFIRM_LABEL, RECOMPILE_LABEL } from './CompileReviewPanel';
import { narrativeFor } from './compileStateNarratives';

/**
 * Story 10.10 AC-18a — operable and programmatically described, asserted on the rendered
 * accessibility tree rather than on props.
 *
 * **This is not a conformance claim.** It proves roles, accessible names, keyboard operability,
 * a live region and the step↔diagnostics association. A WCAG conformance audit with an
 * assistive-technology pass is AC-18b, owned by story 10.19, and is recorded skipped rather than
 * approximated here. No `axe-core` is added: adding a test dependency is a tooling decision this
 * story does not take.
 */

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('AC-18a: every control has a role and an accessible name', () => {
  it('the confirm control is a button with a name, in every state', async () => {
    for (const fixture of Object.values(draftsByCompileStatus)) {
      const view = renderPanel(fixture);
      const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
      expect(control).toHaveAccessibleName(CONFIRM_LABEL);
      view.unmount();
    }
  });

  it('the recompile control is a button with a name', async () => {
    renderPanel(staleDraft);
    const control = await screen.findByRole('button', { name: RECOMPILE_LABEL });
    expect(control).toHaveAccessibleName(RECOMPILE_LABEL);
  });

  it('each expand control names the step it expands and reports its own state', async () => {
    renderPanel(awaitingDraft);
    const control = await screen.findByRole('button', { name: /Show the code for step 1/i });
    expect(control).toHaveAttribute('aria-expanded', 'false');
    expect(control).toHaveAttribute('aria-controls', 'step-source-0');
  });
});

describe('AC-18a: keyboard alone reaches and operates the controls', () => {
  it('tab reaches the expand control and Enter operates it', async () => {
    renderPanel(awaitingDraft);
    const control = await screen.findByRole('button', { name: /Show the code for step 1/i });

    const user = userEvent.setup();
    for (let hop = 0; hop < 12; hop += 1) {
      await user.tab();
      if (document.activeElement === control) {
        break;
      }
    }
    expect(document.activeElement).toBe(control);

    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Hide the code for step 1/i })).toBeInTheDocument(),
    );
  });

  it('Space operates the expand control too', async () => {
    renderPanel(awaitingDraft);
    const control = await screen.findByRole('button', { name: /Show the code for step 1/i });
    const user = userEvent.setup();
    control.focus();
    await user.keyboard('{ }');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Hide the code for step 1/i })).toBeInTheDocument(),
    );
  });

  it('the recompile control is reachable by keyboard and fires on Enter', async () => {
    renderPanel(staleDraft);
    const control = await screen.findByRole('button', { name: RECOMPILE_LABEL });
    const user = userEvent.setup();
    control.focus();
    expect(document.activeElement).toBe(control);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByTestId('compile-accepted')).not.toBeNull());
  });
});

describe('AC-18a: state changes are announced and diagnostics are associated with their step', () => {
  it('a live region carries the state name', async () => {
    renderPanel(awaitingDraft);
    const region = await screen.findByTestId('compile-state-live-region');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
    expect(region.textContent).toBe(narrativeFor('AWAITING_CONFIRMATION').title);
  });

  it("each step's diagnostics are programmatically associated with that step", async () => {
    renderPanel(needsRevisionDraft);
    const row = await screen.findByTestId('step-review-row-1');
    const describedBy = row.getAttribute('aria-describedby');
    expect(describedBy).toBe('step-1-diagnostics');

    const described = document.getElementById(describedBy!);
    expect(described).not.toBeNull();
    expect(described!.textContent).toContain('Nothing on the page is described as "Sign On"');

    // A step with nothing against it is not falsely associated.
    const quiet = await screen.findByTestId('step-review-row-2');
    expect(quiet.getAttribute('aria-describedby')).toBeNull();
  });

  it('the step list and the state region are landmarks with names', async () => {
    renderPanel(needsRevisionDraft);
    const list = await screen.findByTestId('step-review-list');
    expect(list.getAttribute('aria-label')).toBe('Your steps, and what happened to each');
    const state = await screen.findByTestId('compile-state-region');
    expect(state.getAttribute('aria-label')).toBe(narrativeFor('NEEDS_REVISION').title);
  });
});
