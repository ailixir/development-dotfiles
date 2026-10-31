/**
 * SC008-E7: the one shared step-code fixture helper of the studio-runner tests. Documents that used to be built from typed operations
 * (click, fill, read, ...) are built from a step: a record {kind:'step', code, captures, uses, sourceHash}.
 */
import { hashObserved, OBSERVED_PROFILE } from '../../src/validator/observedReferencePolicy.js';
import type { ObservedAdapter, StepOutcome } from '../../src/run/observedReplayAdapter.js';
import type { Artifact3, BuildIdentity, Execute3, Launch3, ObservedJob, ReplayAction, Scope, StepReceipt } from '../../src/executor/observedOperations.js';

export type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
export type StepOperation = Mutable<ReplayAction['operation']>;
export type StepUse = StepOperation['uses'][number];

/** The step operation record for `code`; sourceHash is the hash of the code, as the publisher computes it. */
export function stepOp(code: string, parts: { captures?: string[]; uses?: StepUse[] } = {}): StepOperation {
  return { kind: 'step', code, captures: parts.captures ?? [], uses: parts.uses ?? [], sourceHash: hashObserved(code) };
}

/** A step receipt; the default is a passing step that crossed no fence. */
export function stepReceipt(over: Partial<StepReceipt> = {}): StepReceipt {
  return { closedCode: null, stepHash: '0'.repeat(64), fenceCrossed: false, effects: [], effectsTruncated: false, offscreen: false, ...over };
}

export interface StepDocument { artifact: Mutable<Artifact3>; execute: Mutable<Execute3>; launch: Mutable<Launch3> }

/**
 * Puts a step into step `stepIndex` (its first operation) of a complete {artifact, execute, launch} document and reseals the hashes that
 * commit to it: operationHash, learnedPlanHash, replayPolicy, artifactHash and the launch admission request. `uses` secrets need the
 * caller to add the matching input recipe and execute input.
 */
export function withStep(doc: StepDocument, stepIndex: number, code: string, parts: { captures?: string[]; uses?: StepUse[] } = {}): StepDocument {
  const { artifact, execute, launch } = doc;
  const step = artifact.steps[stepIndex], slot = step?.operations[0];
  if (!step || !slot) throw new Error('STEP_SLOT');
  const operation = stepOp(code, parts);
  slot.operation = operation;
  const action = artifact.learnedPlan.actions.find(a => a.coordinate.stepId === slot.coordinate.stepId && a.coordinate.ordinal === slot.coordinate.ordinal);
  if (!action) throw new Error('STEP_ACTION');
  action.operation = operation;
  action.operationHash = hashObserved({ coordinate: action.coordinate, origin: action.origin, operation });
  artifact.learnedPlanHash = hashObserved(artifact.learnedPlan);
  artifact.replayPolicy.learnedPlanHash = artifact.learnedPlanHash;
  Object.assign(launch.admission.request, { artifactHash: hashObserved(artifact), learnedPlanHash: artifact.learnedPlanHash, referencePolicyHash: hashObserved(artifact.replayPolicy) });
  execute.steps = structuredClone(artifact.steps);
  execute.guards = structuredClone(artifact.guards);
  return doc;
}

export const CONTROL_WINDOW_CANARY = 'control-window-unit-only';
const controlWindowStepId = (index: number): string => '00000000-0000-4000-8000-' + String(301 + index).padStart(12, '0');
/**
 * A four-step login job built from step code (navigate, two secret fills, one click) on top of the sealed fixture job, rehashed end to end.
 * The server tests that need a replay job with secrets share it.
 */
