import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import axe, { type AxeResults, type Result } from 'axe-core';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { awaitingDraft, readyDraft } from '@/services/mocks/studio/compileFixtures';
import {
  DEV_TRANSPORT_SCENARIO,
  TERMINAL_EVIDENCE_SETTLED,
  createScriptedTransport,
} from '@/services/mocks/studio/executionScenarios';
import {
  resetExecutionTransportSeam,
  setExecutionTransportSeam,
} from '@/services/api/studioTransportWiring';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import ChecksStudioPage from '@/pages/ChecksStudioPage/ChecksStudioPage';
import StudioTestsPage from '@/pages/StudioTestsPage/StudioTestsPage';
import StudioRunsPage from '@/pages/StudioRunsPage/StudioRunsPage';

/**
 * Story 10.19 — **AC-12(a)**, closing story 10.10's AC-18(b).
 *
 * 10.10 AC-18a proved roles, accessible names, keyboard operability and the live region on the
 * rendered tree, and explicitly made **no conformance claim**. This file is the conformance scan
 * that was deferred to this story: `axe-core` over the seven named Studio surfaces.
 *
 * **What this file is, and what it is not.**
 * - It runs against the **standalone/MSW-backed** render, not staging. No `ED-*` or `SPK-*` id
 *   gates it, and none is claimed.
 * - An automated scan is a floor, not a conformance verdict. `axe-core` measures roughly a third of
 *   WCAG success criteria mechanically. **The manual assistive-technology walkthrough (AC-12(b))
 *   is the other half, and it is not automatable** — it is recorded in
 *   `docs/qa/accessibility/studio-wcag-audit.md`.
 * - The bar this story's AC-12 sets is **zero violations at `critical` or `serious` impact**, or
 *   every such violation ticketed with a named owner and severity in the register. `moderate` and
 *   `minor` findings are reported by this file (in its own output) and recorded in the audit, not
 *   failed on — that is AC-12's threshold, not a softening of it.
 *
 * **This scan does not cover `ChecksLayout`.** The layout wraps these pages in the running
 * application but cannot be rendered in this worktree at all: it imports `PlatformSidebar` from
 * `@put/core-components`, whose symlink does not resolve from a worktree (ENV-1(a), @devops's).
 * `ChecksLayout.a11y.test.tsx` fails at file level for the same reason. The skip link that ENV-1(c)
 * and AC-14 are about therefore **cannot be scanned here**, and this file does not pretend to have
 * scanned it.
 */

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

/** AC-12's bar. A violation at or above this impact is what AC-12 counts. */
const FAILING_IMPACTS = new Set(['critical', 'serious']);

/**
 * THE PINNED BASELINE — read this before changing a number in it.
 *
 * AC-12(a) sets the bar as: *zero* critical/serious violations, **or** every such violation
 * ticketed with a named owner and severity in the register. The scan found violations on all seven
 * surfaces, and story 10.19 took the second branch: each rule below is ticketed as `A11Y-1` … `A11Y-4`
 * in `docs/qa/staging-acceptance-register.md` with an owner and a severity, and the full detail is in
 * `docs/qa/accessibility/studio-wcag-audit.md`.
 *
 * **Ticketing is not the same as ignoring, and this pin is what makes the difference.** The counts
 * below are exact. The scan fails when:
 *   - a surface produces a critical/serious rule this baseline does not list — a NEW defect;
 *   - a listed rule produces MORE nodes than pinned — a defect that grew;
 *   - a listed rule produces FEWER nodes, or disappears — which is good news and still a failure,
 *     because a ticket that no longer describes reality has to be closed or re-scoped rather than
 *     left to rot. Re-anchor the number in the same PR that fixes the defect, naming what was fixed.
 *
 * A baseline without the last clause is the shape this epic keeps catching: a guard that cannot
 * distinguish "still broken" from "fixed and nobody updated the record".
 *
 * Measured 2026-09-17 with axe-core 4.13.0 on branch `story/10.19`.
 *
 * Re-anchored 2026-09-20 on `main` (`cd2ab3001`) after the Epic 10 / Studio v1 fold. Studio v1 WP5
 * (`2e06d0b5d`) gave the runs page's Refresh `IconButton` and the tests page's Run button an
 * `aria-label`: `StudioRunsPage` no longer produces any critical or serious violation, and
 * `StudioTestsPage` went from 2 + 2 nodes to 1 + 1.
 *
 * Re-measured 2026-09-20 with axe-core 4.13.0 after the two-panel Studio redesign. The Studio
 * editor surfaces (`ChecksStudioPage/*`) and Runs page now have zero critical/serious violations.
 * One unnamed Tests-page action remains ticketed by A11Y-1/A11Y-2.
 */
