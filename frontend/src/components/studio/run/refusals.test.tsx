import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { readyDraft } from '@/services/mocks/studio/readinessFixtures';
import {
  CONTRADICTORY_QUARANTINE_BODY,
  DISPATCH_DISABLED_BODY,
  QUOTA_EXHAUSTED_BODY,
  UNDECLARED_CONFLICT_BODY,
  errorCodeExecutions,
  executeConflictResponse,
  failedWithSkippedTailExecution,
  passedExecution,
} from '@/services/mocks/studio/executionFixtures';
import { EXECUTION_ERROR_CODES } from '@/types/studio/studioTypes';
import studioApi from '@/services/api/studioApi';
import {
  MOCK_EXECUTE_DENIED_CSIS,
  MOCK_READABLE_CSIS,
  STUDIO_FORBIDDEN_BODY,
  mockTests,
} from '@/services/mocks/studio/fixtures';
import { EXECUTE_FORBIDDEN_NARRATIVE, executeRefusalFor } from './executeRefusals';
import { RunControl, RUN_LABEL } from './RunControl';
import { ExecutionProgressView, RERUN_LABEL } from './ExecutionProgressView';
import {
  MIN_PINNED_PHRASE_LENGTH,
  PINNED_EXECUTION_ERROR_FACTS,
} from './pinnedExecutionErrorFacts';

/**
 * Story 10.11a — every declared refusal, and what a terminal `ERROR` tells the reader
 * (AC-4, AC-6).
 *
 * The expected facts are pinned in `pinnedExecutionErrorFacts.ts`, **not** read out of
 * `executionErrorNarratives.ts`. That is VAC-11, the shape @qa measured on story 10.10 where
 * blanking seven required facts left the whole suite green, and PIN-1 is its sequel: a header
 * comment on the pinned copy is not a guard, so the provenance assertion at the bottom of this
 * file is. Each fact has its own slot, so a concatenated-text assertion cannot hide which one
 * vanished, and the degenerate case — a blanked phrase making every `toContain` trivially true —
 * is closed by a floor with its own negative control.
 */

const STUDIO_BASE = '*/api/v1/studio';
const SPEC_DIR = path.resolve(__dirname, '../../../../../docs/specs/studio');
const openapi = parseYaml(fs.readFileSync(path.join(SPEC_DIR, 'openapi.yaml'), 'utf8'));
const DECLARED_EXECUTE_CONFLICTS: string[] =
  openapi.paths['/tests/{id}/execute'].post.responses['409']['x-conflict-codes'];

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  studioMockServer.use(http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)));
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

async function refuse(body: Record<string, unknown>, status: number) {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(readyDraft)),
    http.post(`${STUDIO_BASE}/tests/:id/execute`, () => HttpResponse.json(body, { status })),
  );
  render(<RunControl testId={readyDraft.id} />);
  const control = await screen.findByRole('button', { name: RUN_LABEL });
  await waitFor(() => expect(control).not.toBeDisabled());
  await userEvent.click(control);
}

