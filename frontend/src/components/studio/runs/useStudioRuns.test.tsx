import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { passedExecution } from '@/services/mocks/studio/executionFixtures';
import type { ExecutionSnapshot } from '@/types/studio/studioTypes';
import { useStudioRuns, type StudioRunsQuery } from './useStudioRuns';

const STUDIO_BASE = '*/api/v1/studio';
const base: StudioRunsQuery = { q: '', status: '', csiId: null, sort: 'acceptedAt,desc', page: 1, pageSize: 20 };

const runOf = (executionId: string, testId: string): ExecutionSnapshot => ({ ...passedExecution, executionId, testId });

/** Serves the list per test and the running count; records every request's testId and status. */
function serve(byTest: Record<string, ExecutionSnapshot[]>) {
  const calls: { testId: string | null; status: string | null }[] = [];
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/executions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const testId = params.get('testId');
      calls.push({ testId, status: params.get('status') });
      const data = testId ? (byTest[testId] ?? []) : Object.values(byTest).flat();
      const isCount = params.get('size') === '1';
      return HttpResponse.json({
        data: isCount ? [] : data,
        page: 0,
        size: 20,
        totalElements: data.length,
        totalPages: 1,
      });
    }),
  );
  return calls;
}

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('useStudioRuns testId', () => {
  it('sends testId on the list request and on the running-count request', async () => {
    const calls = serve({ 'test-a': [runOf('run-a1', 'test-a')] });
    const { result } = renderHook(() => useStudioRuns({ ...base, testId: 'test-a' }));

    await waitFor(() => expect(result.current.runs.map((run) => run.executionId)).toEqual(['run-a1']));
    await waitFor(() => expect(result.current.runningCount).toBe(1));
    expect(calls.length).toBe(2);
    expect(calls.every((call) => call.testId === 'test-a')).toBe(true);
    expect(calls.map((call) => call.status).sort()).toEqual(['RUNNING', null]);
  });

  it('sends no testId when none is given', async () => {
    const calls = serve({ 'test-a': [runOf('run-a1', 'test-a')], 'test-b': [runOf('run-b1', 'test-b')] });
    const { result } = renderHook(() => useStudioRuns(base));

    await waitFor(() => expect(result.current.runs).toHaveLength(2));
    expect(calls.every((call) => call.testId === null)).toBe(true);
  });

  it('drops the previous test rows when the test id changes', async () => {
    serve({ 'test-a': [runOf('run-a1', 'test-a')], 'test-b': [runOf('run-b1', 'test-b')] });
    const { result, rerender } = renderHook(({ testId }) => useStudioRuns({ ...base, testId }), {
      initialProps: { testId: 'test-a' },
    });
    await waitFor(() => expect(result.current.runs.map((run) => run.executionId)).toEqual(['run-a1']));

    rerender({ testId: 'test-b' });
    expect(result.current.runs.map((run) => run.executionId)).not.toContain('run-a1');
    await waitFor(() => expect(result.current.runs.map((run) => run.executionId)).toEqual(['run-b1']));
  });
});
