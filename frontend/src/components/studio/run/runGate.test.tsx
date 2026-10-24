import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { setGuidedStartCapability } from '@/services/mocks/studio/capabilityHandlers';
import { fixtureDetail, fixtureStepId } from '@/services/mocks/studio/authoringState';
import {
  draftsByReadiness,
  learningDraft,
  needsRelearnDraft,
  readyDraft,
  unlearnedDraft,
} from '@/services/mocks/studio/readinessFixtures';
import type { TestDetailDto, TestDto } from '@/types/studio/studioTypes';
import type { GuidedStartRefusal, GuidedStartRequest } from '@/types/studio/studioGuidedTypes';
import { guidedCopy } from '@/components/studio/guided/guidedNarratives';
import { RunControl, RUN_LABEL, type RunControlProps } from './RunControl';
import { useRunGate } from './useRunGate';
import { EXECUTE_CONFLICT_NARRATIVES } from './executeRefusals';
import { LEARNED_READY_LABEL } from './runEnablement';

/**
 * Story 10.11a — the run gate is the server's — on the single path of STUDIO-OBS-008 AC-2
 * (ADR-SC-005): readiness comes from `GET /tests/{id}`. `READY` replays through the ordinary
 * execute; `UNLEARNED` starts a guided learning session; `NEEDS_RELEARN` starts a mixed-mode one from
 * the server's first changed step; `LEARNING` keeps Run disabled.
 *
 * **Everything that counts is counted at the mock server**, and the guided start is counted at the
 * one function the gate is given for it (`startLearn`, the page's `useGuidedSession`). The import
 * scan at the end is the weaker supplement and nothing rests on it alone.
 */

const STUDIO_BASE = '*/api/v1/studio';
const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
/** Read from the document, never from the module under test (VAC-11). */
const DECLARED_STATES: string[] = openapi.components.schemas.TestDto.properties.readiness.enum;

/** Every request the server saw, in order. Never a spy: a spy is one layer from the wire. */
const observed: { method: string; url: string }[] = [];

function record({ request }: { request: Request }) {
  observed.push({ method: request.method, url: request.url });
}

function executeRequests(): { method: string; url: string }[] {
  return observed.filter((entry) => entry.method === 'POST' && entry.url.includes('/execute'));
}

function capabilityReads(): { method: string; url: string }[] {
  return observed.filter((entry) => entry.method === 'GET' && /\/tests\/[^/]+\/capabilities$/u.test(entry.url));
}

/**
 * Every request outside the run gate's own reads and its one write. The single path has no
 * client-side preparation step, so anything else Run sends is a second, undeclared path. The guided
 * start itself is not a request of this control: it is the injected `startLearn`.
 */
function unexpectedRequests(): { method: string; url: string }[] {
  return observed.filter(
    (entry) =>
      !(entry.method === 'GET' && /\/tests\/[^/]+(\?.*)?$/u.test(entry.url)) &&
      !(entry.method === 'GET' && entry.url.includes('/schedule/capabilities')) &&
      !(entry.method === 'GET' && /\/tests\/[^/]+\/capabilities$/u.test(entry.url)) &&
      !(entry.method === 'POST' && /\/tests\/[^/]+\/execute$/u.test(entry.url)),
  );
}

beforeAll(() => {
  studioMockServer.listen({ onUnhandledRequest: 'error' });
  studioMockServer.events.on('request:start', record);
});
beforeEach(() => {
  observed.length = 0;
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => {
  studioMockServer.events.removeListener('request:start', record);
  studioMockServer.close();
});

/**
 * The draft for a declared state. A lookup with a constructed fallback rather than a bare lookup:
 * a fifth member added to an in-test copy of the document must reach a real render, not fall out
 * of the loop as `undefined` and quietly prove nothing.
 */
function draftFor(state: string): TestDto {
  return (
    (draftsByReadiness as Record<string, TestDto>)[state] ?? {
      ...readyDraft,
      readiness: state as TestDto['readiness'],
    }
  );
}

/** Observes a render-time throw so it is asserted rather than escaping as an unhandled error. */
class LoudFailureBoundary extends React.Component<
  { children: React.ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    return this.state.message === null ? (
      this.props.children
    ) : (
      <div data-testid="loud-failure">{this.state.message}</div>
    );
  }
}

/** The guided start the gate is given: it records each request and resolves like an answered start. */
function startLearnSpy() {
  return vi.fn(async (_request: GuidedStartRequest) => undefined);
}

function serve(test: TestDto | TestDetailDto, props: Partial<RunControlProps> = {}) {
  studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)));
  return render(<RunControl testId={test.id} startLearn={startLearnSpy()} {...props} />);
}

/** Waits until the control has read the test: `data-run-mode` leaves `loading`. */
async function settledControl(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: RUN_LABEL });
  await waitFor(() => expect(control.getAttribute('data-run-mode')).not.toBe('loading'));
  return control;
}

/** The start context the capability mirror serves for a readiness fixture (plan P6). */
function contextOf(test: TestDto) {
  return {
    schemaVersion: 3,
    testId: test.id,
    sourceRevision: String(test.sourceRevision),
    configurationRevision: String(test.configurationRevision),
    environmentId: test.environment,
    applicationId: test.csiId,
    versions: { contract: 3 },
  };
}

