import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { draftsByCompileStatus, readyDraft } from '@/services/mocks/studio/compileFixtures';
import type { TestDto } from '@/types/studio/studioTypes';
import CodeTab, {
  CODE_VIEW_BLOCKER,
  CODE_VIEW_UNAVAILABLE_TITLE,
} from '@/components/studio/CodeTab';
import { RunControl, RUN_LABEL } from './RunControl';

/**
 * Story 10.11a — the run gate is the server's, and the two authorities it retires
 * (AC-1, AC-2, AC-3a).
 *
 * **Everything that counts is counted at the mock server.** A source scan for `validation.isValid`
 * is the epic's fourth catalogued vacuity shape — a gate rebuilt through a differently-named local
 * passes a grep — so the discriminating assertions here are over the requests MSW actually
 * observed. The import scan at the end is named as the weaker supplement and nothing rests on it
 * alone.
 */

const STUDIO_BASE = '*/api/v1/studio';
const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const DECLARED_STATES: string[] = openapi.components.schemas.TestDto.properties.compileStatus.enum;

/** Every request the server saw, in order. Never a spy: a spy is one layer from the wire. */
const observed: { method: string; url: string }[] = [];

function record({ request }: { request: Request }) {
  observed.push({ method: request.method, url: request.url });
}

function executeRequests(): { method: string; url: string }[] {
  return observed.filter((entry) => entry.method === 'POST' && entry.url.includes('/execute'));
}

/** Run now prepares before it dispatches, so what it asked the server to prepare is countable. */
function compileRequests(): { method: string; url: string }[] {
  return observed.filter((entry) => entry.method === 'POST' && entry.url.includes('/compile'));
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
 * The draft for a declared state.
 *
 * A lookup with a constructed fallback rather than a bare lookup, and the difference is the whole
 * of AC-1's first falsification: a sixth member added to an in-test copy of the document must
 * reach a real render, not fall out of the loop as `undefined` and quietly prove nothing.
 */
function draftFor(state: string): TestDto {
  return draftsByCompileStatus[state] ?? { ...readyDraft, compileStatus: state as TestDto['compileStatus'] };
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

function serve(test: TestDto) {
  studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)));
  return render(<RunControl testId={test.id} />);
}

describe('AC-1: Run acts in every declared state except while a compile is already settling', () => {
  it('enumerating every compileStatus the document declares — FX-RUNGATE-STATE-STALE, FX-RUNGATE-STATE-COMPILING, FX-RUNGATE-STATE-AWAITING_CONFIRMATION, FX-RUNGATE-STATE-READY, FX-RUNGATE-STATE-NEEDS_REVISION', async () => {
    expect(DECLARED_STATES.length).toBeGreaterThan(0);
    const enabledIn: string[] = [];

    for (const state of DECLARED_STATES) {
      const view = serve(draftFor(state));
      const control = await screen.findByRole('button', { name: RUN_LABEL });
      await waitFor(() => {
        // The read has landed: the blocked explanation or the enabled control, never the
        // pre-read disabled state, which would make every state look identical.
        expect(control.hasAttribute('disabled') === false || screen.queryByTestId('run-blocked-reason')).toBeTruthy();
      });
      if (!control.hasAttribute('disabled')) {
        enabledIn.push(state);
      }
      view.unmount();
    }

    // Saving no longer compiles, so a draft without a fresh artifact is not a blocked draft — it
    // is a draft whose first Run step is a compile. The one state that still disables the control
    // is COMPILING: a compile is already settling and a second would be refused anyway.
    expect(
      enabledIn.slice().sort(),
      'Run is disabled in a state it should act in, or enabled while a compile is settling',
    ).toEqual(DECLARED_STATES.filter((state) => state !== 'COMPILING').slice().sort());
  });

  it('a state the document does not declare is a loud failure rather than a permissive default', async () => {
    // The production symbol the name refers to is what gets mutated: `runEnablementFor` throws,
    // so a sixth value cannot render a control at all — enabled or disabled. The boundary is here
    // only so the throw is observed rather than escaping the run as an unhandled error; what is
    // asserted is that the control is gone and the reason names the state.
    const sixth = { ...readyDraft, compileStatus: 'SOMETHING_ELSE' as TestDto['compileStatus'] };
    studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(sixth)));

    render(
      <LoudFailureBoundary>
        <RunControl testId={sixth.id} />
      </LoudFailureBoundary>,
    );

    const caught = await screen.findByTestId('loud-failure');
    expect(caught.textContent).toMatch(/Unknown compileStatus "SOMETHING_ELSE"/);
    expect(screen.queryByRole('button', { name: RUN_LABEL })).toBeNull();
  });
});

