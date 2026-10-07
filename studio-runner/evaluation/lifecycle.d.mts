/** Types for `evaluation/lifecycle.mjs` (see `report.d.mts` for the precedent). */

export type EvaluationTransport = (url: URL, init: RequestInit) => Promise<Response>;

/** Runs the evaluation; resolves to the spec §5 exit code. The transport is injectable for fixture-backed tests only. */
export declare function runEvaluation(
  config: Record<string, unknown>,
  manifest: Record<string, unknown>,
  directory: string,
  transport?: EvaluationTransport,
): Promise<0 | 1 | 2>;