describe('AC-1 / STUDIO-OBS-008 AC-2: Run acts in every state but LEARNING', () => {
  it('enumerating every readiness the document declares — FX-RUNGATE-STATE-UNLEARNED, FX-RUNGATE-STATE-LEARNING, FX-RUNGATE-STATE-READY, FX-RUNGATE-STATE-NEEDS_RELEARN', async () => {
    expect(DECLARED_STATES.length).toBeGreaterThan(0);
    const enabledIn: string[] = [];
    const modes: Record<string, string | null> = {};

    for (const state of DECLARED_STATES) {
      const view = serve(fixtureDetail(draftFor(state)));
      const control = await settledControl();
      modes[state] = control.getAttribute('data-run-mode');
      if (!control.hasAttribute('disabled')) {
        enabledIn.push(state);
      }
      view.unmount();
    }

    // One Run, three modes: replay, learn, mixed-mode learn. A running session disables it.
    expect(enabledIn.slice().sort()).toEqual(['NEEDS_RELEARN', 'READY', 'UNLEARNED']);
    expect(modes).toEqual({ UNLEARNED: 'learn', LEARNING: 'busy', READY: 'replay', NEEDS_RELEARN: 'relearn' });
  });

  it('a state the document does not declare is a loud failure rather than a permissive default', async () => {
    // `runModeFor` throws, so a fifth value cannot render a control at all — enabled or
    // disabled. The boundary is here only so the throw is observed rather than escaping.
    const fifth = { ...readyDraft, readiness: 'SOMETHING_ELSE' as TestDto['readiness'] };
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fifth)));

    render(
      <LoudFailureBoundary>
        <RunControl testId={fifth.id} />
      </LoudFailureBoundary>,
    );

    const caught = await screen.findByTestId('loud-failure');
    expect(caught.textContent).toMatch(/Unknown readiness "SOMETHING_ELSE"/);
    expect(screen.queryByRole('button', { name: RUN_LABEL })).toBeNull();
  });

  it('without a guided transport, a draft that needs learning cannot be run from the control', async () => {
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(unlearnedDraft))));
    render(<RunControl testId={unlearnedDraft.id} />);
    const control = await settledControl();
    expect(control).toBeDisabled();
    fireEvent.click(control);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeRequests()).toHaveLength(0);
    expect(capabilityReads()).toHaveLength(0);
  });
});