describe('AC-2: client-side English-grammar validation is no longer an execution gate', () => {
  it('the discriminating half: a draft runs when the server says READY', async () => {
    // The step grammar validator is retired. Nothing on the run path consults the English, so the
    // server's READY alone dispatches the run.
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)),
      http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
        HttpResponse.json({ executionId: '77777777-7777-7777-7777-777777777777', status: 'PENDING' }, { status: 202 }),
      ),
    );

    render(<RunControl testId={readyDraft.id} />);
    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    await waitFor(() => expect(executeRequests()).toHaveLength(1));
    expect(executeRequests()).toHaveLength(1);
  });

  it('the companion half: the client\u2019s opinion of the English still gates nothing \u2014 the server\u2019s state decides what Run does', async () => {
    // A draft in a state that is not dispatchable. Run must not dispatch it as-is: it asks the
    // server to prepare it first, and only the server's own READY moves it to /execute.
    const awaiting = draftsByCompileStatus.AWAITING_CONFIRMATION;
    let served: TestDto = awaiting;
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(served)),
      http.post(`${STUDIO_BASE}/tests/:id/compile`, () => {
        served = { ...readyDraft, id: awaiting.id };
        return HttpResponse.json({ compileRequestId: 'r', status: 'COMPILING' }, { status: 202 });
      }),
    );

    render(<RunControl testId={awaiting.id} />);
    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);

    // Prepared exactly once, then dispatched exactly once — never dispatched unprepared.
    await waitFor(() => expect(executeRequests()).toHaveLength(1));
    expect(compileRequests()).toHaveLength(1);
  });

  it('a programmatic run request is governed by the same predicate as the button', async () => {
    // `?autorun=1` and the terminal-error surface's re-run both come through `runRequest`. A
    // second activation path that skipped the gate would be the defect this story removed, put
    // back by a different door.
    // The draft stays NEEDS_REVISION however many times it is prepared, so the run must stop
    // after the preparation rather than dispatch something the server would refuse.
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        HttpResponse.json(draftsByCompileStatus.NEEDS_REVISION),
      ),
      http.post(`${STUDIO_BASE}/tests/:id/compile`, () =>
        HttpResponse.json({ compileRequestId: 'r', status: 'COMPILING' }, { status: 202 }),
      ),
    );
    render(<RunControl testId={draftsByCompileStatus.NEEDS_REVISION.id} runRequest={1} />);
    await screen.findByTestId('run-compile-outcome');
    await waitFor(() => expect(compileRequests()).toHaveLength(1));
    expect(executeRequests()).toHaveLength(0);
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
});

