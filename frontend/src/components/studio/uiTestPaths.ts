/**
 * The single source of UI test routes. Every link, navigate call and redirect target for a UI test goes
 * through these helpers; no caller builds the path by hand or inspects the pathname for '/studio'.
 *
 * Each helper takes an explicit `base` (the Checks route prefix). It defaults to '/checks', the same
 * convention as the All Checks detail links (`/checks/details/${id}`). Ids are URI-encoded.
 */

export const DEFAULT_UI_TEST_BASE = '/checks';

export interface UiTestPathOptions {
  /** Route prefix the Checks module is mounted under. Default '/checks'. */
  base?: string;
}

export interface UiTestEditorPathOptions extends UiTestPathOptions {
  /** Open the editor and start a run on arrival (adds `?autorun=1`). */
  autorun?: boolean;
}

/** `{base}/ui-tests/{id}`: the UI test's detail page. */
export function uiTestPath(id: string, { base = DEFAULT_UI_TEST_BASE }: UiTestPathOptions = {}): string {
  return `${base}/ui-tests/${encodeURIComponent(id)}`;
}

/** `{base}/ui-tests/{id}/runs/{executionId}`: one run of the UI test. */
export function uiTestRunPath(id: string, executionId: string, options: UiTestPathOptions = {}): string {
  return `${uiTestPath(id, options)}/runs/${encodeURIComponent(executionId)}`;
}

/** `{base}/ui-tests/{id}/studio`, with `?autorun=1` when `autorun` is set: the editor. */
export function uiTestEditorPath(id: string, { autorun = false, base }: UiTestEditorPathOptions = {}): string {
  const path = `${uiTestPath(id, { base })}/studio`;
  return autorun ? `${path}?autorun=1` : path;
}