describe('STUDIO-OBS-008 AC-2: one Run, three modes, no hidden executions', () => {
  it('(a) READY: Run sends one execute and nothing else, and starts no guided session', async () => {
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: '77777777-7777-7777-7777-777777777770', status: 'PENDING' }, { status: 202 }),
      ),
    );
    const startLearn = startLearnSpy();
    serve(readyDraft, { startLearn });
    const control = await settledControl();
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    await waitFor(() => expect(executeRequests()).toHaveLength(1));
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(0);
    expect(unexpectedRequests(), 'Run sent something other than its reads and one execute').toEqual([]);
  });

  it('(b) UNLEARNED: Run reads the capability after the fresh read and starts with its exact context, no hints', async () => {
    const startLearn = startLearnSpy();
    serve(fixtureDetail(unlearnedDraft), { startLearn });
    const control = await settledControl();
    await userEvent.click(control);

    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toEqual(contextOf(unlearnedDraft));
    expect(startLearn.mock.calls[0][0]).not.toHaveProperty('baseRevisionId');
    expect(startLearn.mock.calls[0][0]).not.toHaveProperty('firstLearnStepId');
    expect(capabilityReads()).toHaveLength(1);
    expect(executeRequests()).toHaveLength(0);
    expect(unexpectedRequests()).toEqual([]);
  });

  it('(c) NEEDS_RELEARN: the start carries baseRevisionId = confirmedRevisionId and firstLearnStepId = firstChangedStepId, as served (D-3)', async () => {
    const startLearn = startLearnSpy();
    serve(fixtureDetail(needsRelearnDraft), { startLearn });
    const control = await settledControl();
    expect(screen.getByTestId('guided-readiness-chip')).toHaveTextContent('Steps changed — next Run learns from step 2');
    await userEvent.click(control);

    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toEqual({
      ...contextOf(needsRelearnDraft),
      baseRevisionId: needsRelearnDraft.confirmedRevisionId,
      firstLearnStepId: needsRelearnDraft.firstChangedStepId,
    });
    expect(executeRequests()).toHaveLength(0);
  });

  it('(d) D-4: NEEDS_RELEARN with BASE_IDENTITY_INCOMPLETE says saved learning cannot be reused and starts from the first current step', async () => {
    const startLearn = startLearnSpy();
    const draft: TestDetailDto = { ...fixtureDetail(needsRelearnDraft), readinessReason: 'BASE_IDENTITY_INCOMPLETE' };
    serve(draft, { startLearn });
    const control = await settledControl();
    const chip = screen.getByTestId('guided-readiness-chip');
    expect(chip).toHaveTextContent('Saved learning cannot be reused — next Run learns from step 1');
    expect(chip.textContent).not.toMatch(/changed/i);
    await userEvent.click(control);

    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toEqual({
      ...contextOf(needsRelearnDraft),
      baseRevisionId: needsRelearnDraft.confirmedRevisionId,
      firstLearnStepId: fixtureStepId(0),
    });
  });

  it('(e) D-4: a 409 BASE_IDENTITY_INCOMPLETE start refusal offers "Learn again from step 1", which starts only when pressed', async () => {
    const startLearn = startLearnSpy();
    const refusal: GuidedStartRefusal = {
      httpStatus: 409,
      error: { schemaVersion: 3, code: 'REVISION_CONFLICT', requestId: 'r-1', retryable: false, messageCode: 'BASE_IDENTITY_INCOMPLETE' },
      platformCode: null,
      retryAfterSeconds: null,
    };
    serve(fixtureDetail(needsRelearnDraft), { startLearn, guidedStartRefusal: refusal });
    await settledControl();
    const feedback = await screen.findByTestId('guided-start-feedback');
    expect(feedback).toHaveTextContent('Saved learning cannot be reused, so this Run has to learn from step 1. Nothing was started.');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(startLearn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Learn again from step 1' }));
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toEqual({
      ...contextOf(needsRelearnDraft),
      baseRevisionId: needsRelearnDraft.confirmedRevisionId,
      firstLearnStepId: fixtureStepId(0),
    });
  });

  it('(f) LEARNING: Run is disabled while a session runs and sends nothing, programmatic requests included', async () => {
    const startLearn = startLearnSpy();
    serve(fixtureDetail(learningDraft), { startLearn, runRequest: 1 });
    const control = await settledControl();
    expect(control).toBeDisabled();
    fireEvent.click(control);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).not.toHaveBeenCalled();
    expect(executeRequests()).toHaveLength(0);
    expect(unexpectedRequests()).toEqual([]);
  });

  it('(f2) L5b-F1: LEARNING with no session this page follows says so beside the disabled Run; a followed session does not', async () => {
    const view = serve(fixtureDetail(learningDraft));
    const control = await settledControl();
    expect(control).toBeDisabled();
    const elsewhere = screen.getByTestId('run-learning-elsewhere');
    expect(elsewhere).toHaveTextContent(guidedCopy('learningElsewhere'));
    // W5 UX-04: Run does not come back by itself, so the sentence says what brings the page to read again.
    expect(elsewhere).toHaveTextContent('Refresh test information');
    view.unmount();

    serve(fixtureDetail(learningDraft), { followsLearningSession: true });
    await settledControl();
    expect(screen.queryByTestId('run-learning-elsewhere')).toBeNull();
  });

  it('(g) guidedStart unavailable: learning could not start is said with the code, no cause and no "save again", and no start is sent (P6, P4, W5 UX-01)', async () => {
    setGuidedStartCapability(unlearnedDraft.id, { available: false, code: 'RUNTIME_INCOMPATIBLE' });
    const startLearn = startLearnSpy();
    serve(fixtureDetail(unlearnedDraft), { startLearn });
    await userEvent.click(await settledControl());

    const feedback = await screen.findByTestId('guided-start-feedback');
    expect(feedback).toHaveTextContent(guidedCopy('guidedStartUnavailable'));
    expect(screen.getByTestId('guided-start-feedback-code')).toHaveTextContent('RUNTIME_INCOMPATIBLE');
    expect(feedback).not.toHaveTextContent('Save the test again');
    expect(feedback).not.toHaveTextContent(EXECUTE_CONFLICT_NARRATIVES.RUNTIME_INCOMPATIBLE.title);
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(1);
  });

  it('(h) a start context that disagrees with the fresh read starts nothing (P6)', async () => {
    setGuidedStartCapability(unlearnedDraft.id, {
      available: true,
      context: {
        schemaVersion: 3,
        testId: unlearnedDraft.id,
        sourceRevision: String(unlearnedDraft.sourceRevision + 1),
        configurationRevision: String(unlearnedDraft.configurationRevision),
        environmentId: unlearnedDraft.environment,
        applicationId: unlearnedDraft.csiId as string,
        versions: { contract: 3 },
      },
    });
    const startLearn = startLearnSpy();
    serve(fixtureDetail(unlearnedDraft), { startLearn });
    await userEvent.click(await settledControl());

    expect(await screen.findByTestId('guided-start-mismatch')).toHaveTextContent(
      'Press Run again to start from the latest saved steps.',
    );
    expect(startLearn).not.toHaveBeenCalled();
  });

  it('(i) D-11: a draft with no steps is not started, by the button or by a programmatic request', async () => {
    const startLearn = startLearnSpy();
    serve({ ...fixtureDetail(unlearnedDraft), steps: [] }, { startLearn, hasSteps: false, runRequest: 1 });
    const control = await settledControl();
    expect(control).toBeDisabled();
    expect(screen.getByTestId('run-blocked-reason')).toHaveTextContent('Add a step to run this test.');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(0);
  });

  it('(j) A1.6: a "Learn again" request starts from that step on the confirmed revision, only while the A1 conditions hold', async () => {
    const startLearn = startLearnSpy();
    const ready = fixtureDetail(readyDraft);
    const stepId = fixtureStepId(1);
    const view = serve(ready, { startLearn });
    await settledControl();
    view.rerender(
      <RunControl
        testId={ready.id}
        startLearn={startLearn}
        learnRequest={{ token: 1, request: { kind: 'drift', stepId, revisionId: readyDraft.confirmedRevisionId as string } }}
      />,
    );
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(startLearn.mock.calls[0][0]).toEqual({
      ...contextOf(readyDraft),
      baseRevisionId: readyDraft.confirmedRevisionId,
      firstLearnStepId: stepId,
    });

    // A superseded revision: the conditions no longer hold on the fresh read, so nothing starts.
    view.rerender(
      <RunControl
        testId={ready.id}
        startLearn={startLearn}
        learnRequest={{ token: 2, request: { kind: 'drift', stepId, revisionId: '33333333-3333-3333-3333-333333333333' } }}
      />,
    );
    await waitFor(() => expect(observed.filter((entry) => entry.method === 'GET' && /\/tests\/[^/]+$/u.test(entry.url)).length).toBeGreaterThanOrEqual(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).toHaveBeenCalledTimes(1);
    expect(executeRequests()).toHaveLength(0);
    // W5 UX-13: nothing starts, and the page says so rather than staying silent.
    expect(await screen.findByTestId('guided-start-mismatch')).toHaveTextContent(guidedCopy('revisionNotReady'));
  });

  it('(j2) A1.6 case 4 at the gate: a "Learn again" request is dropped when the fresh read says NEEDS_RELEARN, even for the confirmed revision, and says so (tech gate L5b, W5 UX-13)', async () => {
    const startLearn = startLearnSpy();
    const needs = fixtureDetail(needsRelearnDraft);
    expect(needs.confirmedRevisionId).not.toBeNull();
    const view = serve(needs, { startLearn });
    await settledControl();
    view.rerender(
      <RunControl
        testId={needs.id}
        startLearn={startLearn}
        learnRequest={{
          token: 1,
          request: { kind: 'drift', stepId: fixtureStepId(1), revisionId: needs.confirmedRevisionId as string },
        }}
      />,
    );
    await waitFor(() =>
      expect(observed.filter((entry) => entry.method === 'GET' && /\/tests\/[^/]+$/u.test(entry.url)).length).toBeGreaterThanOrEqual(2),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The ordinary Run already learns from the server's k; the client never sends another step.
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(0);
    expect(executeRequests()).toHaveLength(0);
    expect(await screen.findByTestId('guided-start-mismatch')).toHaveTextContent(guidedCopy('revisionNotReady'));
  });

  it('(k) a 409 LEARN_REQUIRED from execute is shown as itself, once, with no preparation narrative', async () => {
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json(
          { error: 'LEARN_REQUIRED', message: 'No published revision matches the draft; run it to learn it' },
          { status: 409 },
        ),
      ),
    );

    serve(readyDraft);
    const control = await settledControl();
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    const refusal = await screen.findByTestId('run-refusal');
    expect(screen.getByTestId('run-refusal-title').textContent).toBe(
      'This test has not learned its current steps',
    );
    expect(refusal.textContent).toMatch(/A Run that learns the steps clears this\./);
    // The STUDIO-OBS-012B interim clause is gone with the interim state.
    expect(refusal.textContent).not.toMatch(/learning is not yet available in this build/i);
    // No retry and no preparation step: the server's refusal is the authority.
    expect(executeRequests()).toHaveLength(1);
    expect(unexpectedRequests()).toEqual([]);
    expect(document.body.textContent).not.toMatch(/prepar|translat|confirm the/i);
  });

  it('(l) a dirty READY draft whose save leaves it unlearned learns after the save, and executes nothing', async () => {
    let served: TestDto | TestDetailDto = fixtureDetail(readyDraft);
    let saves = 0;
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(served)));
    const save = async () => {
      saves += 1;
      served = { ...fixtureDetail(readyDraft), readiness: 'UNLEARNED', confirmedRevisionId: null };
      return 'saved' as const;
    };
    const startLearn = startLearnSpy();

    render(<RunControl testId={readyDraft.id} isDirty onSaveBeforeRun={save} startLearn={startLearn} />);
    const control = await settledControl();
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(saves).toBe(1);
    expect(startLearn.mock.calls[0][0]).toEqual(contextOf(readyDraft));
    expect(executeRequests()).toHaveLength(0);
    expect(unexpectedRequests()).toEqual([]);
  });

  it('(m) the learned chip says "Learned · ready to repeat" for READY', async () => {
    serve(readyDraft);
    const chip = await screen.findByTestId('guided-readiness-chip');
    expect(chip.textContent).toBe(LEARNED_READY_LABEL);
    expect(LEARNED_READY_LABEL).toBe('Learned · ready to repeat');
  });

  it('(n) UX-A11Y-001: unsaved edits hide the readiness chip, and Run stays available because it saves first', async () => {
    const view = serve(readyDraft);
    await screen.findByTestId('guided-readiness-chip');

    view.rerender(<RunControl testId={readyDraft.id} isDirty startLearn={startLearnSpy()} />);
    await waitFor(() => expect(screen.queryByTestId('guided-readiness-chip')).toBeNull());
    expect(screen.getByRole('button', { name: RUN_LABEL })).not.toBeDisabled();
    // The STUDIO-OBS-012B interim region and sentence are gone with the interim state.
    expect(screen.queryByTestId('run-learning-unavailable-status')).toBeNull();
    expect(document.body.textContent).not.toMatch(/learning is not yet available/i);
  });

  it('(o) the busy spinner is decorative and names no retired phase', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let served: TestDto | TestDetailDto = fixtureDetail(readyDraft);
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(served)));
    const save = async () => {
      await held;
      served = { ...fixtureDetail(readyDraft), readiness: 'UNLEARNED', confirmedRevisionId: null };
      return 'saved' as const;
    };
    const startLearn = startLearnSpy();

    const view = render(<RunControl testId={readyDraft.id} isDirty onSaveBeforeRun={save} startLearn={startLearn} />);
    const control = await settledControl();
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    await waitFor(() => expect(control.textContent).toBe('Saving…'));
    const spinner = view.container.querySelector('.MuiCircularProgress-root');
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(view.container.querySelector('[aria-label*="repar" i]')).toBeNull();
    release();
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    expect(executeRequests()).toHaveLength(0);
  });
});

