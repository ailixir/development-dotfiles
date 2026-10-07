import { summarize } from './oracle.mjs';

/**
 * Story 10.26 AC-3 evaluation report. Every rate carries its numerator, its denominator and the
 * definition of that denominator (spec §6). Planned trials that never completed stay in the
 * denominators; telemetry the API did not expose is reported as unavailable, never as zero.
 */
export const REPORT_SCHEMA_VERSION = 2;
export const UNAVAILABLE = 'unavailable';
const CLASSES = ['SUPPORTED','UNSUPPORTED','CLARIFICATION'];

const ratio = (numerator, denominator, denominatorDefinition) =>
  ({numerator, denominator, rate: denominator ? numerator / denominator : null, denominatorDefinition});
/** Nearest-rank percentile; null when there are no samples. */
export const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
};
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const latency = (values, denominator, definition) => {
  const samples = values.filter(Number.isFinite);
  return {samples: samples.length, denominator, missingSamples: denominator - samples.length, denominatorDefinition: definition,
    p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), maxMs: samples.length ? Math.max(...samples) : null};
};
/** Sum across trials only when every counted trial reported the value; otherwise null. */
const total = (trials, pick) => {
  const values = trials.map(pick);
  const available = values.filter(finite).length;
  return {total: trials.length && available === trials.length ? values.reduce((a, v) => a + v, 0) : null,
    availableTrials: available, denominator: trials.length};
};
const usageOf = trial => [trial.usage, trial.baseline?.usage];
const summed = (trial, key) => {
  const values = usageOf(trial).filter(u => u !== undefined);
  if (!values.length || values.some(u => !u || !finite(u[key]))) return null;
  return values.reduce((a, u) => a + u[key], 0);
};

function normalisePlan(planned, trials) {
  if (!Array.isArray(planned) || !planned.length) throw new Error('Planned trials required');
  return planned.map(entry => {
    if (typeof entry === 'string') {
      const seen = trials.find(t => t.id === entry);
      return {id: entry, expectedClass: seen?.expectedClass ?? 'UNKNOWN', requestedMode: seen?.requestedMode ?? 'UNKNOWN', family: seen?.family ?? null};
    }
    if (!entry || typeof entry.id !== 'string' || !CLASSES.includes(entry.expectedClass)) throw new Error('Invalid planned trial');
    return {id: entry.id, expectedClass: entry.expectedClass, requestedMode: entry.requestedMode ?? 'UNKNOWN', family: entry.family ?? null};
  });
}

function outcomeMetrics(plan, trials) {
  const byId = new Map(trials.map(t => [t.id, t]));
  const of = cls => plan.filter(p => p.expectedClass === cls).map(p => ({plan: p, trial: byId.get(p.id)}));
  const supported = of('SUPPORTED');
  const complete = supported.filter(({trial}) => trial?.complete);
  const correct = complete.filter(({trial}) => trial.oracle?.correct === true);
  const passes = complete.filter(({trial}) => trial.executionStatus === 'PASSED');
  const falseSuccess = complete.filter(({trial}) => trial.oracle?.falseSuccess === true);
  const families = new Map();
  for (const {plan: p, trial} of supported) {
    const key = p.family ?? p.id;
    const entry = families.get(key) ?? {planned: 0, correct: 0};
    entry.planned++; if (trial?.complete && trial.oracle?.correct === true) entry.correct++;
    families.set(key, entry);
  }
  const nonExecutable = cls => {
    const rows = of(cls);
    return {
      correctNonExecutable: ratio(rows.filter(({trial}) => trial?.complete && trial.oracle?.correct === true).length, rows.length,
        `all planned ${cls} trials (incomplete trials count as not handled)`),
      wrongAcceptance: ratio(rows.filter(({trial}) => trial?.candidateProduced === true).length, rows.length,
        `all planned ${cls} trials; a produced executable candidate is a failure`),
      incomplete: rows.filter(({trial}) => !trial?.complete).length,
    };
  };
  return {
    correctness: {
      behavioralCorrectness: ratio(correct.length, supported.length,
        'all planned SUPPORTED trials; incomplete, refused or timed-out trials count as incorrect'),
      completion: ratio(plan.filter(p => byId.get(p.id)?.complete).length, plan.length, 'all planned trials, every class'),
      incompleteSupported: supported.length - complete.length,
    },
    coverage: {
      supportedCoverage: ratio(supported.filter(({trial}) => trial?.candidateProduced === true).length, supported.length,
        'all planned SUPPORTED trials yielding a complete statically valid candidate (rejecting everything scores 0)'),
      familyCorrectness: ratio([...families.values()].filter(f => f.correct === f.planned).length, families.size,
        'planned SUPPORTED families; a family counts only when every planned trial in it is correct'),
      plannedByClass: Object.fromEntries([...CLASSES, 'UNKNOWN'].map(cls => [cls, plan.filter(p => p.expectedClass === cls).length])),
    },
    unsupportedOutcomes: {UNSUPPORTED: nonExecutable('UNSUPPORTED'), CLARIFICATION: nonExecutable('CLARIFICATION')},
    falseSuccess: {
      count: falseSuccess.length,
      perSupportedTrial: ratio(falseSuccess.length, supported.length, 'all planned SUPPORTED trials'),
      perPassExecution: ratio(falseSuccess.length, passes.length, 'completed SUPPORTED trials whose execution reported PASSED'),
    },
  };
}