const PINNED_CRITICAL_SERIOUS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  StudioTestsPage: { 'aria-prohibited-attr': 1, 'button-name': 1 },
  StudioRunsPage: {},
  'ChecksStudioPage/author': {},
  'ChecksStudioPage/compile-review': {},
  'ChecksStudioPage/confirm': {},
  'ChecksStudioPage/run-progress': {},
  'ChecksStudioPage/video-playback': {},
};

const bootstrapHandlers = [
  http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
  http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
];

/** Every finding this run produced, at every impact, written out for the audit record. */
const findings: Array<{ surface: string; results: Result[] }> = [];

function summarise(results: Result[]): string {
  if (results.length === 0) return 'none';
  return results
    .map((r) => `${r.impact ?? 'unknown'}:${r.id}(${r.nodes.length})`)
    .join(', ');
}

/**
 * Run axe over the rendered document and return only what AC-12 fails on, after recording
 * everything for the audit.
 *
 * `axe.run` is given the live `document.body` rather than a container, because a dialog or a
 * portal renders outside the container React Testing Library returns and would otherwise be
 * silently unscanned — the same "scan keyed on the wrong surface" shape this epic has caught before.
 */
async function scan(surface: string): Promise<string[]> {
  const results: AxeResults = await axe.run(document.body, {
    resultTypes: ['violations'],
    // jsdom has no layout engine, so these rules cannot produce a trustworthy answer here.
    // Disabling them is recorded in the audit as a LIMIT OF THIS SCAN, not as a clean result.
    rules: {
      'color-contrast': { enabled: false },
      'target-size': { enabled: false },
    },
  });
  findings.push({ surface, results: results.violations });
  // eslint-disable-next-line no-console -- the scan's own record; read into the audit document.
  console.log(`[axe] ${surface}: ${summarise(results.violations)}`);
  return reconcileAgainstBaseline(surface, results.violations);
}

/** Compare this run's critical/serious findings against the pinned, ticketed baseline. */
function reconcileAgainstBaseline(surface: string, violations: Result[]): string[] {
  const pinned = PINNED_CRITICAL_SERIOUS[surface];
  if (!pinned) {
    return [`${surface}: no pinned baseline exists for this surface; add one or remove the scan`];
  }
  const observed: Record<string, number> = {};
  for (const v of violations) {
    if (FAILING_IMPACTS.has(v.impact ?? '')) observed[v.id] = v.nodes.length;
  }
  const problems: string[] = [];
  for (const [rule, count] of Object.entries(observed)) {
    const expected = pinned[rule];
    if (expected === undefined) {
      const v = violations.find((x) => x.id === rule)!;
      problems.push(
        `${surface}: NEW critical/serious violation "${rule}" (${v.impact}, ${count} node(s)) — ${v.help}\n` +
          v.nodes.slice(0, 3).map((n) => `        ${n.target.join(' ')}`).join('\n'),
      );
    } else if (count > expected) {
      problems.push(
        `${surface}: "${rule}" GREW from the ticketed ${expected} node(s) to ${count}. The defect got worse.`,
      );
    } else if (count < expected) {
      problems.push(
        `${surface}: "${rule}" SHRANK from the ticketed ${expected} node(s) to ${count}. ` +
          `Good news, and still a failure: close or re-scope its ticket in ` +
          `docs/qa/staging-acceptance-register.md and re-anchor this number in the same PR.`,
      );
    }
  }
  for (const [rule, expected] of Object.entries(pinned)) {
    if (!(rule in observed)) {
      problems.push(
        `${surface}: ticketed violation "${rule}" (${expected} node(s)) is GONE. ` +
          `Close its ticket in docs/qa/staging-acceptance-register.md and remove this pin in the same PR.`,
      );
    }
  }
  return problems;
}

function serveDraft(draft: typeof readyDraft) {
  studioMockServer.use(
    ...bootstrapHandlers,
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [draft], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(draft)),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () =>
      HttpResponse.json(
        { executionId: TERMINAL_EVIDENCE_SETTLED.executionId, status: 'PENDING' },
        { status: 202 },
      ),
    ),
  );
}

function renderPage(node: React.ReactElement) {
  return render(
    <Provider store={store}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>,
  );
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  window.localStorage.clear();
  studioMockServer.use(...bootstrapHandlers);
  store.dispatch(
    fetchSources.fulfilled(
      [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }],
      'test',
      undefined,
    ),
  );
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
});

afterEach(() => {
  resetExecutionTransportSeam();
  studioMockServer.resetHandlers();
  resetStudioMocks();
});

