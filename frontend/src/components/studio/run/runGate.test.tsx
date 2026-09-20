import React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { draftsByCompileStatus, readyDraft } from '@/services/mocks/studio/compileFixtures';
import { generatePythonFromIR } from '@/utils/studio/codegen/pythonGenerator';
import { buildDefaultTestIR } from '@/utils/studio/ir/parseSteps';
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

describe('AC-1: Run is enabled if and only if the server says the draft is READY', () => {
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

    expect(enabledIn, 'Run is enabled in more or fewer than one declared state').toEqual(['READY']);
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
  it('the discriminating half: a draft the validator calls invalid still runs when the server says READY', async () => {
    // The validator is forced to refuse everything. Nothing on the run path consults it, so if the
    // grammar term were still in the predicate — under any name — this request would not happen.
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/validate-steps`, () =>
        HttpResponse.json({
          isValid: false,
          results: readyDraft.steps.map((_, stepIndex) => ({
            stepIndex,
            isValid: false,
            suggestion: 'this editor does not recognise this line',
          })),
        }),
      ),
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

  it('the companion half: a draft the validator calls valid does not run when the server has not said READY', async () => {
    studioMockServer.use(
      http.post(`${STUDIO_BASE}/validate-steps`, () =>
        HttpResponse.json({ isValid: true, results: [] }),
      ),
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        HttpResponse.json(draftsByCompileStatus.AWAITING_CONFIRMATION),
      ),
    );

    render(<RunControl testId={draftsByCompileStatus.AWAITING_CONFIRMATION.id} />);
    const control = await screen.findByRole('button', { name: RUN_LABEL });
    await screen.findByTestId('run-blocked-reason');
    await userEvent.click(control, { pointerEventsCheck: 0 });

    expect(control).toBeDisabled();
    expect(executeRequests()).toHaveLength(0);
  });

  it('a programmatic run request is governed by the same predicate as the button', async () => {
    // `?autorun=1` and the terminal-error surface's re-run both come through `runRequest`. A
    // second activation path that skipped the gate would be the defect this story removed, put
    // back by a different door.
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/tests/:id`, () =>
        HttpResponse.json(draftsByCompileStatus.NEEDS_REVISION),
      ),
    );
    render(<RunControl testId={draftsByCompileStatus.NEEDS_REVISION.id} runRequest={1} />);
    await screen.findByTestId('run-blocked-reason');
    await waitFor(() => expect(executeRequests()).toHaveLength(0));
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
  it('renders no generator-derived text for any fixture', () => {
    // The falsification is wiring the generator's output back in. For that to be visible the
    // generator must actually produce distinctive lines against these fixtures, so that is
    // asserted first — a comparison against an empty string would pass for any rendering.
    const drafts = Object.values(draftsByCompileStatus);
    expect(drafts.length).toBeGreaterThan(0);

    for (const draft of drafts) {
      const generated = generatePythonFromIR(buildDefaultTestIR(draft.name, draft.steps));
      const distinctive = generated
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 12 && !line.startsWith('#'));
      expect(distinctive.length, 'the generator produced nothing distinctive to look for').toBeGreaterThan(2);

      const view = render(<CodeTab />);
      const rendered = view.container.textContent ?? '';
      for (const line of distinctive) {
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
    // @po's amendment to open question 2: the blocker named must be the **new** one — the
    // confirmed revision's artifact and hash — not the AC-15 ruling, which has landed.
    expect(blocker.textContent).toMatch(/confirmed revision/i);
    expect(blocker.textContent).toMatch(/§21/);
    expect(blocker.textContent?.trim().length).toBeGreaterThan(80);
  });

  it('says why the current candidate is not shown instead', () => {
    render(<CodeTab />);
    const why = screen.getByTestId('code-view-why-not-candidate');
    expect(why.textContent).toMatch(/refused/i);
    expect(why.textContent).toMatch(/disagree|disagrees/i);
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