function latencyMetrics(plan, trials, run) {
  const planned = new Set(plan.map(p => p.id));
  const mine = trials.filter(t => planned.has(t.id));
  const complete = mine.filter(t => t.complete);
  return {
    concurrency: run ? {configuredWorkers: run.concurrency, peakInFlightCompiles: run.peakInFlightCompiles ?? null} : UNAVAILABLE,
    compileToCandidate: latency(mine.map(t => t.compileMs), plan.length,
      'all planned trials; harness-observed evaluated compile from request to terminal state (missing samples listed)'),
    inference: latency(mine.map(t => t.usage?.elapsedMs), plan.length,
      'all planned trials; backend-reported inference elapsedMs of the evaluated compile'),
    endToEnd: latency(complete.map(t => t.elapsedMs), plan.length,
      'all planned trials; completed trials only, including baseline, confirmation, browser run and oracle'),
  };
}

function budgetMetrics(plan, trials, run) {
  const planned = new Set(plan.map(p => p.id));
  const complete = trials.filter(t => planned.has(t.id) && t.complete);
  return {
    tokens: {
      definition: 'completed trials, baseline plus evaluated compile; a total is null unless every completed trial reported it',
      input: total(complete, t => summed(t, 'inputTokens')),
      output: total(complete, t => summed(t, 'outputTokens')),
      thinking: total(complete, t => summed(t, 'thinkingTokens')),
    },
    transport: {
      observedAttempts: total(complete, t => summed(t, 'transportAttemptCount')),
      reservedCalls: run?.reservedTransportCalls ?? UNAVAILABLE,
      maxTransportCalls: run?.budgets?.maxTransportCalls ?? UNAVAILABLE,
      apiCalls: run?.apiCalls ?? UNAVAILABLE,
      maxApiCalls: run?.budgets?.maxApiCalls ?? UNAVAILABLE,
      elapsedMs: run?.elapsedMs ?? UNAVAILABLE,
      maxElapsedMs: run?.budgets?.maxElapsedMs ?? UNAVAILABLE,
      stoppedBy: run ? (run.stoppedBy ?? null) : UNAVAILABLE,
    },
    cost: UNAVAILABLE,
  };
}

function repairMetrics(plan, trials) {
  const planned = new Set(plan.map(p => p.id));
  const mine = trials.filter(t => planned.has(t.id) && t.usage !== undefined && t.usage !== null);
  const reported = mine.filter(t => finite(t.usage.repairCount));
  const entered = reported.filter(t => t.usage.repairCount > 0);
  return {
    enteredRepair: ratio(entered.length, reported.length, 'trials whose evaluated compile reported repairCount'),
    repairTelemetryMissing: plan.length - reported.length,
    repairYield: ratio(entered.filter(t => t.complete && t.candidateProduced === true && t.oracle?.correct === true).length, entered.length,
      'trials entering repair; success requires a valid candidate and a correct independent oracle'),
    totalRepairs: total(reported, t => t.usage.repairCount),
    totalProposals: total(reported, t => t.usage.proposalCount),
    regressions: UNAVAILABLE,
  };
}

function capacityMetrics(plan, trials, events) {
  if (!Array.isArray(events)) return UNAVAILABLE;
  const accepted = events.filter(e => e.type === 'ACCEPTED').map(e => e.atMs).sort((a, b) => a - b);
  const refusals = events.filter(e => e.type === 'REFUSED');
  const recoveries = refusals.map(r => { const next = accepted.find(at => at > r.atMs); return next === undefined ? null : next - r.atMs; });
  const recovered = recoveries.filter(v => v !== null);
  const planned = new Set(plan.map(p => p.id));
  const outcomes = {};
  for (const t of trials) if (planned.has(t.id) && t.usage && t.usage.cancellationOutcome !== null && t.usage.cancellationOutcome !== undefined) {
    outcomes[t.usage.cancellationOutcome] = (outcomes[t.usage.cancellationOutcome] ?? 0) + 1;
  }
  return {
    admissionsOffered: accepted.length + refusals.length,
    admissionsAccepted: accepted.length,
    admissionsRefused: refusals.length,
    refusalRate: ratio(refusals.length, accepted.length + refusals.length, 'all compile admissions offered by the harness'),
    recovery: {...ratio(recovered.length, refusals.length, 'refused admissions followed by a later accepted admission'),
      p50Ms: percentile(recovered, 0.5), maxMs: recovered.length ? Math.max(...recovered) : null},
    cancellationOutcomes: outcomes,
    postDeadlineCalls: UNAVAILABLE,
    deadlineSlotRecovery: UNAVAILABLE,
  };
}

