import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { needsRevisionDraft } from '@/services/mocks/studio/compileFixtures';
import type { CompileDiagnostics, TestDto } from '@/types/studio/studioTypes';
import { RunControl } from './RunControl';

/**
 * VAL-009 — on Run, a compile that ends `NEEDS_REVISION` because the translator refused steps
 * names those steps in the author's terms and links each one to its line.
 */

const STUDIO_BASE = '*/api/v1/studio';

const refusals: CompileDiagnostics = {
  validatorSchemaVersion: '1.0.0',
  artifact: [],
  steps: needsRevisionDraft.steps.map((_, stepIndex) => ({
    stepIndex,
    ok: stepIndex !== 1 && stepIndex !== 3,
    truncated: false,
    diagnostics:
      stepIndex === 1
        ? [{ code: 'UNSUPPORTED_CAPABILITY', stepIndex, message: 'Server CPU is not visible to a browser.', node: null, excerpt: null }]
        : stepIndex === 3
          ? [{ code: 'AMBIGUOUS_INTENT', stepIndex, message: '<b>which</b> "Submit" button', node: null, excerpt: null }]
          : [],
  })),
  truncated: false,
  attempts: 1,
  exhausted: false,
};

const refused: TestDto = { ...needsRevisionDraft, compileDiagnostics: refusals };

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

function serveRefused(test: TestDto = refused) {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)),
    http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
      HttpResponse.json({ compileRequestId: 'r', compileStatus: 'COMPILING' }, { status: 202 }),
    ),
  );
}

describe('Run outcome for refused steps', () => {
  it('lists each refusal with its step, as plain text, and links it to that step', async () => {
    serveRefused();
    const onShowStep = vi.fn();
    const { container } = render(<RunControl testId={refused.id} runRequest={1} onShowStep={onShowStep} />);

    const outcome = await screen.findByTestId('run-compile-outcome', {}, { timeout: 10_000 });
    expect(within(outcome).getByTestId('run-compile-refusal-1')).toHaveTextContent(
      "Step 2 can't be done in a browser test: Server CPU is not visible to a browser. Rewrite or remove it.",
    );
    expect(within(outcome).getByTestId('run-compile-refusal-3')).toHaveTextContent(
      'Step 4 is ambiguous: <b>which</b> "Submit" button. Say exactly which element or value you mean.',
    );
    expect(container.querySelector('[data-testid="run-compile-refusals"] b')).toBeNull();

    await userEvent.setup({ delay: null }).click(within(outcome).getByRole('button', { name: 'Go to step 4' }));
    expect(onShowStep).toHaveBeenCalledWith(3);
  });

  it('lists no refusal for validator-only diagnostics', async () => {
    serveRefused(needsRevisionDraft);
    render(<RunControl testId={needsRevisionDraft.id} runRequest={1} onShowStep={vi.fn()} />);

    await screen.findByTestId('run-compile-outcome', {}, { timeout: 10_000 });
    expect(screen.queryByTestId('run-compile-refusals')).toBeNull();
  });
});
