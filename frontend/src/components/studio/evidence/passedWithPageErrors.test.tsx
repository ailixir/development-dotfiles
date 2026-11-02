import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { failedNavigationHttpErrorExecution, passedExecution } from '@/services/mocks/studio/executionFixtures';
import { ExecutionProgressView } from '@/components/studio/run/ExecutionProgressView';
import { VideoEvidencePanel } from './VideoEvidencePanel';

const at = '2026-09-14T10:00:33Z';
const withError: ExecutionSnapshot = {
  ...passedExecution,
  logs: [
    { at, level: 'ERROR', message: 'console.error: Failed to load resource: 403', stepIndex: 1 },
    { at, level: 'ERROR', message: 'console.error: Failed to load resource: 404', stepIndex: 1 },
  ],
};
const warnOnly: ExecutionSnapshot = {
  ...passedExecution,
  logs: [{ at, level: 'WARN', message: 'console.warn: deprecated', stepIndex: 1 }],
};

describe('a passed step on a page that reported errors', () => {
  it('shows an amber page-error chip on that step only', () => {
    render(<ExecutionProgressView snapshot={withError} />);
    expect(screen.getByTestId('step-page-errors-1')).toHaveTextContent('2 page errors');
    expect(screen.queryByTestId('step-page-errors-0')).toBeNull();
    expect(screen.getByTestId('step-status-1')).toHaveAttribute('data-status', 'PASS');
  });

  it('shows no chip for warnings only', () => {
    render(<ExecutionProgressView snapshot={warnOnly} />);
    expect(screen.queryByTestId('step-page-errors-1')).toBeNull();
  });

  it('puts no chip on a FAIL step even when its page reported errors (SC008-FIX-40)', () => {
    render(<ExecutionProgressView snapshot={failedNavigationHttpErrorExecution} />);
    expect(screen.getByTestId('step-status-2')).toHaveAttribute('data-status', 'FAIL');
    expect(screen.getByTestId('step-message-2')).toHaveTextContent('NAVIGATION_HTTP_ERROR');
    expect(screen.queryByTestId('step-page-errors-2')).toBeNull();
  });
});

describe('the passed-with-page-errors notice', () => {
  it('shows for a PASSED run with a console error, naming the step', () => {
    render(<VideoEvidencePanel snapshot={withError} />);
    expect(screen.getByTestId('passed-with-page-errors')).toHaveTextContent(
      'Passed, but the page reported 2 errors after step 2.',
    );
  });

  it('does not show for a FAILED run, a clean run or warnings only', () => {
    const { rerender } = render(<VideoEvidencePanel snapshot={{ ...withError, status: 'FAILED' }} />);
    expect(screen.queryByTestId('passed-with-page-errors')).toBeNull();
    rerender(<VideoEvidencePanel snapshot={passedExecution} />);
    expect(screen.queryByTestId('passed-with-page-errors')).toBeNull();
    rerender(<VideoEvidencePanel snapshot={warnOnly} />);
    expect(screen.queryByTestId('passed-with-page-errors')).toBeNull();
  });
});
