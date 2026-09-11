import { render, type RenderResult } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import type { TestDto } from '@/types/studio/studioTypes';
import { CompileReviewPanel } from './CompileReviewPanel';

/**
 * Shared setup for story 10.10's component tests.
 *
 * Requests are observed through MSW, never through a spy: AC-11a and AC-13 assert on the bytes
 * that left the client and on the number of requests the handler saw. A spy's call arguments and
 * a `disabled` prop are both one layer away from the thing being asserted, and this epic has
 * already found guards that passed at that distance while the property was gone.
 */

export const STUDIO_BASE = '*/api/v1/studio';

export function serveDraft(test: TestDto): void {
  studioMockServer.use(
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(test)),
  );
}

export function renderPanel(test: TestDto): RenderResult {
  serveDraft(test);
  return render(<CompileReviewPanel testId={test.id} />);
}

/** A promise a test resolves by hand, so an in-flight window is constructed rather than hoped for. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