describe('W5-1 / W5-11: a stored session whose read was refused blocks learning, never a replay', () => {
  it('(p) W5-1: unreadable never blocks a READY replay; learn and relearn are off with the caption', async () => {
    const readyView = serve(fixtureDetail(readyDraft), { sessionUnreadable: true });
    const replay = await settledControl();
    expect(replay.getAttribute('data-run-mode')).toBe('replay');
    await waitFor(() => expect(replay).not.toBeDisabled());
    expect(screen.queryByTestId('run-session-unreadable')).toBeNull();
    readyView.unmount();

    for (const [draft, mode] of [
      [unlearnedDraft, 'learn'],
      [needsRelearnDraft, 'relearn'],
    ] as const) {
      const view = serve(fixtureDetail(draft), { sessionUnreadable: true });
      const control = await settledControl();
      expect(control.getAttribute('data-run-mode')).toBe(mode);
      expect(control).toBeDisabled();
      expect(screen.getByTestId('run-session-unreadable')).toHaveTextContent(guidedCopy('sessionUnreadable'));
      view.unmount();
    }
  });

  it('(q) W5-11: a learn request while unreadable starts nothing, shows the caption, and is not replayed when the session reads', async () => {
    const startLearn = startLearnSpy();
    const ready = fixtureDetail(readyDraft);
    const view = serve(ready, { startLearn, sessionUnreadable: true });
    await settledControl();
    expect(screen.queryByTestId('run-session-unreadable')).toBeNull();
    const request = {
      token: 1,
      request: { kind: 'drift', stepId: fixtureStepId(1), revisionId: readyDraft.confirmedRevisionId as string },
    } as const;

    view.rerender(<RunControl testId={ready.id} startLearn={startLearn} sessionUnreadable learnRequest={request} />);
    expect(await screen.findByTestId('run-session-unreadable')).toHaveTextContent(guidedCopy('sessionUnreadable'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(0);

    // The session reads now. The same token must not fire: nothing starts on its own.
    view.rerender(<RunControl testId={ready.id} startLearn={startLearn} sessionUnreadable={false} learnRequest={request} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(startLearn).not.toHaveBeenCalled();
    expect(capabilityReads()).toHaveLength(0);
    expect(executeRequests()).toHaveLength(0);
  });

  it('(r) W5-1: "Learn again from step 1" is disabled while unreadable', async () => {
    const startLearn = startLearnSpy();
    const refusal: GuidedStartRefusal = {
      httpStatus: 409,
      error: { schemaVersion: 3, code: 'REVISION_CONFLICT', requestId: 'r-1', retryable: false, messageCode: 'BASE_IDENTITY_INCOMPLETE' },
      platformCode: null,
      retryAfterSeconds: null,
    };
    serve(fixtureDetail(needsRelearnDraft), { startLearn, guidedStartRefusal: refusal, sessionUnreadable: true });
    await settledControl();
    await screen.findByTestId('guided-start-feedback');
    const learnAgain = screen.getByRole('button', { name: 'Learn again from step 1' });
    expect(learnAgain).toBeDisabled();
    fireEvent.click(learnAgain);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).not.toHaveBeenCalled();
  });
});

describe('AC-2: client-side English-grammar validation is no longer an execution gate', () => {
  it('the discriminating half: a draft runs when the server says READY', async () => {
    // The step grammar validator is retired. Nothing on the run path consults the English, so the
    // server's READY alone dispatches the run.
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: '77777777-7777-7777-7777-777777777777', status: 'PENDING' }, { status: 202 }),
      ),
    );

    serve(readyDraft);
    const control = await settledControl();
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    await waitFor(() => expect(executeRequests()).toHaveLength(1));
    expect(executeRequests()).toHaveLength(1);
  });

  it('the companion half: the client’s opinion of the English still gates nothing — the server’s state decides what Run does', async () => {
    // The same English, two server answers. Only the server's readiness changes what Run does.
    let served: TestDto = unlearnedDraft;
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(served)));
    const startLearn = startLearnSpy();

    const view = render(<RunControl testId={unlearnedDraft.id} refreshToken={0} startLearn={startLearn} />);
    const control = await settledControl();
    expect(control.getAttribute('data-run-mode')).toBe('learn');

    served = { ...readyDraft, id: unlearnedDraft.id, steps: unlearnedDraft.steps };
    view.rerender(<RunControl testId={unlearnedDraft.id} refreshToken={1} startLearn={startLearn} />);
    await waitFor(() => expect(screen.getByRole('button', { name: RUN_LABEL }).getAttribute('data-run-mode')).toBe('replay'));
    expect(screen.getByRole('button', { name: RUN_LABEL })).not.toBeDisabled();
    expect(executeRequests()).toHaveLength(0);
    expect(startLearn).not.toHaveBeenCalled();
  });

  it('a programmatic run request is governed by the same predicate as the button', async () => {
    // `?autorun=1` and the terminal-error surface's re-run both come through `runRequest`. A
    // second activation path that skipped the gate would be the defect this story removed, put
    // back by a different door. LEARNING is the state in which the predicate says no.
    const startLearn = startLearnSpy();
    serve(learningDraft, { runRequest: 1, startLearn });
    await settledControl();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeRequests()).toHaveLength(0);
    expect(startLearn).not.toHaveBeenCalled();
    expect(unexpectedRequests()).toEqual([]);
  });

  it('a second activation while the first is in flight produces one request, not two', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/execute`, async () => {
        await held;
        return HttpResponse.json(
          { executionId: '77777777-7777-7777-7777-777777777778', status: 'PENDING' },
          { status: 202 },
        );
      }),
    );

    render(<RunControl testId={readyDraft.id} />);
    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);
    await userEvent.click(control, { pointerEventsCheck: 0 });
    release();

    await waitFor(() => expect(executeRequests().length).toBeGreaterThan(0));
    expect(executeRequests()).toHaveLength(1);
  });

  it('a second activation while a guided start is in flight starts once', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startLearn = vi.fn(async (_request: GuidedStartRequest) => {
      await held;
    });
    serve(fixtureDetail(unlearnedDraft), { startLearn });
    const control = await settledControl();
    await userEvent.click(control);
    await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
    await userEvent.click(control, { pointerEventsCheck: 0 });
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(startLearn).toHaveBeenCalledTimes(1);
  });
});

describe('AC-3(a): client-generated Python is retired', () => {
  it('renders no generator-derived text for any fixture', async () => {
    // The falsification is wiring generated Python back in. The retired Python generator (deleted
    // by story 10.51) emitted these lines for every draft regardless of its steps, so they are
    // pinned here as static strings. Each is long and specific enough that a comparison against it
    // cannot pass for an empty rendering. The Code view that hosted this check is gone
    // (STUDIO-OBS-012B); the Run surface is what renders for every draft now.
    const GENERATED_PYTHON_LINES = [
      '# Generated by Checks Studio',
      '# target: Playwright (Python)',
      'from playwright.sync_api import sync_playwright, expect',
      'with sync_playwright() as p:',
      'browser = p.chromium.launch(headless=True)',
      'page = context.new_page()',
      'if __name__ == "__main__":',
    ];
    for (const line of GENERATED_PYTHON_LINES) {
      expect(line.length, 'a forbidden line too short to be distinctive').toBeGreaterThan(12);
    }

    const drafts = Object.values(draftsByReadiness);
    expect(drafts.length).toBeGreaterThan(0);

    for (const draft of drafts) {
      const view = serve(fixtureDetail(draft));
      await settledControl();
      const rendered = view.container.textContent ?? '';
      expect(rendered.length).toBeGreaterThan(0);
      for (const line of GENERATED_PYTHON_LINES) {
        expect(rendered, `the Run surface rendered generated source: ${line}`).not.toContain(line);
      }
      view.unmount();
    }
  });
});

describe('Story 10.48 AC-10b: Run is disabled, with a reason, when the server says the caller may not run', () => {
  const capabilityReads = () =>
    observed.filter((entry) => entry.method === 'GET' && entry.url.includes('/schedule/capabilities'));

  function serveCapabilities(response: () => Response | Promise<Response>) {
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)),
      http.get(`${STUDIO_BASE}/tests/:id/schedule/capabilities`, response),
    );
  }

  const capabilities = (canManage: boolean) =>
    HttpResponse.json({
      enabled: false,
      canManage,
      availableExecutionPrincipals: [],
      localAuthorizationOnly: true,
      policy: null,
    });

  it('canManage false: Run stays visible, disabled, described by on-page text, and sends nothing', async () => {
    serveCapabilities(() => capabilities(false));
    render(<RunControl testId={readyDraft.id} />);

    const reason = await screen.findByTestId('run-not-permitted');
    const control = screen.getByRole('button', { name: RUN_LABEL });
    expect(control).toBeVisible();
    expect(control).toBeDisabled();
    expect(reason).toBeVisible();
    expect(reason.textContent).toMatch(/do not have permission to run tests for this CSI/i);
    // Screen readers: the reason is the button's accessible description, not a tooltip.
    expect(control).toHaveAttribute('aria-describedby', reason.id);
    expect(control).toHaveAccessibleDescription(reason.textContent ?? '');

    // Keyboard: tabbing and pressing Enter or Space reaches no execute.
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    // A pointer click on the disabled control (MUI sets pointer-events: none, so dispatch it).
    fireEvent.click(control);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeRequests()).toHaveLength(0);
    expect(unexpectedRequests()).toEqual([]);
  });

  it('canManage true: Run is enabled and carries no reason', async () => {
    serveCapabilities(() => capabilities(true));
    render(<RunControl testId={readyDraft.id} />);

    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(capabilityReads()).toHaveLength(1));
    await waitFor(() => expect(control).not.toBeDisabled());
    expect(screen.queryByTestId('run-not-permitted')).toBeNull();
    expect(control).not.toHaveAttribute('aria-describedby');
  });

  it('a failed capabilities read is unknown, never a denial: Run stays enabled', async () => {
    serveCapabilities(() => HttpResponse.json({ error: 'BOOM', message: 'down' }, { status: 500 }));
    render(<RunControl testId={readyDraft.id} />);

    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(capabilityReads().length).toBeGreaterThan(0));
    await waitFor(() => expect(control).not.toBeDisabled());
    expect(screen.queryByTestId('run-not-permitted')).toBeNull();
  });

  it('a pending capabilities read does not disable Run', async () => {
    serveCapabilities(() => new Promise<Response>(() => {}));
    render(<RunControl testId={readyDraft.id} />);

    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(control).not.toBeDisabled());
    expect(screen.queryByTestId('run-not-permitted')).toBeNull();
  });

  it('reads the capability once per selected test, not once per render or refresh', async () => {
    // Its own id, so a GET retry the failed-read case above leaves behind (apiClient retries 5xx
    // GETs with backoff) cannot be counted here under load.
    const selected = { ...readyDraft, id: 'a0000000-0000-0000-0000-00000000c4b1' };
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(selected)),
      http.get(`${STUDIO_BASE}/tests/:id/schedule/capabilities`, () => capabilities(false)),
    );
    const readsOfSelected = () => capabilityReads().filter((entry) => entry.url.includes(selected.id));
    const view = render(<RunControl testId={selected.id} refreshToken={1} />);
    await screen.findByTestId('run-not-permitted');
    view.rerender(<RunControl testId={selected.id} refreshToken={2} />);
    view.rerender(<RunControl testId={selected.id} refreshToken={3} isDirty />);
    await waitFor(() => expect(screen.getByRole('button', { name: RUN_LABEL })).toBeDisabled());
    expect(readsOfSelected()).toHaveLength(1);
  });
});

/*
 * Story 10.51 RETIRED guard, relocated here from `review/diagnostics.test.tsx` by STUDIO-OBS-012B
 * (AC-1; cleanup inventory G7) before that file was deleted with `review/**`. Both modules below
 * were deleted by story 10.51. The paths stay as string literals (never imports) so that
 * re-introducing either module, and importing it from a Studio module, still fails here.
 */
const FRONTEND_SRC = path.resolve(__dirname, '../../..');
const GUARDED_DIRECTORIES = [
  path.join(FRONTEND_SRC, 'components/studio'),
  path.join(FRONTEND_SRC, 'services/mocks/studio'),
  path.join(FRONTEND_SRC, 'services/api'),
];

/** Every non-test module under the guarded directories. */
function collectModules(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectModules(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** `import`/`export … from`, bare `import '…'`, dynamic `import(…)` and `require(…)`, any quote. */
function moduleSpecifiers(source: string): string[] {
  const patterns = [
    /(?:^|[^\w$])(?:import|export)\s[^;]*?from\s*(['"`])([^'"`]+)\1/gs,
    /(?:^|[^\w$])import\s*(['"`])([^'"`]+)\1/g,
    /(?:^|[^\w$])(?:import|require)\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
  ];
  const ordered: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      ordered.push(match[2]);
    }
  }
  return ordered;
}

describe('story 10.51 RETIRED guard (relocated by STUDIO-OBS-012B)', () => {
  const GUARDED_MODULES = GUARDED_DIRECTORIES.flatMap((dir) => collectModules(dir));

  it('imports neither the legacy grammar parser nor the Python generator', () => {
    // The property here is about imports, so the instrument is the module text. Every specifier
    // form is read, not one quote style: a single-quoted `from '…'` scan is blind to a
    // double-quoted import, a backtick `await import(…)`, and a `require(…)`.
    const modules = GUARDED_MODULES.map((file) => [file, fs.readFileSync(file, 'utf8')] as const);
    expect(modules.length).toBeGreaterThanOrEqual(13);

    const RETIRED = ['@/utils/studio/ir/parseSteps', '@/utils/studio/codegen/pythonGenerator'];

    for (const [file, source] of modules) {
      const specifiers = moduleSpecifiers(source);
      for (const retired of RETIRED) {
        const offending = specifiers.filter(
          (specifier) => specifier === retired || specifier.endsWith(retired.replace('@/', '/')),
        );
        expect(offending, `${path.relative(FRONTEND_SRC, file)} imports ${retired}`).toEqual([]);
      }
    }
  });

  it('the import scanner sees every specifier form, so its silence means something', () => {
    // Without this, the scan above could be reading nothing at all. Each line below is a way a
    // module could reach the retired path.
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
    const real = GUARDED_MODULES.flatMap((file) => moduleSpecifiers(fs.readFileSync(file, 'utf8')));
    expect(real).toContain('@/types/studio/studioTypes');
    expect(real).toContain('@mui/material');
  });
});


/**
 * STUDIO-UNIFY-001.1, tasks 1.12 and 1.13 (DC-01, AC-29): the capabilities-settled signal and the
 * dedicated autorun request. `autorunRequest` is separate from `runRequest`, so "Run again" is
 * unchanged, and it is evaluated once: when the gate's own read has completed and the capabilities
 * read has settled (answered or failed), it is served if Run is runnable and dropped if not.
 */
describe('DC-01: capabilitiesSettled, and the autorun request evaluated once at the settle', () => {
  const capabilitiesBody = (canManage: boolean) => ({
    enabled: false,
    canManage,
    availableExecutionPrincipals: [],
    localAuthorizationOnly: true,
    policy: null,
  });

  /** A capabilities answer the test releases by hand, or one that fails. */
  function serveCapabilities(kind: 'allowed' | 'denied' | 'fails', { held = false }: { held?: boolean } = {}) {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id/schedule/capabilities`, async () => {
        if (held) await gate;
        return kind === 'fails'
          ? HttpResponse.json({ error: 'NOT_FOUND', message: 'No' }, { status: 404 })
          : HttpResponse.json(capabilitiesBody(kind === 'allowed'));
      }),
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: '77777777-7777-7777-7777-777777777779', status: 'PENDING' }, { status: 202 }),
      ),
    );
    return { release };
  }

  const request = (testId: string, token = 1) => ({ token, testId });

  describe('useRunGate().capabilitiesSettled', () => {
    it('is false while the capabilities read is pending and true once it answers', async () => {
      const capabilities = serveCapabilities('allowed', { held: true });
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(readyDraft))));
      const { result } = renderHook(() => useRunGate(readyDraft.id));

      await waitFor(() => expect(result.current.readDone).toBe(true));
      expect(result.current.capabilitiesSettled).toBe(false);
      expect(result.current.executePermission).toBe('unknown');

      await act(async () => capabilities.release());
      await waitFor(() => expect(result.current.capabilitiesSettled).toBe(true));
      expect(result.current.executePermission).toBe('allowed');
    });

    it('is true after a failed read too, with the permission still unknown', async () => {
      serveCapabilities('fails');
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(readyDraft))));
      const { result } = renderHook(() => useRunGate(readyDraft.id));

      await waitFor(() => expect(result.current.capabilitiesSettled).toBe(true));
      expect(result.current.executePermission).toBe('unknown');
    });

    it('is true when the answer says canManage false', async () => {
      serveCapabilities('denied');
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(readyDraft))));
      const { result } = renderHook(() => useRunGate(readyDraft.id));

      await waitFor(() => expect(result.current.capabilitiesSettled).toBe(true));
      expect(result.current.executePermission).toBe('denied');
    });

    it('resets when the test id changes, and is settled for the new id only when its read settles', async () => {
      const capabilities = serveCapabilities('allowed');
      studioMockServer.use(
        http.get(`${STUDIO_BASE}/tests/:id`, ({ params }) =>
          HttpResponse.json(fixtureDetail(params.id === unlearnedDraft.id ? unlearnedDraft : readyDraft)),
        ),
      );
      const { result, rerender } = renderHook(({ id }) => useRunGate(id), { initialProps: { id: readyDraft.id } });
      await waitFor(() => expect(result.current.capabilitiesSettled).toBe(true));

      // The next id's capabilities answer is held, so a leftover `true` would show.
      const second = serveCapabilities('allowed', { held: true });
      rerender({ id: unlearnedDraft.id });
      expect(result.current.capabilitiesSettled).toBe(false);
      await waitFor(() => expect(result.current.readDone).toBe(true));
      expect(result.current.capabilitiesSettled).toBe(false);
      await act(async () => second.release());
      await waitFor(() => expect(result.current.capabilitiesSettled).toBe(true));
      capabilities.release();
    });

    it('is false with no test id', () => {
      const { result } = renderHook(() => useRunGate(null));
      expect(result.current.capabilitiesSettled).toBe(false);
      expect(result.current.readDone).toBe(false);
    });
  });

  describe('RunControl autorunRequest', () => {
    it('is served once when the gate has settled and Run is runnable, and settles the page', async () => {
      serveCapabilities('allowed');
      const onAutorunSettled = vi.fn();
      const view = serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id), onAutorunSettled });

      await waitFor(() => expect(executeRequests()).toHaveLength(1));
      expect(onAutorunSettled).toHaveBeenCalledTimes(1);
      // A fresh object with the same token (the page re-renders) is not a second request.
      view.rerender(
        <RunControl testId={readyDraft.id} autorunRequest={request(readyDraft.id)} onAutorunSettled={onAutorunSettled} />,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(executeRequests()).toHaveLength(1);
    });

    it('waits for the capabilities read: nothing is sent before it settles, one execute after', async () => {
      const capabilities = serveCapabilities('allowed', { held: true });
      serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id) });

      const control = await settledControl();
      await waitFor(() => expect(control).not.toBeDisabled());
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);

      await act(async () => capabilities.release());
      await waitFor(() => expect(executeRequests()).toHaveLength(1));
    });

    it('a capabilities read that fails leaves the permission unknown and still runs, once', async () => {
      serveCapabilities('fails');
      serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id) });

      await waitFor(() => expect(executeRequests()).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(executeRequests()).toHaveLength(1);
    });

    it('is dropped when canManage is false, and the existing caption explains why', async () => {
      serveCapabilities('denied');
      serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id) });

      expect(await screen.findByTestId('run-not-permitted')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(executeRequests()).toHaveLength(0);
    });

    it('is dropped for a LEARNING test and does not fire later when it becomes READY', async () => {
      serveCapabilities('allowed');
      const startLearn = startLearnSpy();
      let served: TestDetailDto = fixtureDetail(learningDraft);
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(served)));
      const view = render(
        <RunControl testId={learningDraft.id} startLearn={startLearn} autorunRequest={request(learningDraft.id)} />,
      );
      await settledControl();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);

      served = { ...fixtureDetail(readyDraft), id: learningDraft.id };
      view.rerender(
        <RunControl
          testId={learningDraft.id}
          refreshToken={1}
          startLearn={startLearn}
          autorunRequest={request(learningDraft.id)}
        />,
      );
      await waitFor(() => expect(screen.getByRole('button', { name: RUN_LABEL }).getAttribute('data-run-mode')).toBe('replay'));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);
      expect(startLearn).not.toHaveBeenCalled();
    });

    it('is dropped when the draft has no steps, and the first typed step does not fire it', async () => {
      serveCapabilities('allowed');
      const view = serve(fixtureDetail(readyDraft), { hasSteps: false, autorunRequest: request(readyDraft.id) });
      await settledControl();
      expect(await screen.findByTestId('run-blocked-reason')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);

      view.rerender(
        <RunControl testId={readyDraft.id} hasSteps autorunRequest={request(readyDraft.id)} startLearn={startLearnSpy()} />,
      );
      await waitFor(() => expect(screen.getByRole('button', { name: RUN_LABEL })).not.toBeDisabled());
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);
    });

    it('an UNLEARNED test with steps starts exactly one guided session and no execute', async () => {
      serveCapabilities('allowed');
      const startLearn = startLearnSpy();
      studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(unlearnedDraft))));
      render(<RunControl testId={unlearnedDraft.id} startLearn={startLearn} autorunRequest={request(unlearnedDraft.id)} />);

      await waitFor(() => expect(startLearn).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(startLearn).toHaveBeenCalledTimes(1);
      expect(executeRequests()).toHaveLength(0);
    });

    it('waits while the request is armed for another test id', async () => {
      serveCapabilities('allowed');
      serve(fixtureDetail(readyDraft), { autorunRequest: request(unlearnedDraft.id) });
      await settledControl();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(executeRequests()).toHaveLength(0);
    });

    it('pressing Run before the settle drops it: one execute, none after the capabilities answer', async () => {
      const capabilities = serveCapabilities('allowed', { held: true });
      serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id) });

      const control = await settledControl();
      await waitFor(() => expect(control).not.toBeDisabled());
      await userEvent.click(control);
      await waitFor(() => expect(executeRequests()).toHaveLength(1));

      await act(async () => capabilities.release());
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(executeRequests()).toHaveLength(1);
    });

    it('"Run again" (runRequest) is unchanged: each new token runs once, with or without an autorun', async () => {
      serveCapabilities('allowed');
      const view = serve(fixtureDetail(readyDraft), { autorunRequest: request(readyDraft.id), isRunning: false });
      await waitFor(() => expect(executeRequests()).toHaveLength(1));

      // The page shows the accepted run, it ends, and the gate is released (VAL-039); then "Run again".
      view.rerender(<RunControl testId={readyDraft.id} isRunning />);
      view.rerender(<RunControl testId={readyDraft.id} isRunning={false} runRequest={1} />);
      await waitFor(() => expect(executeRequests()).toHaveLength(2));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(executeRequests()).toHaveLength(2);
    });
  });
});
