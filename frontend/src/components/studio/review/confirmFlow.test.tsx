import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import {
  awaitingDraft,
  conflictResponse,
  draftsByCompileStatus,
} from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import { CompileReviewPanel, CONFIRM_LABEL } from './CompileReviewPanel';
import { deferred, STUDIO_BASE } from './reviewTestHarness';
import * as reviewModule from './index';

/**
 * Story 10.10 — confirmation is exact, or it does not happen (AC-10, AC-11a, AC-12, AC-13).
 *
 * **Why the hash accessor is substituted here, and only here.** `artifactHash` is reachable from
 * no declared response (AC-15), so in production the accessor returns *unavailable* and no
 * confirmation request can leave the client at all. Asserting the body the client sends, the
 * state in which the control is live, and the `409` recovery therefore needs a world in which the
 * ruling has landed. `vi.mock` creates that world inside this module graph only: it adds nothing
 * to the shipped bundle, no environment read, no prop and no export. The production behaviour —
 * the control blocked with the blocker named — is asserted unmocked in `blockedConfirm.test.tsx`.
 * When the contract is amended, this file needs no edit; only the accessor's body changes.
 */

const HASH = 'a'.repeat(64);

vi.mock('./artifactHash', async () => {
  const actual = await vi.importActual<typeof import('./artifactHash')>('./artifactHash');
  return { ...actual, readArtifactHash: () => ({ available: true as const, value: HASH }) };
});

const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const DECLARED_STATES: string[] = openapi.components.schemas.TestDto.properties.compileStatus.enum;
const DECLARED_CONFLICT_CODES: string[] =
  openapi.paths['/tests/{id}/confirm-compile'].post.responses['409']['x-conflict-codes'];
const DECLARED_REQUIRED_BODY: string[] =
  openapi.components.schemas.ConfirmCompileRequest.required;

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

function serve(test: TestDto) {
  studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)));
  return render(<CompileReviewPanel testId={test.id} />);
}

describe('AC-10: the confirm control is live in exactly one state', () => {
  it('enumerating the document union, with the environment, the query string and the props at their production values', async () => {
    // The behavioural half, and it is the load-bearing one. Nothing is passed to the panel but
    // the draft id — no flag, no override, no permissive default.
    expect(DECLARED_STATES.length).toBeGreaterThan(0);
    const enabledIn: string[] = [];

    for (const state of DECLARED_STATES) {
      const view = serve(draftsByCompileStatus[state]);
      const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
      if (!(control as HTMLButtonElement).disabled) {
        enabledIn.push(state);
      }
      view.unmount();
    }

    expect(enabledIn).toEqual(['AWAITING_CONFIRMATION']);
  });

  it('stays blocked in AWAITING_CONFIRMATION when there is no candidate to confirm', async () => {
    serve({ ...awaitingDraft, currentCandidateRevisionId: null });
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    expect(control).toBeDisabled();
  });

  it('exports no escape hatch — a floor, not the assertion above', async () => {
    // Supplementary: enumerating exports is blind to a module-local env read, which is why the
    // five-state enumeration is the one that carries this criterion.
    expect(Object.keys(reviewModule).sort()).toEqual([
      'CONFIRM_LABEL',
      'CompileReviewPanel',
      'RECOMPILE_LABEL',
    ]);
  });
});

describe('AC-11a: the request body is exactly the four declared fields, from one response', () => {
  it('sends the four fields with the values of the body on screen, and nothing else', async () => {
    const bodies: unknown[] = [];
    let reads = 0;

    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        // A second read answers with a *newer* draft. Sourcing any field from it rather than from
        // the held response is the second falsification, and this is what makes it visible.
        return HttpResponse.json(
          reads === 1 ? awaitingDraft : { ...awaitingDraft, sourceRevision: 99, configurationRevision: 98 },
        );
      }),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...awaitingDraft, compileStatus: 'READY' });
      }),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    await userEvent.click(control);

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([...DECLARED_REQUIRED_BODY].sort());
    expect(body.revisionId).toBe(awaitingDraft.currentCandidateRevisionId);
    expect(body.artifactHash).toBe(HASH);
    expect(body.sourceRevision).toBe(awaitingDraft.sourceRevision);
    expect(body.configurationRevision).toBe(awaitingDraft.configurationRevision);
    expect(body.sourceRevision).not.toBe(99);
    expect(body.configurationRevision).not.toBe(98);
  });
});