afterAll(() => {
  studioMockServer.close();
  // Write the machine-readable half of the audit record so the markdown document quotes a reading
  // rather than a recollection.
  const out = path.resolve(__dirname, '../../../../docs/qa/accessibility/axe-results.json');
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      `${JSON.stringify(
        {
          generatedBy: 'frontend/src/test/a11y/studioWcagAudit.test.tsx (story 10.19 AC-12a)',
          axeCoreVersion: axe.version,
          disabledRules: ['color-contrast', 'target-size'],
          disabledBecause: 'jsdom has no layout engine; these rules cannot be answered here.',
          failingImpacts: [...FAILING_IMPACTS],
          surfaces: findings.map(({ surface, results }) => ({
            surface,
            violations: results.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              helpUrl: v.helpUrl,
              nodes: v.nodes.map((n) => n.target.join(' ')),
            })),
          })),
        },
        null,
        2,
      )}\n`,
    );
  } catch {
    // Writing the record is a convenience; a failure here must never turn the scan green or red.
  }
});

/**
 * Each scan renders a full MUI page and runs `axe-core` over the whole document. Alone that takes
 * two to three seconds; under full-suite parallelism it exceeds vitest's 5 s default and the test
 * times out. The budget below is a TIME budget, not a loosened assertion — nothing about what is
 * asserted changes with it. Recorded because a timeout that is "fixed" by weakening a check is the
 * failure this epic keeps finding, and this is not that.
 */
const SCAN_TIMEOUT_MS = 30_000;

describe('AC-12(a): axe-core conformance scan of the seven named Studio surfaces', () => {
  it('surface 1 — the Studio tests list (StudioTestsPage)', async () => {
    serveDraft(readyDraft);
    renderPage(<StudioTestsPage />);
    // Wait for the served draft to actually appear, so the scan reads the loaded list rather than
    // a loading state. `findAllBy` because the name may render in more than one place.
    await screen.findAllByText(/Compile review fixture/i);
    const drift = await scan('StudioTestsPage');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 2 — the Studio runs list (StudioRunsPage)', async () => {
    serveDraft(readyDraft);
    studioMockServer.use(
      http.get(`${STUDIO_BASE}/executions`, () =>
        HttpResponse.json({ data: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
      ),
    );
    renderPage(<StudioRunsPage />);
    await waitFor(() => expect(document.body.textContent).not.toBe(''));
    const drift = await scan('StudioRunsPage');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 3 — ChecksStudioPage, author state', async () => {
    serveDraft(readyDraft);
    renderPage(<ChecksStudioPage />);
    await screen.findByRole('button', { name: 'Run Test' });
    const drift = await scan('ChecksStudioPage/author');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 4 — ChecksStudioPage, compile-review state', async () => {
    serveDraft(awaitingDraft);
    renderPage(<ChecksStudioPage />);
    await screen.findByRole('button', { name: 'Run Test' });
    // The review panel is mounted inline by the page for the selected draft; awaitingDraft is the
    // fixture whose compile status puts it in review.
    await waitFor(() => expect(document.body.textContent).toMatch(/step/i));
    const drift = await scan('ChecksStudioPage/compile-review');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 5 — ChecksStudioPage, confirm state', async () => {
    serveDraft(awaitingDraft);
    renderPage(<ChecksStudioPage />);
    await screen.findByRole('button', { name: 'Run Test' });
    const confirm = await screen
      .findAllByRole('button', { name: /confirm/i })
      .catch(() => [] as HTMLElement[]);
    // Recorded rather than asserted: whether the confirm affordance is reachable on the assembled
    // page is what this surface is scanning for. Its absence is an audit finding, not a silent pass.
    // eslint-disable-next-line no-console -- read into the audit document.
    console.log(`[axe] ChecksStudioPage/confirm: confirm affordances found = ${confirm.length}`);
    if (confirm.length > 0) await userEvent.hover(confirm[0]);
    const drift = await scan('ChecksStudioPage/confirm');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 6 — ChecksStudioPage, run / SSE-progress state', async () => {
    setExecutionTransportSeam({
      primary: createScriptedTransport(DEV_TRANSPORT_SCENARIO.slice(0, 3), 0),
      fallback: null,
    });
    serveDraft(readyDraft);
    renderPage(<ChecksStudioPage />);
    const control = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);
    await screen.findByTestId('execution-status');
    const drift = await scan('ChecksStudioPage/run-progress');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('surface 7 — ChecksStudioPage, video-playback state', async () => {
    setExecutionTransportSeam({
      primary: createScriptedTransport([TERMINAL_EVIDENCE_SETTLED], 0),
      fallback: null,
    });
    serveDraft(readyDraft);
    renderPage(<ChecksStudioPage />);
    const control = await screen.findByRole('button', { name: 'Run Test' });
    await waitFor(() => expect(control).not.toBeDisabled());
    await userEvent.click(control);
    await screen.findByTestId('step-seek-1');
    await userEvent.click(screen.getByRole('tab', { name: 'Proof' }));
    expect(document.querySelectorAll('video')).toHaveLength(1);
    const drift = await scan('ChecksStudioPage/video-playback');
    expect(drift, drift.join('\n')).toEqual([]);
  }, SCAN_TIMEOUT_MS);
});