function pinMetrics(trials, run) {
  const sets = new Map();
  let mismatches = 0; let executions = 0;
  for (const t of trials) {
    if (!t.runtime) continue;
    executions++;
    const key = JSON.stringify(t.runtime);
    sets.set(key, (sets.get(key) ?? 0) + 1);
    if (t.oracle?.failures?.includes('runtime-pin-mismatch')) mismatches++;
  }
  return {
    declared: run?.pins ?? UNAVAILABLE,
    sourceCommit: run?.sourceCommit ?? UNAVAILABLE,
    dirtyBaselineDigest: run?.dirtyBaselineDigest ?? UNAVAILABLE,
    manifestDigest: run?.manifestDigest ?? UNAVAILABLE,
    fixtureVersion: run?.fixtureVersion ?? UNAVAILABLE,
    observedRuntime: [...sets].map(([key, count]) => ({runtime: JSON.parse(key), executions: count})),
    runtimeMismatch: ratio(mismatches, executions, 'executions reporting runtime pins'),
  };
}

export function buildReport({trials, planned, run, capacityEvents}) {
  if (!Array.isArray(trials)) throw new Error('Trials required');
  const plan = normalisePlan(planned, trials);
  const legacy = summarize(trials, plan.map(p => p.id));
  const scope = filter => {
    const subPlan = plan.filter(filter);
    const ids = new Set(subPlan.map(p => p.id));
    return {plannedTrials: subPlan.length, ...outcomeMetrics(subPlan, trials.filter(t => ids.has(t.id))),
      latency: latencyMetrics(subPlan, trials, null)};
  };
  const evidenceGaps = [];
  if (!run) evidenceGaps.push('run context (pins, budgets, concurrency) unavailable');
  else if (!run.pins || typeof run.pins !== 'object' || !Object.keys(run.pins).length) evidenceGaps.push('declared pins missing');
  if (plan.some(p => p.expectedClass === 'UNKNOWN')) evidenceGaps.push('planned trials without expected class');
  return {
    ...legacy,
    schemaVersion: REPORT_SCHEMA_VERSION,
    releaseReady: false,
    tier: run?.tier ?? UNAVAILABLE,
    purpose: run?.purpose ?? UNAVAILABLE,
    evidenceGaps,
    pins: pinMetrics(trials, run),
    ...outcomeMetrics(plan, trials),
    latency: latencyMetrics(plan, trials, run),
    budgets: budgetMetrics(plan, trials, run),
    repairs: repairMetrics(plan, trials),
    capacity: capacityMetrics(plan, trials, capacityEvents),
    byRequestedMode: Object.fromEntries([...new Set(plan.map(p => p.requestedMode))].map(mode => [mode, scope(p => p.requestedMode === mode)])),
  };
}

/** 0 = checks passed; 1 = behavioral/check failure; 2 = incomplete evidence (spec §5). */
export function reportExitCode(report) {
  if (report.missingTrials || report.evidenceGaps.length) return 2;
  return report.incorrectTrials || report.falseSuccesses ? 1 : 0;
}

const pct = r => r.rate === null ? 'n/a' : `${(r.rate * 100).toFixed(1)}%`;
const line = (label, r) => `- ${label}: ${r.numerator}/${r.denominator} (${pct(r)}) — denominator: ${r.denominatorDefinition}`;
const ms = v => v === null ? 'n/a' : `${Math.round(v)} ms`;
const lat = (label, l) => `- ${label}: p50 ${ms(l.p50Ms)}, p95 ${ms(l.p95Ms)}, max ${ms(l.maxMs)} — ${l.samples}/${l.denominator} samples (${l.missingSamples} missing); denominator: ${l.denominatorDefinition}`;
const tot = (label, t) => `- ${label}: ${t.total === null ? UNAVAILABLE : t.total} — reported by ${t.availableTrials}/${t.denominator} completed trials`;
const val = v => v === null ? 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v);