describe('AC-4: every declared refusal of the execute route is handled distinctly', () => {
  it('renders a narrative for every declared 409 — FX-EXECUTE-409-LEARN_REQUIRED, FX-EXECUTE-409-RUNTIME_INCOMPATIBLE, FX-EXECUTE-409-IDEMPOTENCY_KEY_REUSED, FX-EXECUTE-409-TEST_DELETED, FX-EXECUTE-409-TEST_QUARANTINED', async () => {
    // Enumerated from the document rather than from a list written here: a sixth code added to an
    // in-test copy of `x-conflict-codes` reaches a real render and a real assertion.
    expect(DECLARED_EXECUTE_CONFLICTS.length).toBeGreaterThan(0);

    for (const code of DECLARED_EXECUTE_CONFLICTS) {
      await refuse(executeConflictResponse(code), 409);

      const title = await screen.findByTestId('run-refusal-title');
      const explanation = screen.getByTestId('run-refusal-explanation');
      const remedy = screen.getByTestId('run-refusal-remedy');

      // Its own wording, not the undeclared-code fallback. Without this the enumeration is
      // satisfied by a sixth declared code rendering "this page has no wording for it", which is
      // exactly what AC-4's second falsification adds — and it would have passed.
      expect(title.textContent, `${code} fell through to the undeclared narrative`).not.toMatch(
        /no wording for/i,
      );
      expect(title.textContent?.trim().length, `${code} title`).toBeGreaterThan(10);
      expect(explanation.textContent?.trim().length, `${code} explanation`).toBeGreaterThan(40);
      expect(remedy.textContent?.trim().length, `${code} remedy`).toBeGreaterThan(30);
      // The server's own prose is shown so it can be quoted, never used as a branch key.
      expect(
        screen.getByTestId('run-refusal-server-message').textContent,
        `${code} server message`,
      ).toContain(executeConflictResponse(code).message);
      document.body.innerHTML = '';
    }
  });

  it('no two declared 409 codes render the same narrative', async () => {
    const titles: string[] = [];
    for (const code of DECLARED_EXECUTE_CONFLICTS) {
      await refuse(executeConflictResponse(code), 409);
      titles.push((await screen.findByTestId('run-refusal-title')).textContent ?? '');
      screen.getByTestId('run-refusal').remove();
      document.body.innerHTML = '';
    }
    expect(new Set(titles).size, 'two refusals render the same name').toBe(titles.length);
  });

  it('TEST_QUARANTINED says the authored test still exists and returns [FX-EXECUTE-409-TEST_QUARANTINED]', async () => {
    // BRD §9 guarantees no authored test is lost, and ADR-002 §14.3 says collapsing quarantine
    // into deletion would drive a UI to offer a restore it cannot perform.
    await refuse(executeConflictResponse('TEST_QUARANTINED'), 409);
    const explanation = await screen.findByTestId('run-refusal-explanation');
    expect(explanation.textContent).toMatch(/still exists/i);
    expect(explanation.textContent).toMatch(/nothing has been removed|returns when/i);
    expect(explanation.textContent).not.toMatch(/\bdeleted\b/i);
  });

  it('the rendering follows the code even when the message says the opposite [FX-EXECUTE-409-CONTRADICTORY]', async () => {
    // The body's `error` is TEST_QUARANTINED; its prose claims permanent deletion. A surface that
    // branched on the message would tell the author their work is gone. There is no third
    // possibility, which is what makes this fixture discriminating.
    await refuse(CONTRADICTORY_QUARANTINE_BODY, 409);
    const explanation = await screen.findByTestId('run-refusal-explanation');
    expect(explanation.textContent).toMatch(/still exists/i);
    expect(screen.getByTestId('run-refusal-title').textContent).toMatch(/held while its CSI/i);
    // And the contradictory prose is still shown verbatim, in its own slot, so it can be reported.
    expect(screen.getByTestId('run-refusal-server-message').textContent).toContain(
      CONTRADICTORY_QUARANTINE_BODY.message,
    );
  });

  it('a 409 carrying an undeclared code is visibly unhandled rather than folded in [FX-EXECUTE-409-UNDECLARED]', async () => {
    await refuse(UNDECLARED_CONFLICT_BODY, 409);
    const title = await screen.findByTestId('run-refusal-title');
    expect(title.textContent).toMatch(/no wording for/i);
    expect(screen.getByTestId('run-refusal-server-message').textContent).toContain(
      UNDECLARED_CONFLICT_BODY.message,
    );
  });

  it('429 renders a quota condition, branched on the status [FX-EXECUTE-429]', async () => {
    await refuse(QUOTA_EXHAUSTED_BODY, 429);
    const title = await screen.findByTestId('run-refusal-title');
    expect(title.textContent).toMatch(/waiting|quota|too many/i);
    expect(screen.queryByTestId('run-refusal-platform-banner')).toBeNull();
    expect(screen.getByTestId('run-refusal-remedy').textContent).toMatch(/try again/i);
  });

  it('503 renders a platform-wide condition, not something about this draft [FX-EXECUTE-503]', async () => {
    await refuse(DISPATCH_DISABLED_BODY, 503);
    const banner = await screen.findByTestId('run-refusal-platform-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('run-refusal-explanation').textContent).toMatch(
      /across the platform|not about your test/i,
    );
  });
});

