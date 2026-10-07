/**
 * URL helpers for the Runs page and its run details drawer (story 10.46, AC-3).
 *
 * The page is mounted under `/checks/*` in the host and under `/*` standalone, so paths are derived
 * from the current pathname rather than hard-coded. A run's URL is the list URL plus the execution
 * id, and it keeps the list's query string, so closing the drawer restores the same list.
 */

const RUNS_SEGMENT = '/studio/runs';
const FALLBACK_RUNS_PATH = `/checks${RUNS_SEGMENT}`;

/** `/checks/studio/runs` (or `/studio/runs` standalone) for any path at or below the Runs page. */
export function runsListPath(pathname: string): string {
  const index = pathname.indexOf(RUNS_SEGMENT);
  return index >= 0 ? pathname.slice(0, index + RUNS_SEGMENT.length) : FALLBACK_RUNS_PATH;
}

/** The drawer URL for one run, keeping the list's `?query`. */
export function runDetailsPath(listPath: string, executionId: string, search = ''): string {
  return `${listPath}/${encodeURIComponent(executionId)}${search}`;
}

/** The Studio editor for a test, a sibling of the Runs page. */
export function studioTestPath(listPath: string, testId: string): string {
  const studioBase = listPath.slice(0, listPath.length - '/runs'.length);
  return `${studioBase}/${encodeURIComponent(testId)}`;
}

/** The Tests list, a sibling of the Runs page (`/checks/studio/tests`). */
export function studioTestsPath(listPath: string): string {
  return `${listPath.slice(0, listPath.length - '/runs'.length)}/tests`;
}

/** Copies text to the clipboard. Resolves `false` when the browser refuses or has no clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