export function renderReport(report) {
  const out = [
    '# Studio inference evaluation report', '',
    `Schema ${report.schemaVersion}; tier ${report.tier}; purpose ${report.purpose}; releaseReady: false. ` +
      'Fixture-backed or scripted evidence is not live model quality evidence.', '',
    `Completed ${report.completedTrials}/${report.plannedTrials} planned trials; ${report.missingTrials} incomplete.`,
    ...(report.evidenceGaps.length ? ['', `Evidence gaps: ${report.evidenceGaps.join('; ')}.`] : []),
    '', '## Pins',
    `- Declared: ${val(report.pins.declared)}`,
    `- Source commit: ${val(report.pins.sourceCommit)}; dirty baseline digest: ${val(report.pins.dirtyBaselineDigest)}`,
    `- Manifest digest: ${val(report.pins.manifestDigest)}; fixture version: ${val(report.pins.fixtureVersion)}`,
    `- Observed runtime: ${report.pins.observedRuntime.map(r => `${JSON.stringify(r.runtime)} ×${r.executions}`).join(', ') || 'none'}`,
    line('Runtime pin mismatches', report.pins.runtimeMismatch),
    '', '## Correctness and coverage',
    line('Behavioral correctness', report.correctness.behavioralCorrectness),
    line('Completion', report.correctness.completion),
    line('Supported coverage', report.coverage.supportedCoverage),
    line('Family correctness', report.coverage.familyCorrectness),
    `- Planned by class: ${JSON.stringify(report.coverage.plannedByClass)}`,
    '', '## Unsupported and ambiguous outcomes',
    ...['UNSUPPORTED','CLARIFICATION'].flatMap(cls => [
      line(`${cls} correctly non-executable`, report.unsupportedOutcomes[cls].correctNonExecutable),
      line(`${cls} wrongly accepted`, report.unsupportedOutcomes[cls].wrongAcceptance)]),
    '', '## False success',
    `- Count: ${report.falseSuccess.count}`,
    line('Per supported trial', report.falseSuccess.perSupportedTrial),
    line('Per PASS execution', report.falseSuccess.perPassExecution),
    '', '## Latency',
    `- Stated concurrency: ${val(report.latency.concurrency)}`,
    lat('Compile to candidate', report.latency.compileToCandidate),
    lat('Inference (backend-reported)', report.latency.inference),
    lat('End to end', report.latency.endToEnd),
    '', '## Token and transport budgets',
    `- Token denominator: ${report.budgets.tokens.definition}`,
    tot('Input tokens', report.budgets.tokens.input), tot('Output tokens', report.budgets.tokens.output),
    tot('Thinking tokens', report.budgets.tokens.thinking), tot('Observed transport attempts', report.budgets.transport.observedAttempts),
    `- Reserved transport calls: ${val(report.budgets.transport.reservedCalls)} of ceiling ${val(report.budgets.transport.maxTransportCalls)}`,
    `- API calls: ${val(report.budgets.transport.apiCalls)} of ceiling ${val(report.budgets.transport.maxApiCalls)}`,
    `- Elapsed: ${val(report.budgets.transport.elapsedMs)} ms of ceiling ${val(report.budgets.transport.maxElapsedMs)} ms; stopped by: ${val(report.budgets.transport.stoppedBy)}`,
    `- Cost: ${report.budgets.cost}`,
    '', '## Repairs',
    line('Entered repair', report.repairs.enteredRepair),
    `- Repair telemetry missing for ${report.repairs.repairTelemetryMissing} planned trials`,
    line('Repair yield', report.repairs.repairYield),
    tot('Total repairs', report.repairs.totalRepairs), tot('Total proposals', report.repairs.totalProposals),
    `- Regressions: ${report.repairs.regressions}`,
    '', '## Capacity and recovery',
    ...(report.capacity === UNAVAILABLE ? [`- ${UNAVAILABLE}`] : [
      `- Admissions offered ${report.capacity.admissionsOffered}, accepted ${report.capacity.admissionsAccepted}, refused ${report.capacity.admissionsRefused}`,
      line('Refusal rate', report.capacity.refusalRate),
      `${line('Recovered after refusal', report.capacity.recovery)}; p50 ${ms(report.capacity.recovery.p50Ms)}, max ${ms(report.capacity.recovery.maxMs)}`,
      `- Cancellation outcomes: ${JSON.stringify(report.capacity.cancellationOutcomes)}`,
      `- Post-deadline calls: ${report.capacity.postDeadlineCalls}; deadline slot recovery: ${report.capacity.deadlineSlotRecovery}`]),
    '', '## By requested mode',
    ...Object.entries(report.byRequestedMode).flatMap(([mode, m]) => [
      `### ${mode} (${m.plannedTrials} planned)`,
      line('Behavioral correctness', m.correctness.behavioralCorrectness),
      line('Supported coverage', m.coverage.supportedCoverage),
      line('False success per PASS execution', m.falseSuccess.perPassExecution),
      lat('Compile to candidate', m.latency.compileToCandidate)]),
    '',
  ];
  return out.join('\n');
}