describe('Story 10.48 AC-10a: a 403 on execute is worded, never the generic failure', () => {
  it('maps a 403 to its own narrative whatever code it carries, and leaves the others alone', () => {
    // The server answers every refused caller with the same 403 it gives an unknown id
    // (ADR-002 O-22), so the status is the key and the code is not read.
    expect(executeRefusalFor(403, 'STUDIO_FORBIDDEN')).toBe(EXECUTE_FORBIDDEN_NARRATIVE);
    expect(executeRefusalFor(403, null)).toBe(EXECUTE_FORBIDDEN_NARRATIVE);
    expect(executeRefusalFor(403, 'LEARN_REQUIRED')).toBe(EXECUTE_FORBIDDEN_NARRATIVE);
    expect(EXECUTE_FORBIDDEN_NARRATIVE.title).toBe(
      'You do not have permission to run tests for this CSI',
    );
    expect(EXECUTE_FORBIDDEN_NARRATIVE.callerCanRetry).toBe(false);
    expect(executeRefusalFor(400, 'BAD_REQUEST')).toBeNull();
  });

  it('renders the permission narrative through the Run gate, not "The run could not be started"', async () => {
    await refuse(STUDIO_FORBIDDEN_BODY, 403);

    const title = await screen.findByTestId('run-refusal-title');
    expect(title.textContent).toBe(EXECUTE_FORBIDDEN_NARRATIVE.title);
    expect(screen.getByRole('alert', { name: EXECUTE_FORBIDDEN_NARRATIVE.title })).toBeInTheDocument();
    expect(screen.getByTestId('run-refusal-explanation').textContent).toMatch(/owners/i);
    expect(screen.queryByTestId('run-load-error')).toBeNull();
    expect(document.body.textContent).not.toMatch(/could not be started/i);
    // The server's prose is still shown so it can be quoted.
    expect(screen.getByTestId('run-refusal-server-message').textContent).toContain(
      STUDIO_FORBIDDEN_BODY.message,
    );
  });
});

describe('Story 10.48: the mock server refuses execute on a read-only CSI', () => {
  const runnable = mockTests.find(
    (test) => test.readiness === 'READY' && test.csiId !== null && MOCK_READABLE_CSIS.includes(test.csiId),
  );

  it('answers the backend 403 body before readiness', async () => {
    expect(runnable, 'fixture: a READY test in a readable CSI').toBeDefined();
    const id = runnable!.id;
    MOCK_EXECUTE_DENIED_CSIS.add(runnable!.csiId!);

    const failure = await studioApi.executeTest(id).then(
      () => null,
      (error: { response?: { status?: number; data?: unknown } }) => error.response,
    );
    expect(failure?.status).toBe(403);
    expect(failure?.data).toEqual(STUDIO_FORBIDDEN_BODY);
  });

  it('is cleared by resetStudioMocks', async () => {
    MOCK_EXECUTE_DENIED_CSIS.add(runnable!.csiId!);
    resetStudioMocks();
    expect(MOCK_EXECUTE_DENIED_CSIS.size).toBe(0);
  });
});