export function controlWindowJob(base: ObservedJob, origin: string, build: BuildIdentity, timeoutSeconds = 10): { job: ObservedJob } {
  const job = structuredClone(base);
  const scope: Scope = { ...job.binding.scope, initialContext: { kind: 'initialBlank' } };
  const configuration = { ...job.configuration, timeoutSeconds, waitStrategy: 'domcontentloaded' as const, viewport: { width: 800, height: 600 } };
  const inputRecipes: Artifact3['inputRecipes'] = [
    { inputId: 'nav', stepId: controlWindowStepId(0), kind: 'destination', provenance: { kind: 'sourceSpan', start: 0, end: 1, sourceHash: job.artifact.sourceHash } },
    ...(['PASS', 'NEXT'] as const).map((referenceName, index) => ({ inputId: referenceName.toLowerCase(), stepId: controlWindowStepId(index + 1), kind: 'secretRef' as const, provenance: { kind: 'configuration' as const, referenceId: 'reference-' + referenceName, referenceName } })),
  ];
  const code = [
    stepOp('await page.goto(inputs["nav"]);', { uses: [{ kind: 'input', id: 'nav' }] }),
    stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] }),
    stepOp('await page.locator(\'input[type="password"]\').fill(secrets["NEXT"]);', { uses: [{ kind: 'secret', id: 'NEXT' }] }),
    stepOp('await page.getByRole("button", { name: "Continue", exact: true }).click();'),
  ];
  const steps: Artifact3['steps'] = code.map((operation, index) => ({ stepIndex: index, stepId: controlWindowStepId(index), operations: [{ coordinate: { stepId: controlWindowStepId(index), ordinal: 0 }, guardId: 'g' + String(index), operation }] }));
  const guards: Artifact3['guards'] = [{ guardId: 'g0', origin: null }, { guardId: 'g1', origin }, { guardId: 'g2', origin }, { guardId: 'g3', origin }];
  const { principalId, ...requirements } = scope;
  const actions = steps.flatMap(step => step.operations.map(action => {
    const guard = guards.find(g => g.guardId === action.guardId);
    if (!guard) throw Error('GUARD');
    const projection = { coordinate: action.coordinate, origin: guard.origin, operation: action.operation };
    return { ...projection, admissionId: 'control-admission-' + String(step.stepIndex), operationHash: hashObserved(projection) };
  })) as unknown as Artifact3['learnedPlan']['actions'];
  const learnedPlan = { ...job.artifact.learnedPlan, sourceSteps: steps.map(s => s.stepId), actions, bindings: [] };
  const learnedPlanHash = hashObserved(learnedPlan), configurationHash = hashObserved(configuration);
  const artifact: Artifact3 = { ...job.artifact, configurationHash, learnedPlan, learnedPlanHash, inputRecipes, steps, guards, replayPolicy: { ...job.artifact.replayPolicy, learnedPlanHash, scope: requirements, inputs: inputRecipes, bindings: [], transfers: [] } };
  const now = Date.now(), scopeHash = hashObserved(scope);
  const binding = { ...job.binding, artifactHash: hashObserved(artifact), configurationHash, learnedPlanHash, referencePolicyHash: hashObserved(artifact.replayPolicy), publicationEvidenceHash: artifact.replayPolicy.publicationEvidenceHash, requiredBuild: build, requiredProfile: OBSERVED_PROFILE, scope, scopeHash, principalId, startedAt: new Date(now).toISOString(), replayGrant: { ...job.binding.replayGrant, scopeHash, profileHash: hashObserved(OBSERVED_PROFILE), buildHash: hashObserved(build), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString() } };
  return { job: { ...job, binding, artifact, configuration, inputs: [{ inputId: 'nav', value: origin + '/login' }], secrets: { PASS: CONTROL_WINDOW_CANARY, NEXT: CONTROL_WINDOW_CANARY + '-next' }, secretOrigins: { PASS: [origin], NEXT: [origin] }, runtime: { stepTimeoutMs: timeoutSeconds * 1000, totalRuntimeMs: 20000 }, recording: { width: 800, height: 600 } } };
}

/** What a scripted adapter answers for `action`: a step that ran, with the receipt of its operation (stepHash included). */
export function stepResult(action: Pick<ReplayAction, 'operation'>, captured: Record<string, string> = {}, receipt: Partial<StepReceipt> = {}): StepOutcome {
  return { receipt: stepReceipt({ stepHash: hashObserved(action.operation), fenceCrossed: true, effects: [{ method: 'click', completed: receipt.closedCode == null }], ...receipt }), captured, fenceReached: false };
}

/** An adapter for the executor tests: `perform` is scripted, every withheld or committed value lands in `withheld`. */
export function scriptedAdapter(perform: ObservedAdapter['perform'], withheld: string[] = []): ObservedAdapter {
  return { perform, withhold: value => { withheld.push(value); return Promise.resolve(); }, commitCapture: value => { withheld.push(value); }, dispose: () => Promise.resolve() };
}
