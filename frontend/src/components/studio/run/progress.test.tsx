import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RETAINED_LOG_FIXTURE_CAP,
  failedWithSkippedTailExecution,
  logsCompleteExecution,
  logsTruncatedExecution,
} from '@/services/mocks/studio/executionFixtures';
import {
  ExecutionProgressView,
  LOGS_TRUNCATED_STATEMENT,
  NOT_ATTEMPTED,
  seekControlLabel,
} from './ExecutionProgressView';

/**
 * Story 10.11a — the bounded report rendered without being turned into a false one
 * (AC-18, AC-19).
 *
 * **AC-19 is small and load-bearing and story 10.16 depends on it.** 10.16's step seek is measured
 * against these values (SPK-06), and ADR-002 §INT-5 says the API applies no calibration and
 * *"never re-bases readings against the first one it sees"*. A `?? 0` on either field would claim
 * an unattempted step began at the recording origin — a claim nobody made, rendered as if the
 * server had made it.
 *
 * The expected values are the **fixture's own**, compared field by field against what is on the
 * screen. That is not VAC-11: the fixture is not the module under test, and the property being
 * asserted is precisely *the renderer did not alter what it was given*, for which the given value
 * is the only possible expectation.
 */

describe('AC-19: step timings reach the surface unaltered', () => {
  it('renders every attempted timing exactly as the snapshot carries it [FX-STEP-FAIL-SKIPPED-TAIL]', () => {
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} />);

    const attempted = failedWithSkippedTailExecution.stepResults.filter(
      (step) => step.offsetMs !== null,
    );
    // Without this the loop below could assert nothing at all.
    expect(attempted.length).toBeGreaterThan(2);

    for (const step of attempted) {
      const duration = screen.getByTestId(`step-duration-${step.stepIndex}`);
      expect(duration.textContent, `step ${step.stepIndex} duration`).toBe(`${step.durationMs} ms`);
      // The start offset is the seek control's, not shown as a timing.
      expect(screen.queryByTestId(`step-offset-${step.stepIndex}`)).toBeNull();
    }
  });

  it('rounding would be visible, because no attempted timing is a whole second', () => {
    // The negative control for the assertion above. If every fixture timing were a round
    // thousand, a renderer that divided and rounded would be indistinguishable from one that did
    // not — the epic's *canary sized so it never reaches the hazard*.
    const attempted = failedWithSkippedTailExecution.stepResults.filter(
      (step) => step.offsetMs !== null,
    );
    const round = attempted.filter((step) => (step.offsetMs ?? 0) % 1000 === 0);
    expect(round, 'a whole-second timing makes the no-rounding assertion undiscriminating').toEqual(
      [],
    );
  });

  it('a null timing renders as not attempted, never as zero [FX-STEP-FAIL-SKIPPED-TAIL]', () => {
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} />);

    const unattempted = failedWithSkippedTailExecution.stepResults.filter(
      (step) => step.offsetMs === null,
    );
    expect(unattempted.length).toBeGreaterThan(0);

    for (const step of unattempted) {
      const slot = `step-duration-${step.stepIndex}`;
      const text = screen.getByTestId(slot).textContent ?? '';
      expect(text, `${slot} should say it was not attempted`).toContain(NOT_ATTEMPTED);
      // No timing *at all* — not `0`, not `0 ms`, not a stray digit that reads as one.
      expect(text, `${slot} rendered a number for a null timing`).not.toMatch(/\d/);
    }
  });

  it('a FAILED run’s later SKIPPED steps carry no timing on screen [FX-STEP-FAIL-SKIPPED-TAIL]', () => {
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} />);

    const steps = failedWithSkippedTailExecution.stepResults;
    const failedIndex = steps.findIndex((step) => step.status === 'FAIL');
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    const tail = steps.slice(failedIndex + 1);
    expect(tail.length, 'the failing step is last, so the skipped tail does not exist').toBeGreaterThan(
      0,
    );

    for (const step of tail) {
      expect(screen.getByTestId(`step-status-${step.stepIndex}`).getAttribute('data-status')).toBe('SKIPPED');
      expect(screen.getByTestId(`step-duration-${step.stepIndex}`).textContent).toBe(NOT_ATTEMPTED);
    }
  });
});