describe('AC-13: a double activation sends one request', () => {
  it('a second activation while the first is in flight sends nothing and is not queued', async () => {
    const gate = deferred<void>();
    let requests = 0;

    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, async () => {
        requests += 1;
        // Held open. The window the guard has to close is constructed, not hoped for.
        await gate.promise;
        return HttpResponse.json({
          ...awaitingDraft,
          compileStatus: 'READY',
          confirmedRevisionId: awaitingDraft.currentCandidateRevisionId,
        });
      }),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });

    const user = userEvent.setup();
    await user.click(control);
    await waitFor(() => expect(requests).toBe(1));

    // The first request has reached the handler and has NOT settled: the second click lands
    // inside the measurement window rather than after it.
    await user.click(control);
    await user.click(control);
    expect(requests).toBe(1);

    gate.resolve();
    await waitFor(() => expect(screen.queryByTestId('confirmed-identity')).not.toBeNull());
    expect(requests).toBe(1);
  });
});

describe('AC-12: a 409 returns the reader to a fresh, deliberate review', () => {
  it('the declared conflict code set is the one this test drives', () => {
    expect(DECLARED_CONFLICT_CODES).toEqual(
      expect.arrayContaining(['STALE_CANDIDATE', 'TEST_DELETED', 'TEST_QUARANTINED']),
    );
    expect(DECLARED_CONFLICT_CODES).toHaveLength(3);
  });

  it('STALE_CANDIDATE refetches, renders what changed, and re-sends nothing [FX-CONFLICT-STALE_CANDIDATE]', async () => {
    let confirmRequests = 0;
    let reads = 0;
    const moved: TestDto = {
      ...awaitingDraft,
      sourceRevision: awaitingDraft.sourceRevision + 1,
      currentCandidateRevisionId: '22222222-2222-2222-2222-2222222222ff',
    };

    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => {
        reads += 1;
        return HttpResponse.json(reads === 1 ? awaitingDraft : moved);
      }),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () => {
        confirmRequests += 1;
        return HttpResponse.json(conflictResponse('STALE_CANDIDATE'), { status: 409 });
      }),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));

    const conflict = await screen.findByTestId('conflict');
    expect(conflict.textContent).toMatch(/no longer the current one/i);
    expect(conflict.textContent).toMatch(/refreshed to what the draft holds now/i);

    await waitFor(() => expect(reads).toBe(2));
    // Refreshed, unconfirmed, and nothing was re-sent on the reader's behalf.
    expect(confirmRequests).toBe(1);
    expect(screen.queryByTestId('confirmed-identity')).toBeNull();
    const control = await screen.findByRole('button', { name: CONFIRM_LABEL });
    expect(control).toBeEnabled();

    await new Promise((settle) => setTimeout(settle, 50));
    expect(confirmRequests).toBe(1);
  });

  it('TEST_DELETED offers no retry [FX-CONFLICT-TEST_DELETED]', async () => {
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () =>
        HttpResponse.json(conflictResponse('TEST_DELETED'), { status: 409 }),
      ),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));

    const conflict = await screen.findByTestId('conflict');
    expect(conflict.textContent).toMatch(/has been deleted/i);
    expect(conflict.textContent).toMatch(/Nothing here will change that/i);
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
  });

  it('TEST_QUARANTINED says the work survives, never that it was deleted, and offers no restore [FX-CONFLICT-TEST_QUARANTINED]', async () => {
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () =>
        HttpResponse.json(conflictResponse('TEST_QUARANTINED'), { status: 409 }),
      ),
    );

    render(<CompileReviewPanel testId={awaitingDraft.id} />);
    await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));

    const conflict = await screen.findByTestId('conflict');
    expect(conflict.textContent).toMatch(/your work is kept/i);
    expect(conflict.textContent).toMatch(/nothing has been removed/i);
    expect(conflict.textContent).not.toMatch(/deleted/i);
    expect(screen.queryByRole('button', { name: /restore|undelete|retry/i })).toBeNull();
  });

  it('branches on the code even when every message is replaced by an unrelated string', async () => {
    const NONSENSE = 'weather report for tuesday';

    for (const code of DECLARED_CONFLICT_CODES) {
      studioMockServer.resetHandlers();
      studioMockServer.use(
        http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(awaitingDraft)),
        http.post(`${STUDIO_BASE}/tests/:id/confirm-compile`, () =>
          HttpResponse.json({ error: code, message: NONSENSE }, { status: 409 }),
        ),
      );

      const view = render(<CompileReviewPanel testId={awaitingDraft.id} />);
      await userEvent.click(await screen.findByRole('button', { name: CONFIRM_LABEL }));
      const conflict = await screen.findByTestId('conflict');

      // The explanation is derived from the code; the prose is shown but never read.
      if (code === 'STALE_CANDIDATE') {
        expect(conflict.textContent).toMatch(/no longer the current one/i);
      } else if (code === 'TEST_DELETED') {
        expect(conflict.textContent).toMatch(/has been deleted/i);
      } else {
        expect(conflict.textContent).toMatch(/your work is kept/i);
      }
      expect(conflict.textContent).toContain(NONSENSE);
      view.unmount();
    }
  });
});
