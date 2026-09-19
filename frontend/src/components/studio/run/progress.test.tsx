import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RETAINED_LOG_FIXTURE_CAP,
  failedWithSkippedTailExecution,
  logsCompleteExecution,
  logsTruncatedExecution,
} from '@/services/mocks/studio/executionFixtures';
import { ExecutionProgressView, LOGS_TRUNCATED_STATEMENT, NOT_ATTEMPTED } from './ExecutionProgressView';

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
      const offset = screen.getByTestId(`step-offset-${step.stepIndex}`);
      const duration = screen.getByTestId(`step-duration-${step.stepIndex}`);
      expect(offset.textContent, `step ${step.stepIndex} offset`).toContain(`${step.offsetMs}ms`);
      expect(duration.textContent, `step ${step.stepIndex} duration`).toContain(
        `${step.durationMs}ms`,
      );
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
      for (const slot of [`step-offset-${step.stepIndex}`, `step-duration-${step.stepIndex}`]) {
        const text = screen.getByTestId(slot).textContent ?? '';
        expect(text, `${slot} should say it was not attempted`).toContain(NOT_ATTEMPTED);
        // No timing *at all* — not `0`, not `0ms`, not a stray digit that reads as one.
        expect(text, `${slot} rendered a number for a null timing`).not.toMatch(/\d/);
      }
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
      expect(screen.getByTestId(`step-status-${step.stepIndex}`).textContent).toBe('SKIPPED');
      expect(screen.getByTestId(`step-offset-${step.stepIndex}`).textContent).toBe(NOT_ATTEMPTED);
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
        { at: null, level: 'INFO' as const, message: 'run finished' },
      ],
    };
    render(<ExecutionProgressView snapshot={snapshot} />);

    expect(screen.getByTestId('log-line-0').textContent).toBe(
      '2026-09-18T06:00:00Z INFO browser started',
    );
    expect(screen.getByTestId('log-line-1').textContent).toBe('INFO run finished');
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
    expect(screen.getByTestId('step-status-1').textContent).toBe('SKIPPED');
    expect(screen.getByTestId('step-message-1').textContent).toBe(STOPPED);
    expect(screen.getByTestId('step-offset-1').textContent).toContain('1234ms');
    expect(screen.getByTestId('step-seek-1').hasAttribute('disabled')).toBe(false);
    // The step after it never started: no timing, no seek, no message.
    expect(screen.getByTestId('step-offset-2').textContent).toContain(NOT_ATTEMPTED);
    expect(screen.getByTestId('step-seek-2').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('step-message-2')).toBeNull();
    expect(screen.queryByText('FAIL')).toBeNull();
  });
});