describe('AC-18: retained logs are rendered with their bound stated', () => {
  it('a truncated report says earlier lines were dropped [FX-LOGS-TRUNCATED-AT-CAP]', () => {
    render(<ExecutionProgressView snapshot={logsTruncatedExecution} />);
    const statement = screen.getByTestId('logs-truncated-statement');
    expect(statement.textContent).toBe(LOGS_TRUNCATED_STATEMENT);
    expect(statement.textContent).toMatch(/dropped|earlier/i);
  });

  it('an untruncated report says nothing of the kind [FX-LOGS-COMPLETE]', () => {
    // The assertion that stops a hard-coded sentence. It is the first one a reader calls
    // redundant, and it is the only thing holding the one above up.
    render(<ExecutionProgressView snapshot={logsCompleteExecution} />);
    expect(screen.queryByTestId('logs-truncated-statement')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(LOGS_TRUNCATED_STATEMENT);
  });

  it('every entry the snapshot carries is on the screen, at the cap [FX-LOGS-TRUNCATED-AT-CAP]', () => {
    // The fixture is at the corpus cap on purpose: a client-side "show the last N" is observable
    // against it and is not against a three-line one.
    expect(logsTruncatedExecution.logs.length).toBe(RETAINED_LOG_FIXTURE_CAP);
    render(<ExecutionProgressView snapshot={logsTruncatedExecution} />);

    const region = screen.getByTestId('execution-logs');
    expect(region.querySelectorAll('[data-testid^="log-line-"]').length).toBe(
      logsTruncatedExecution.logs.length,
    );
    // First and last, by content, so a window that kept the right *count* is still caught.
    expect(screen.getByTestId('log-line-0').textContent).toContain(
      logsTruncatedExecution.logs[0].message,
    );
    expect(
      screen.getByTestId(`log-line-${logsTruncatedExecution.logs.length - 1}`).textContent,
    ).toContain(logsTruncatedExecution.logs[logsTruncatedExecution.logs.length - 1].message);
  });

  it('every entry of an untruncated report is on the screen too [FX-LOGS-COMPLETE]', () => {
    render(<ExecutionProgressView snapshot={logsCompleteExecution} />);
    const region = screen.getByTestId('execution-logs');
    expect(region.querySelectorAll('[data-testid^="log-line-"]').length).toBe(
      logsCompleteExecution.logs.length,
    );
  });
});

describe('Studio v1 gaps: a log line with no reading', () => {
  it('renders without a time rather than as "null"', () => {
    const snapshot = {
      ...logsCompleteExecution,
      logs: [
        { at: '2026-09-18T06:00:00Z', level: 'INFO' as const, message: 'browser started' },
        { at: null, level: 'INFO' as const, message: 'browser heartbeat' },
      ],
    };
    render(<ExecutionProgressView snapshot={snapshot} />);

    expect(screen.getByTestId('log-line-0').textContent).toBe(
      '2026-09-18T06:00:00Z INFO browser started',
    );
    expect(screen.getByTestId('log-line-1').textContent).toBe('INFO browser heartbeat');
  });
});

/**
 * STUDIO-UNIFY-001.6 AC-08 (N6): the runner writes 0-based step numbers into the log text and leaves
 * the closing line untimed; the view shows 1-based steps and the run's end time on the closing line.
 */
describe('AC-08: log lines read like the steps', () => {
  const ENDED_AT = '2026-09-18T06:00:09Z';
  const lines = [
    { at: '2026-09-18T06:00:01Z', level: 'INFO' as const, message: 'step 0 started', stepIndex: 0 },
    { at: '2026-09-18T06:00:02Z', level: 'INFO' as const, message: 'step 2 PASS', stepIndex: 2 },
    { at: '2026-09-18T06:00:03Z', level: 'INFO' as const, message: 'step 1 mismatch', stepIndex: 2 },
    { at: null, level: 'INFO' as const, message: 'run PASSED' },
  ];

  it('shows step N+1 for the exact prefix, leaves other text alone, and times the closing line', () => {
    render(
      <ExecutionProgressView
        snapshot={{ ...logsCompleteExecution, status: 'PASSED', endedAt: ENDED_AT, logs: lines }}
      />,
    );

    expect(screen.getByTestId('log-line-0').textContent).toBe('2026-09-18T06:00:01Z INFO step 1 started');
    expect(screen.getByTestId('log-line-1').textContent).toBe('2026-09-18T06:00:02Z INFO step 3 PASS');
    expect(screen.getByTestId('log-line-2').textContent).toBe('2026-09-18T06:00:03Z INFO step 1 mismatch');
    expect(screen.getByTestId('log-line-3').textContent).toBe(`${ENDED_AT} INFO run PASSED`);
  });

  it('keeps the closing line untimed while the run has not ended', () => {
    render(
      <ExecutionProgressView
        snapshot={{ ...logsCompleteExecution, status: 'RUNNING', endedAt: null, logs: lines }}
      />,
    );

    expect(screen.getByTestId('log-line-3').textContent).toBe('INFO run PASSED');
  });
});

/**
 * STUDIO-UNIFY-001.6 AC-07 (N5, step side): a step that has not started says so once, in a run that
 * has not ended. A finished run keeps the 10.16a words and values.
 */
describe('AC-07: waiting words for steps that have not started', () => {
  const inFlight = {
    ...failedWithSkippedTailExecution,
    status: 'RUNNING' as const,
    errorCode: null,
    endedAt: null,
    stepResults: failedWithSkippedTailExecution.stepResults.map((step, index) => ({
      ...step,
      status: index === 0 ? ('RUNNING' as const) : ('PENDING' as const),
      offsetMs: null,
      durationMs: null,
      message: null,
    })),
  };

  it('shows one word per step, not two "not attempted" slots', () => {
    render(<ExecutionProgressView snapshot={inFlight} onSeekStep={() => undefined} />);

    expect(screen.getByTestId('step-waiting-0').textContent).toBe('Running');
    expect(screen.getByTestId('step-waiting-1').textContent).toBe('Waiting to start');
    for (const step of inFlight.stepResults) {
      expect(screen.queryByTestId(`step-offset-${step.stepIndex}`)).toBeNull();
      expect(screen.queryByTestId(`step-duration-${step.stepIndex}`)).toBeNull();
    }
    expect(screen.queryByText(NOT_ATTEMPTED)).toBeNull();
    // The 10.16a seek naming is untouched.
    expect(screen.getByTestId('step-seek-1').getAttribute('aria-label')).toBe(
      seekControlLabel(inFlight.stepResults[1]),
    );
    expect(seekControlLabel(inFlight.stepResults[1])).toContain(NOT_ATTEMPTED);
  });

  it('a terminal snapshot keeps "not attempted" for a step it never reached', () => {
    render(
      <ExecutionProgressView
        snapshot={{ ...inFlight, status: 'ERROR', errorCode: 'CANCELLED', endedAt: '2026-09-18T06:00:09Z' }}
      />,
    );

    expect(screen.queryByTestId('step-waiting-1')).toBeNull();
    expect(screen.getByTestId('step-duration-1').textContent).toBe(NOT_ATTEMPTED);
  });
});

describe('Studio v1 D1: the step a cancel interrupted', () => {
  // The shape the runner now sends and the API projects verbatim (openapi `StepResult`, ADR-002
  // §29.5): the interrupted step is SKIPPED, keeps the start it had, and carries the runner's fixed
  // stop text; a step that never started stays as it was. Built from a fixture rather than from the
  // runner's constant, which this package cannot import.
  const STOPPED = 'The run was stopped before this step finished.';
  const cancelledMidStep = {
    ...failedWithSkippedTailExecution,
    status: 'ERROR' as const,
    errorCode: 'CANCELLED' as const,
    stepResults: failedWithSkippedTailExecution.stepResults.map((step) =>
      step.stepIndex === 1
        ? { ...step, status: 'SKIPPED' as const, offsetMs: 1234, durationMs: 567, message: STOPPED }
        : step.stepIndex > 1
          ? { ...step, status: 'PENDING' as const, offsetMs: null, durationMs: null, message: null }
          : step,
    ),
  };

  it('renders SKIPPED with the stop text and the start it had, and offers the seek', () => {
    render(<ExecutionProgressView snapshot={cancelledMidStep} onSeekStep={() => undefined} />);

    expect(screen.getByTestId('execution-cancelled')).toBeTruthy();
    expect(screen.getByTestId('step-status-1').getAttribute('data-status')).toBe('SKIPPED');
    expect(screen.getByTestId('step-message-1').textContent).toBe(STOPPED);
    expect(screen.getByTestId('step-duration-1').textContent).toBe('567 ms');
    expect(screen.getByTestId('step-seek-1').hasAttribute('disabled')).toBe(false);
    // The step after it never started: no timing, no seek, no message.
    expect(screen.getByTestId('step-duration-2').textContent).toContain(NOT_ATTEMPTED);
    expect(screen.getByTestId('step-seek-2').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('step-message-2')).toBeNull();
    expect(screen.queryByText('FAIL')).toBeNull();
  });
});

describe('showStatus and showSteps (the UI test page summarises a run; Studio keeps today\'s output)', () => {
  it('renders the grey status chip, steps and logs by default', () => {
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} />);

    expect(screen.getByTestId('execution-status')).toBeTruthy();
    expect(screen.getByTestId('execution-steps')).toBeTruthy();
    expect(screen.getByTestId('execution-logs')).toBeTruthy();
  });

  it('drops the status chip with showStatus={false} and the step list with showSteps={false}', () => {
    render(<ExecutionProgressView snapshot={failedWithSkippedTailExecution} showStatus={false} showSteps={false} showLogs={false} />);

    expect(screen.queryByTestId('execution-status')).toBeNull();
    expect(screen.queryByTestId('execution-steps')).toBeNull();
    expect(screen.queryByTestId('execution-logs')).toBeNull();
    // Nothing to explain for a FAILED run with no code: no empty box either.
    expect(screen.queryByTestId('execution-progress')).toBeNull();
  });
});