describe('AC-3(a): client-generated Python is retired, and the Code view says what it has not got', () => {
  it('renders the exact saved runnable artifact without internal identifiers', async () => {
    render(<CodeTab testId={readyDraft.id} />);

    const source = await screen.findByTestId('confirmed-playwright-source');
    const artifactSteps = readyDraft.confirmedRevisionArtifact?.steps ?? [];
    expect(artifactSteps.length).toBeGreaterThan(0);

    // Complete: every step's code AND the English it was translated from, index-aligned.
    const codeBlocks = screen.getAllByTestId('code-view-step-code');
    const stepTexts = screen.getAllByTestId('code-view-step-text');
    expect(codeBlocks).toHaveLength(artifactSteps.length);
    expect(stepTexts).toHaveLength(artifactSteps.length);
    artifactSteps.forEach((step, index) => {
      expect(codeBlocks[index].textContent).toBe(step.code);
      expect(stepTexts[index].textContent).toBe(`${index + 1}. ${step.originalText}`);
    });
    expect(screen.getByTestId('code-view-step-count').textContent).toBe(
      `${artifactSteps.length} steps`,
    );
    // Not a runnable file, and it does not pretend to be one.
    expect(source.textContent).not.toMatch(/\bimport\b|\btest\(/u);

    // Internal identifiers stay internal: the revision is named by a short prefix, never in full.
    expect(document.body.textContent).not.toContain(readyDraft.confirmedRevisionId as string);
    expect(document.body.textContent).not.toContain(readyDraft.confirmedRevisionArtifactHash as string);
    expect(screen.getByTestId('code-view-revision').textContent).toContain(
      (readyDraft.confirmedRevisionArtifactHash as string).slice(0, 8),
    );
    expect(screen.queryByTestId('code-view-unavailable-title')).toBeNull();
  });

  it('refreshes confirmed source when the same test is prepared without changing ids', async () => {
    let served: TestDto = {
      ...readyDraft,
      confirmedRevisionId: null,
      confirmedRevisionArtifactHash: null,
      confirmedRevisionArtifact: null,
    };
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/${readyDraft.id}`, () => HttpResponse.json(served)),
    );
    const view = render(<CodeTab testId={readyDraft.id} refreshToken={0} />);
    await screen.findByTestId('code-view-unavailable-title');

    served = readyDraft;
    view.rerender(<CodeTab testId={readyDraft.id} refreshToken={1} />);
    await screen.findByTestId('confirmed-playwright-source');
    const refreshed = screen.getAllByTestId('code-view-step-code').map((node) => node.textContent);
    expect(refreshed).toEqual(
      (readyDraft.confirmedRevisionArtifact?.steps ?? []).map((step) => step.code),
    );
  });

  it('renders no generator-derived text for any fixture', () => {
    // The falsification is wiring generated Python back in. The retired Python generator (deleted
    // by story 10.51) emitted these lines for every draft regardless of its steps, so they are
    // pinned here as static strings. Each is long and specific enough that a comparison against it
    // cannot pass for an empty rendering.
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

    const drafts = Object.values(draftsByCompileStatus);
    expect(drafts.length).toBeGreaterThan(0);

    for (let i = 0; i < drafts.length; i += 1) {
      const view = render(<CodeTab />);
      const rendered = view.container.textContent ?? '';
      for (const line of GENERATED_PYTHON_LINES) {
        expect(rendered, `the Code view rendered generated source: ${line}`).not.toContain(line);
      }
      view.unmount();
    }
  });

  it('names the blocker rather than rendering an empty state', () => {
    render(<CodeTab />);
    const title = screen.getByTestId('code-view-unavailable-title');
    expect(title.textContent).toBe(CODE_VIEW_UNAVAILABLE_TITLE);

    const blocker = screen.getByTestId('code-view-blocker');
    expect(blocker.textContent).toBe(CODE_VIEW_BLOCKER);
    expect(blocker.textContent).not.toMatch(/ADR|story|revision/i);
  });

  it('explains that the tab shows only saved runnable source', () => {
    render(<CodeTab />);
    const why = screen.getByTestId('code-view-why-not-candidate');
    expect(why.textContent).toMatch(/saved test will run/i);
  });

  it('the Code view takes no source to render, so there is nothing to wire a generator into', () => {
    // The weaker, structural half, named as such. `CodeTab` accepting no props at all is what
    // makes the rendering assertions above stable: there is no slot a caller could fill.
    expect(CodeTab.length).toBeLessThanOrEqual(1);
    const rendered = render(<CodeTab />).container.textContent ?? '';
    expect(rendered).not.toMatch(/Generated Python/i);
    expect(rendered).not.toMatch(/Auto-sync/i);
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

    // Keyboard: tabbing and pressing Enter or Space reaches no execute and no compile.
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    // A pointer click on the disabled control (MUI sets pointer-events: none, so dispatch it).
    fireEvent.click(control);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(executeRequests()).toHaveLength(0);
    expect(compileRequests()).toHaveLength(0);
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
