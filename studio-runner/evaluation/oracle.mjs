import { isDeepStrictEqual } from 'node:util';

/** Expectations are fixture-owned manifest data, never read from a generated artifact. */
export function evaluateOracle(expected, observed) {
  const failures = [];
  if (!validObservation(expected) || !validObservation(observed)) {
    return {correct:false,falseSuccess:observed?.executionStatus==='PASSED',failures:['invalid-oracle-input']};
  }
  if (!observed || observed.namespace !== expected.namespace) failures.push('namespace');
  if (!isDeepStrictEqual(observed?.events, expected.events)) failures.push('domain-events');
  if (!isDeepStrictEqual(observed?.state, expected.state)) failures.push('application-state');
  if (observed?.executionStatus !== expected.executionStatus) failures.push('execution-outcome');
  if (observed?.revisionId !== expected.revisionId
      || observed?.configurationRevision !== expected.configurationRevision) failures.push('revision-association');
  if (expected.executionStatus === 'FAILED'
      && (observed.assertionFailureStep !== expected.assertionFailureStep
          || observed.failureKind !== 'ASSERTION' || observed.errorCode !== null)) failures.push('assertion-failure-origin');
  return { correct: failures.length === 0, falseSuccess: observed?.executionStatus === 'PASSED' && failures.length > 0, failures };
}

function validObservation(value) {
  return value && typeof value.namespace === 'string' && value.namespace.length > 0
    && typeof value.revisionId === 'string' && value.revisionId.length > 0
    && Number.isSafeInteger(value.configurationRevision) && value.configurationRevision > 0
    && ['PASSED','FAILED','ERROR'].includes(value.executionStatus)
    && Array.isArray(value.events) && value.state && typeof value.state === 'object'
    && !Array.isArray(value.state)
    && (value.executionStatus !== 'FAILED' || (Number.isSafeInteger(value.assertionFailureStep) && value.assertionFailureStep >= 0
        && value.failureKind === 'ASSERTION' && value.errorCode === null));
}

export function summarize(trials, plannedIds) {
  if (!Array.isArray(plannedIds) || !plannedIds.length || new Set(plannedIds).size !== plannedIds.length
      || plannedIds.some(id=>typeof id!=='string' || !id)) throw new Error('Unique planned trial identities required');
  const seen = new Set();
  for (const trial of trials) {
    if (!plannedIds.includes(trial.id) || seen.has(trial.id) || typeof trial.complete!=='boolean'
        || !['SUPPORTED','UNSUPPORTED','CLARIFICATION'].includes(trial.expectedClass)) throw new Error('Invalid trial identity/outcome');
    if (trial.complete && (!trial.oracle || typeof trial.oracle.correct!=='boolean'
        || typeof trial.oracle.falseSuccess!=='boolean' || (trial.oracle.correct && trial.oracle.falseSuccess)
        || !Number.isFinite(trial.elapsedMs) || trial.elapsedMs < 0)) throw new Error('Incomplete or contradictory trial evidence');
    seen.add(trial.id);
  }
  const complete = trials.filter(t => t.complete);
  const supported = trials.filter(t => t.expectedClass === 'SUPPORTED');
  const durations = complete.map(t => t.elapsedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => durations.length ? durations[Math.ceil(durations.length * p) - 1] : null;
  return {
    schemaVersion: 1, releaseReady: false, plannedTrials:plannedIds.length, completedTrials: complete.length,
    missingTrials: plannedIds.length - complete.length, supportedTrials: supported.length,
    correctTrials: complete.filter(t => t.oracle?.correct === true).length,
    incorrectTrials: complete.filter(t => t.oracle?.correct !== true).length,
    falseSuccesses: complete.filter(t => t.oracle?.falseSuccess === true).length,
    unsupportedTrials: trials.filter(t => t.expectedClass === 'UNSUPPORTED').length,
    clarificationTrials: trials.filter(t => t.expectedClass === 'CLARIFICATION').length,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), timingSamples: complete.length, timingCoverage: complete.length/plannedIds.length,
    inputTokens: complete.length && complete.every(t => Number.isFinite(t.inputTokens) && t.inputTokens >= 0) ? complete.reduce((a,t) => a+t.inputTokens, 0) : null,
    outputTokens: complete.length && complete.every(t => Number.isFinite(t.outputTokens) && t.outputTokens >= 0) ? complete.reduce((a,t) => a+t.outputTokens, 0) : null,
    cost: null,
  };
}

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error('Manifest requires schemaVersion1 and nonempty cases');
  }
  const ids = new Set();
  for (const entry of manifest.cases) {
    if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
        || typeof entry.family !== 'string' || !['development','held-out'].includes(entry.split)
        || !['SUPPORTED','UNSUPPORTED','CLARIFICATION'].includes(entry.expectedClass)
        || !Array.isArray(entry.source) || !entry.source.length || entry.source.some(s => typeof s !== 'string')
        || !(entry.expectedClass === 'SUPPORTED'
          ? validObservation(entry.expected) && entry.expected.executionStatus !== 'ERROR'
            && (entry.expected.events.length > 0 || Object.keys(entry.expected.state).length > 0)
          : entry.expected && Object.keys(entry.expected).length === 1
            && entry.expected.compileOutcome === (entry.expectedClass === 'UNSUPPORTED' ? 'UNSUPPORTED_CAPABILITY' : 'AMBIGUOUS_INTENT'))) {
      throw new Error('Invalid/duplicate evaluation case');
    }
    if (entry.editedSource && (!Array.isArray(entry.editedSource)
        || entry.editedSource.some(line=>typeof line!=='string') || !validObservation(entry.baselineExpected)
        || entry.baselineExpected.executionStatus!=='PASSED')) throw new Error('Invalid paired edit/baseline oracle');
    ids.add(entry.id);
  }
  const families = new Map();
  for (const entry of manifest.cases) {
    if (families.has(entry.family) && families.get(entry.family) !== entry.split) {
      throw new Error('Family leakage across development and held-out splits');
    }
    families.set(entry.family, entry.split);
  }
  return manifest;
}