describe('AC-6: a terminal ERROR says what happened to the browser and who can clear it', () => {
  it('the pinned facts are discriminating before any of them is used', () => {
    // The degenerate case at the bottom of VAC-11: a blanked phrase makes `toContain` true for
    // any rendering. Nothing below means anything unless this holds.
    expect(Object.keys(PINNED_EXECUTION_ERROR_FACTS)).toHaveLength(EXECUTION_ERROR_CODES.length);
    for (const [code, facts] of Object.entries(PINNED_EXECUTION_ERROR_FACTS)) {
      expect(facts.browserPhrase.length, `${code} browser phrase`).toBeGreaterThanOrEqual(
        MIN_PINNED_PHRASE_LENGTH,
      );
      expect(facts.remedyPhrase.length, `${code} remedy phrase`).toBeGreaterThanOrEqual(
        MIN_PINNED_PHRASE_LENGTH,
      );
    }
  });

  it('renders the browser claim and the remedy owner for FX-ERRCODE-TIMEOUT, FX-ERRCODE-DISPATCH_FAILED, FX-ERRCODE-DISPATCH_UNKNOWN, FX-ERRCODE-START_TIMEOUT, FX-ERRCODE-STALE, FX-ERRCODE-DISPATCH_DISABLED, FX-ERRCODE-AUTHORIZATION_REVOKED, FX-ERRCODE-REFERENCE_UNAVAILABLE, FX-ERRCODE-SECRET_TOO_LONG, FX-ERRCODE-CANCELLED', () => {
    for (const code of EXECUTION_ERROR_CODES) {
      const facts = PINNED_EXECUTION_ERROR_FACTS[code];
      const view = render(<ExecutionProgressView snapshot={errorCodeExecutions[code]} />);

      const browser = screen.getByTestId('execution-error-browser');
      const remedy = screen.getByTestId('execution-error-remedy');

      // Each fact in its own slot: a rendering that lost one cannot hide behind the other.
      expect(browser.textContent, `${code} browser claim`).toContain(facts.browserPhrase);
      expect(remedy.textContent, `${code} remedy owner`).toContain(facts.remedyPhrase);
      // And present is not the same as readable — a floor, named in the story as a floor.
      expect(browser.textContent?.trim().length, `${code} browser claim length`).toBeGreaterThan(40);
      expect(remedy.textContent?.trim().length, `${code} remedy length`).toBeGreaterThan(40);
      view.unmount();
    }
  });

  it('offers a re-run only where the document clears the code with a new execution — FX-ERRCODE-DISPATCH_FAILED, FX-ERRCODE-START_TIMEOUT, FX-ERRCODE-STALE, FX-ERRCODE-TIMEOUT, FX-ERRCODE-DISPATCH_DISABLED, FX-ERRCODE-AUTHORIZATION_REVOKED, FX-ERRCODE-REFERENCE_UNAVAILABLE, FX-ERRCODE-SECRET_TOO_LONG, FX-ERRCODE-CANCELLED', () => {
    const offering: string[] = [];
    for (const code of EXECUTION_ERROR_CODES) {
      const view = render(
        <ExecutionProgressView snapshot={errorCodeExecutions[code]} onRerun={() => {}} />,
      );
      if (screen.queryByRole('button', { name: RERUN_LABEL }) !== null) {
        offering.push(code);
      }
      view.unmount();
    }
    // The three the document's own table clears with *"a new execution"*, and no others.
    expect(offering.sort()).toEqual(['DISPATCH_FAILED', 'STALE', 'START_TIMEOUT']);
    expect(
      EXECUTION_ERROR_CODES.filter((code) => PINNED_EXECUTION_ERROR_FACTS[code].rerunOffered).sort(),
    ).toEqual(['DISPATCH_FAILED', 'STALE', 'START_TIMEOUT']);
  });

  it('DISPATCH_UNKNOWN offers no one-click re-run at all [FX-ERRCODE-DISPATCH_UNKNOWN]', () => {
    // The load-bearing case. §5.1 forbids resending browser work on an ambiguous outcome, so a
    // new run is an explicit human decision rather than a button.
    render(
      <ExecutionProgressView snapshot={errorCodeExecutions.DISPATCH_UNKNOWN} onRerun={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: RERUN_LABEL })).toBeNull();
    expect(screen.getByTestId('execution-error-browser').textContent).toMatch(/unknown/i);
  });

  it('CANCELLED is named "Cancelled" in a status region, never an error alert, and offers no re-run [FX-ERRCODE-CANCELLED]', () => {
    // Studio v1 WP4 (ADR-002 §29): the person who pressed Stop caused this outcome, so it is not
    // explained as a failure — but its two facts still render, in the same slots as every code's.
    render(<ExecutionProgressView snapshot={errorCodeExecutions.CANCELLED} onRerun={() => {}} />);
    expect(screen.getByTestId('execution-status').textContent).toBe('Cancelled');
    expect(screen.getByTestId('execution-cancelled')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('execution-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('execution-error-browser').textContent).toContain(
      PINNED_EXECUTION_ERROR_FACTS.CANCELLED.browserPhrase,
    );
    expect(screen.queryByRole('button', { name: RERUN_LABEL })).toBeNull();
  });

  it('a null code on a non-ERROR status renders no error region at all [FX-ERRCODE-NULL]', () => {
    render(<ExecutionProgressView snapshot={passedExecution} />);
    expect(screen.queryByTestId('execution-error')).toBeNull();
    expect(screen.queryByTestId('execution-error-unnamed')).toBeNull();
    expect(screen.getByTestId('execution-status').textContent).toBe('Passed');
  });

  it('a step timeout is a FAIL with no code, never TIMEOUT [FX-STEP-FAIL-SKIPPED-TAIL]', () => {
    // Architecture §8.2 in as many words. The fixture's failing step's own message says it timed
    // out, so a surface that read the prose would reach for the TIMEOUT narrative.
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} />);
    expect(screen.queryByTestId('execution-error')).toBeNull();
    expect(screen.getByTestId('execution-status').textContent).toBe('Failed');
    expect(screen.getByTestId('step-status-2').textContent).toBe('FAIL');
    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('The run hit its total time cap');
  });
});

