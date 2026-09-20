import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  compilingDraft,
  conflictResponse,
  draftsByCompileStatus,
  rejectionResponse,
  staleDraft,
} from '@/services/mocks/studio/compileFixtures';
import { CompileReviewPanel, RECOMPILE_LABEL } from './CompileReviewPanel';
import { STUDIO_BASE } from './reviewTestHarness';

/**
 * Story 10.10 AC-14 — the explicit recompile, speaking the declared contract and nothing else.
 */

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const COMPILE_CONFLICTS: string[] =
  openapi.paths['/tests/{id}/compile'].post.responses['409']['x-conflict-codes'];

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('AC-14: an explicit recompile exists for the STALE case', () => {
  it('is offered in STALE and nowhere else', async () => {
    const offeredIn: string[] = [];
    for (const [state, fixture] of Object.entries(draftsByCompileStatus)) {
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixture)));
      const view = render(<CompileReviewPanel testId={fixture.id} />);
      await screen.findByTestId('compile-state-region');
      if (screen.queryByRole('button', { name: RECOMPILE_LABEL })) {
        offeredIn.push(state);
      }
      view.unmount();
    }
    expect(offeredIn).toEqual(['STALE']);
  });

  it('a 202 is rendered as acceptance, explicitly not as success', async () => {
    let reads = 0;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(reads === 1 ? staleDraft : compilingDraft);
      }),
      http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
        HttpResponse.json(
          {
            compileRequestId: '33333333-3333-3333-3333-333333333333',
            compileStatus: 'COMPILING',
            sourceRevision: staleDraft.sourceRevision,
            configurationRevision: staleDraft.configurationRevision,
          },
          { status: 202 },
        ),
      ),
    );

    render(<CompileReviewPanel testId={staleDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: RECOMPILE_LABEL }));

    const accepted = await screen.findByTestId('compile-accepted');
    expect(accepted.textContent).toMatch(/that is not a result/i);
    expect(accepted.textContent).toMatch(/may still end without anything runnable/i);
    expect(accepted.textContent).not.toMatch(/success|succeeded|done/i);

    await waitFor(async () => {
      const region = await screen.findByTestId('compile-state-region');
      expect(region.getAttribute('aria-label')).toBe('Translating your steps');
    });
  });

  it.each(['SOURCE_TOO_MANY_STEPS', 'SOURCE_LINE_TOO_LONG', 'SOURCE_TOO_LARGE', 'INLINE_CREDENTIAL'])(
    'handles the declared 400 %s [FX-REJECTION-SOURCE_TOO_MANY_STEPS] [FX-REJECTION-SOURCE_LINE_TOO_LONG] [FX-REJECTION-SOURCE_TOO_LARGE] [FX-REJECTION-INLINE_CREDENTIAL]',
    async (code) => {
      studioMockServer.use(
        http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(staleDraft)),
        http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
          HttpResponse.json(rejectionResponse(code), { status: 400 }),
        ),
      );

      render(<CompileReviewPanel testId={staleDraft.id} />);
      await userEvent.click(await screen.findByRole('button', { name: RECOMPILE_LABEL }));

      const rejection = await screen.findByTestId('compile-rejection');
      expect(rejection.textContent?.length ?? 0).toBeGreaterThan(40);
      expect(rejection.textContent).toContain(rejectionResponse(code).message);
      // The server's message names a step index, never the step's text.
      expect(rejection.textContent).not.toContain('Go to "https://www.citi.com"');
    },
  );

  it('handles the two declared 409 codes and offers no retry for either', async () => {
    expect(COMPILE_CONFLICTS).toEqual(['TEST_DELETED', 'TEST_QUARANTINED']);

    for (const code of COMPILE_CONFLICTS) {
      studioMockServer.resetHandlers();
      studioMockServer.use(
        http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(staleDraft)),
        http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
          HttpResponse.json(conflictResponse(code), { status: 409 }),
        ),
      );

      const view = render(<CompileReviewPanel testId={staleDraft.id} />);
      await userEvent.click(await screen.findByRole('button', { name: RECOMPILE_LABEL }));

      const conflict = await screen.findByTestId('conflict');
      if (code === 'TEST_QUARANTINED') {
        expect(conflict.textContent).toMatch(/your work is kept/i);
        expect(conflict.textContent).not.toMatch(/deleted/i);
      } else {
        expect(conflict.textContent).toMatch(/has been deleted/i);
      }
      view.unmount();
    }
  });
});
