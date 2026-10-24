/**
 * Shared test inputs for the observed-authoring harness tests (STUDIO-OBS-009 AC-7..AC-10, lane EP).
 * Everything here is a UNIT-TEST INPUT. Synthetic run records exist only to prove the gate arithmetic and the
 * accounting; they are never written to an evidence file as results and never labelled D-C evidence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OBSERVED_AUTHORING_DIR, loadManifest,
  type CorpusCase, type CorpusManifest, type ExpectedOutcome, type RunMode, type RunRecord,
} from '../../evaluation/observed-authoring/evaluate.mjs';

export const frozenManifest = (): CorpusManifest => structuredClone(loadManifest());

export const readJson = (relative: string): unknown => JSON.parse(readFileSync(join(OBSERVED_AUTHORING_DIR, relative), 'utf8'));

/** Narrowing helper for tests: a missing value is a failed precondition, not a silent undefined. */
export function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

export const expectedOf = (entry: CorpusCase): ExpectedOutcome => {
  if (entry.expectedOutcome === null) throw new Error(`no expected outcome for ${entry.id}`);
  return readJson(entry.expectedOutcome.path) as ExpectedOutcome;
};

export interface SyntheticOptions {
  mode: RunMode;
  /** Number of class P runs (in case order) that end as ordinary failures. */
  failP?: number;
  /** Case id whose first run is a false pass. */
  falsePassCase?: string;
  /** Case id whose first run leaks a secret. */
  leakCase?: string;
  /** Drop this many class P runs from the end (missing runs). */
  dropP?: number;
}

export function syntheticRuns(manifest: CorpusManifest, options: SyntheticOptions): RunRecord[] {
  const runs: RunRecord[] = [];
  const frozen = Date.parse(manifest.manifestFrozenAt ?? '');
  let tick = 0;
  let failuresLeft = options.failP ?? 0;
  for (const entry of manifest.cases) {
    if (entry.status !== 'READY_LOCAL') continue;
    for (let rep = 1; rep <= entry.repetitions; rep += 1) {
      tick += 1;
      const start = new Date(frozen + 3_600_000 + tick * 10_000);
      const end = new Date(start.getTime() + 1_000 + tick * 100);
      const fails = entry.class === 'P' && failuresLeft > 0;
      if (fails) failuresLeft -= 1;
      const falsePass = options.falsePassCase === entry.id && rep === 1;
      const good = entry.class === 'P' ? !fails : true;
      runs.push({
        caseId: entry.id, rep, attempt: 1, mode: options.mode, manifestSha256: manifest.manifestSha256,
        runStartedAt: start.toISOString(), runFinishedAt: end.toISOString(), infrastructureFailure: null,
        session: { terminal: entry.class === 'P' ? (fails ? 'FAILED' : 'SUCCEEDED') : 'FAILED', observedStates: [], published: entry.class === 'P' && !fails, clarifications: 0, failureCode: null, failedStepNumber: null },
        oracle: { correct: good && !falsePass, falseSuccess: falsePass, failures: good && !falsePass ? [] : ['synthetic'] },
        usage: { modelProposals: 4 + (tick % 5), inputTokens: 1000 * tick, outputTokens: 100 * tick },
        secretOrPiiLeak: options.leakCase === entry.id && rep === 1 ? 1 : 0,
        rs1NonScalarReadGaps: 0, authoredEchoUnobservableTargets: 0, focusMutationRefusedFills: 0,
      });
    }
  }
  if ((options.dropP ?? 0) > 0) {
    let drop = options.dropP ?? 0;
    const classOf = new Map(manifest.cases.map((c) => [c.id, c.class]));
    for (let i = runs.length - 1; i >= 0 && drop > 0; i -= 1) {
      const run = runs[i];
      if (run !== undefined && classOf.get(run.caseId) === 'P') { runs.splice(i, 1); drop -= 1; }
    }
  }
  return runs;
}