describe('AC-6: the pinned facts cannot be derived from the module they pin', () => {
  it('pinnedExecutionErrorFacts.ts imports neither the narratives nor the component that renders them', () => {
    /*
     * PIN-1, the twelfth catalogued shape. @qa performed exactly the refactor a header comment
     * warned against — deriving the pinned phrases from the module under test — and the suite
     * stayed fully green. The layering held for blanking, because the length floors above are
     * independent of the pin, but every phrase became silently rewordable. This assertion is the
     * only edge that closes it, and it is falsified against every specifier form below.
     */
    const pin = path.join(__dirname, 'pinnedExecutionErrorFacts.ts');
    const specifiers = moduleSpecifiers(fs.readFileSync(pin, 'utf8'));

    const pinned = specifiers.filter((specifier) =>
      /(^|[./])(executionErrorNarratives|ExecutionProgressView|index)$/.test(
        specifier.replace(/\.tsx?$/, ''),
      ),
    );
    expect(
      pinned,
      'the pinned facts are read back out of the thing under test — the assertion VAC-11 removed',
    ).toEqual([]);
  });

  it('the import scanner sees every specifier form, so its silence means something', () => {
    const planted = [
      "import { EXECUTION_ERROR_NARRATIVES } from './executionErrorNarratives';",
      'import { x } from "./ExecutionProgressView";',
      "const mod = await import('./executionErrorNarratives');",
      "const n = require('./executionErrorNarratives');",
      'export { EXECUTION_ERROR_NARRATIVES } from "./executionErrorNarratives";',
    ].join('\n');

    const found = moduleSpecifiers(planted);
    expect(found).toHaveLength(5);
    expect(found.filter((s) => s === './executionErrorNarratives')).toHaveLength(4);

    // And it reads the real file: the pin genuinely imports the contract types module.
    const real = moduleSpecifiers(
      fs.readFileSync(path.join(__dirname, 'pinnedExecutionErrorFacts.ts'), 'utf8'),
    );
    expect(real).toContain('@/types/studio/studioTypes');
  });
});

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
