/**
 * STUDIO-OBS-009 AC-11 f-i (lane R1, T0 ruling A12): the control-window self-stop.
 *
 * Two things live here because they share one secret-bearing run and one fake control clock:
 *
 * - i  (R10-OBS-2): the `run.cancel_requested` line of a `control-window` stop names which of the four branches fired
 *      (`noRequestBudget`, `noTimerBudget`, `windowPassed`, `invalidControlBody`) and carries the integers
 *      `latenessMs` and `durationMs`. Nothing else: no value, no URL, no text. No window, deadline, TTL or margin moves.
 * - f-h (R10c / R8-OBS-1): after Ready, a self-stop the API never recorded reports outer `RUN_ERROR` with
 *      `errorMessage CANCELLED` and the interrupted step as `SKIPPED` with `STOPPED_STEP_MESSAGE`, never outer
 *      `CANCELLED`. A stop the API did record (a DELETE, a control or progress acknowledgement carrying
 *      `cancelRequested` or `revoked`) stays outer `CANCELLED`, and a recorded revocation whose control read was lost
 *      is the mandatory regression: the fact arrives on a progress acknowledgement after the self-stop and upgrades it.
 *
 * Pre-Ready shapes (012A R8) are `observedReplayAdmission.test.ts`'s and are not repeated here.
 *
 * The secret-bearing job builder below is `observedReplayAdmission.test.ts`'s `controlWindowJob`, copied because that
 * file does not export it and is outside this lane's write set.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Artifact3, BuildIdentity, ObservedJob, Scope, TrustedPolicy } from '../../src/executor/observedOperations.js';
import type { HttpOutcome } from '../../src/reporting/httpClient.js';
import { ObservedPreReadyFailure } from '../../src/run/errors.js';
import { CANCELLED_MESSAGE } from '../../src/run/launcher.js';
import type { BrowserLauncher, ScratchStore } from '../../src/server/adapters.js';
import { createApplication } from '../../src/server/application.js';
import { loadConfig } from '../../src/server/config.js';
import { createRecordingLogSink } from '../../src/server/logging.js';
import { CONTROL_WINDOW_MARGIN_MS, STOPPED_STEP_MESSAGE } from '../../src/server/runCoordinator.js';
import { createFsScratchStore } from '../../src/server/scratch.js';
import { hashObserved, OBSERVED_PROFILE, OBSERVED_SCHEMA_BUNDLE_HASH } from '../../src/validator/observedReferencePolicy.js';
import { createChildDriver } from '../helpers/childDriver.js';
import type { ChildDriver } from '../helpers/childDriver.js';
import { until } from '../helpers/harness.js';
import { testListener as listener } from '../helpers/guidedTls.js';
import { publicationFixture as fixture } from '../helpers/publicationFixture.js';
import { createFakeScratchStore } from '../helpers/runner.js';
import { createFakeScheduler } from '../helpers/scheduler.js';

const currentBuild = { ...fixture.build, schemaBundleHash: OBSERVED_SCHEMA_BUNDLE_HASH };

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing controlled fixture value');
  return value;
}

const CONTROL_WINDOW_CANARY='control-window-unit-only';
const controlWindowStepId=(index:number)=>'00000000-0000-4000-8000-'+String(301+index).padStart(12,'0');
function controlWindowJob(origin:string,build:BuildIdentity,timeoutSeconds=10):{job:ObservedJob;policy:TrustedPolicy}{
  const job=structuredClone(fixture.job) as ObservedJob;
  const scope:Scope={...job.binding.scope,allowedOrigins:[origin],policyVersion:'observed-4-full-chromium-1',initialContext:{kind:'initialBlank'}};
  const policy:TrustedPolicy={...fixture.trustedPolicy as TrustedPolicy,allowedOrigins:[origin],policyVersion:scope.policyVersion,rules:[],applicationPolicy:{policyRuleId:'structural',allowStructuralDiscovery:true,readGrants:[]}};
  const configuration={...job.configuration,timeoutSeconds,waitStrategy:'domcontentloaded' as const,viewport:{width:800,height:600}};
  const inputRecipes:Artifact3['inputRecipes']=[{inputId:'nav',stepId:controlWindowStepId(0),kind:'destination',intendedSlot:'navigate.destination',provenance:{kind:'sourceSpan',start:0,end:1,sourceHash:job.artifact.sourceHash}},...(['PASS','NEXT'] as const).map((referenceName,index)=>({inputId:referenceName.toLowerCase(),stepId:controlWindowStepId(index+1),kind:'secretRef' as const,intendedSlot:'fill.value' as const,provenance:{kind:'configuration' as const,referenceId:'reference-'+referenceName,referenceName}}))];
  const steps:Artifact3['steps']=[{stepIndex:0,stepId:controlWindowStepId(0),operations:[{coordinate:{stepId:controlWindowStepId(0),ordinal:0},guardId:'g0',operation:{kind:'navigate',destinationInputId:'nav'}}]},...(['pass','next'] as const).map((input,index)=>({stepIndex:index+1,stepId:controlWindowStepId(index+1),operations:[{coordinate:{stepId:controlWindowStepId(index+1),ordinal:0},guardId:'g'+String(index+1),operation:{kind:'fill' as const,value:{kind:'secretRef' as const,sourceInputId:input}}}]})),{stepIndex:3,stepId:controlWindowStepId(3),operations:[{coordinate:{stepId:controlWindowStepId(3),ordinal:0},guardId:'g3',operation:{kind:'click'}}]}];
  const guards:Artifact3['guards']=[{guardId:'g0',origin:null,target:{kind:'initialBlank'}},{guardId:'g1',origin,target:{kind:'passwordControl'}},{guardId:'g2',origin,target:{kind:'passwordControl'}},{guardId:'g3',origin,target:{kind:'element',locator:{kind:'role',role:'button',name:'Continue',exact:true},role:'button',elementType:'button',controlType:'none',classification:'structuralOnly',visible:true,actionable:true,readRuleId:null}}];
  const {principalId,...requirements}=scope;
  const actions:Artifact3['learnedPlan']['actions']=steps.flatMap(step=>step.operations.map(action=>{
    const guard=guards.find(g=>g.guardId===action.guardId);if(!guard)throw Error('GUARD');
    if(guard.origin===null){
      if(action.operation.kind!=='navigate'||action.coordinate.ordinal!==0)throw Error('BLANK_ACTION');
      const projection={coordinate:{stepId:action.coordinate.stepId,ordinal:0 as const},origin:null,locator:null,operation:action.operation};
      return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
    }
    const projection={coordinate:action.coordinate,origin:guard.origin,locator:guard.target.kind==='element'?guard.target.locator:null,operation:action.operation};
    return {...projection,admissionId:'control-admission-'+String(step.stepIndex),operationHash:hashObserved(projection)};
  }));
  const learnedPlan={...job.artifact.learnedPlan,sourceSteps:steps.map(s=>s.stepId),actions,bindings:[]};
  const learnedPlanHash=hashObserved(learnedPlan),configurationHash=hashObserved(configuration);
  const artifact:Artifact3={...job.artifact,configurationHash,learnedPlan,learnedPlanHash,inputRecipes,steps,guards,replayPolicy:{...job.artifact.replayPolicy,learnedPlanHash,scope:requirements,inputs:inputRecipes,bindings:[],transfers:[]}};
  const now=Date.now(),scopeHash=hashObserved(scope),currentPolicyHash=hashObserved(policy);
  const binding={...job.binding,artifactHash:hashObserved(artifact),configurationHash,learnedPlanHash,referencePolicyHash:hashObserved(artifact.replayPolicy),publicationEvidenceHash:artifact.replayPolicy.publicationEvidenceHash,requiredBuild:build,requiredProfile:OBSERVED_PROFILE,scope,scopeHash,currentPolicyHash,principalId,startedAt:new Date(now).toISOString(),replayGrant:{...job.binding.replayGrant,scopeHash,currentPolicyHash,profileHash:hashObserved(OBSERVED_PROFILE),buildHash:hashObserved(build),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()}};
  return {policy,job:{...job,binding,artifact,configuration,inputs:[{inputId:'nav',value:origin+'/login'}],secrets:{PASS:CONTROL_WINDOW_CANARY,NEXT:CONTROL_WINDOW_CANARY+'-next'},secretOrigins:{PASS:[origin],NEXT:[origin]},runtime:{stepTimeoutMs:timeoutSeconds*1000,totalRuntimeMs:20000},recording:{width:800,height:600}}};
}


// ── The run under test ────────────────────────────────────────────────────────────────────────

type ControlAnswer = (read: number) => HttpOutcome | 'hang';

interface Backend {
  readonly controlReads: number;
  /** Every report body, in the order the runner sent them. */
  readonly reports: Record<string, unknown>[];
  /** From now on every report acknowledgement says `revoked:true`, as the API does once a revocation is recorded. */
  revokeRecorded: boolean;
}

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/**
 * One secret-bearing observed run over a fake control clock and a fake API. `launcher` is either a launch held
 * pre-Ready or the real launcher over a scripted child (post-Ready). `sendAdvancesMs` moves the clock inside the
 * control GET's own send, which is how the request-setup time `noTimerBudget` measures is modelled.
 */
function secretRun(options: { launcher: BrowserLauncher; scratch?: ScratchStore; control?: ControlAnswer; sendAdvancesMs?: number }) {
  const controlClock = createFakeScheduler();
  const { job, policy } = controlWindowJob('https://unit-control.test', currentBuild as BuildIdentity);
  const logs = createRecordingLogSink();
  const state = { lateness: 0 };
  const held: { resolve: (outcome: HttpOutcome) => void }[] = [];
  const backend: Backend = { controlReads: 0, reports: [], revokeRecorded: false };
  const control: ControlAnswer = options.control ?? ((): HttpOutcome => ({ kind: 'response', status: 200, body: JSON.stringify({ executionId: job.binding.executionId, cancelRequested: false, revoked: false }) }));
  const app = createApplication(loadConfig({ STUDIO_RUNNER_SERVICE_IDENTITY: 'service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'callback', STUDIO_RUNNER_CALLBACK_BASE_URL: 'https://backend.test' }), {
    listener, runtimeVersions: {}, scratch: options.scratch ?? createFakeScratchStore(), logSink: logs,
    now: () => controlClock.now() + state.lateness, controlTimers: controlClock, launcher: options.launcher,
    observed: { build: currentBuild as BuildIdentity, policies: [policy], validationEnabled: true, replayEnabled: true },
    http: { send(request): Promise<HttpOutcome> {
      if (request.method === 'GET') {
        (backend as { controlReads: number }).controlReads += 1;
        state.lateness += options.sendAdvancesMs ?? 0;
        const answer = control(backend.controlReads);
        return answer === 'hang' ? new Promise<HttpOutcome>((resolve) => { held.push({ resolve }); }) : Promise.resolve(answer);
      }
      const body = JSON.parse(request.body) as Record<string, unknown>;
      if (request.url.endsWith('/observed-admission')) {
        const now = Date.now();
        return Promise.resolve({ kind: 'response', status: 200, body: JSON.stringify({ schemaVersion: 3, kind: 'observed', admissionId: body.admissionId, request: body, admittedAt: new Date(now).toISOString(), startDeadlineAt: new Date(now + 15000).toISOString(), runDeadlineAt: new Date(now + 30000).toISOString() }) });
      }
      backend.reports.push(body);
      return Promise.resolve({ kind: 'response', status: 200, body: backend.revokeRecorded ? '{"cancelRequested":false,"revoked":true}' : '{}' });
    } },
  });
  const finals = (): Record<string, unknown>[] => backend.reports.filter((report) => report.kind === 'FINAL');
  return {
    app, controlClock, job, logs, backend, state, executionId: job.binding.executionId,
    submit: async (): Promise<void> => { expect(await required(app.coordinator.submitObserved?.bind(app.coordinator))(job)).toEqual({ status: 202, code: 'ADMITTED' }); },
    settle: async (): Promise<void> => { expect(await app.coordinator.awaitInFlight(5000)).toBe(true); expect(app.pool.inUse).toBe(0); },
    release: (outcome: HttpOutcome): void => { for (const one of held.splice(0)) one.resolve(outcome); },
    final: (): Record<string, unknown> => { expect(finals()).toHaveLength(1); return required(finals()[0]); },
  };
}

/** A launch held until the run stops it, rejecting the way the real launcher does when it is aborted. */
function heldLaunch(): { launcher: BrowserLauncher; launches: () => number; aborts: () => number } {
  let launches = 0, aborts = 0;
  return {
    launches: () => launches, aborts: () => aborts,
    launcher: { launch(request) {
      launches += 1;
      return new Promise<never>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => { aborts += 1; reject(new ObservedPreReadyFailure('CANCELLED', { path: null, bytes: null, error: null, state: 'UNAVAILABLE', partial: false })); }, { once: true });
      });
    } },
  };
}

function cancelEvents(logs: { readonly lines: readonly string[] }): Record<string, unknown>[] {
  return logs.lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === 'run.cancel_requested');
}

// ── i: which branch fired ─────────────────────────────────────────────────────────────────────

describe('AC-11 i (R10-OBS-2): a control-window self-stop says which branch fired, with integers only', () => {
  const ALLOWED_KEYS = ['ts', 'level', 'event', 'executionId', 'source', 'recorded', 'branch', 'latenessMs', 'durationMs'];

  async function selfStop(mode: 'noRequestBudget' | 'noTimerBudget' | 'windowPassed' | 'invalidControlBody' | 'nonOkStatus') {
    const held = heldLaunch();
    const run = secretRun({
      launcher: held.launcher,
      ...(mode === 'noTimerBudget' ? { sendAdvancesMs: 1000 } : {}),
      control: (): HttpOutcome | 'hang' => mode === 'windowPassed' ? 'hang'
        : mode === 'nonOkStatus' ? { kind: 'response', status: 503, body: '' }
        : mode === 'invalidControlBody' ? { kind: 'response', status: 200, body: JSON.stringify({ executionId: 'someone-else', cancelRequested: false, revoked: false }) }
        : { kind: 'response', status: 200, body: JSON.stringify({ executionId: OBSERVED_EXECUTION(), cancelRequested: false, revoked: false }) },
    });
    await run.submit();
    await until(() => held.launches() === 1);
    expect(run.controlClock.pending()).toEqual([1000]);
    // The first secret window is [1000, 2000 - CONTROL_WINDOW_MARGIN_MS). A tick that fires a whole window late never asks.
    if (mode === 'noRequestBudget') run.state.lateness = 1000;
    run.controlClock.advance(1000);
    if (mode === 'windowPassed') {
      await until(() => run.backend.controlReads === 1);
      run.controlClock.skip(1000 - CONTROL_WINDOW_MARGIN_MS);
      run.release({ kind: 'response', status: 200, body: JSON.stringify({ executionId: run.executionId, cancelRequested: false, revoked: false }) });
    }
    await until(() => held.aborts() === 1);
    await run.settle();
    return { run, events: cancelEvents(run.logs) };
  }

  const cases = [
    { mode: 'noRequestBudget' as const, lateness: 1000, duration: 0, reads: 0 },
    { mode: 'noTimerBudget' as const, lateness: 0, duration: 1000, reads: 1 },
    { mode: 'windowPassed' as const, lateness: 0, duration: 975, reads: 1 },
    { mode: 'invalidControlBody' as const, lateness: 0, duration: 0, reads: 1 },
    { mode: 'nonOkStatus' as const, lateness: 0, duration: 0, reads: 1 },
  ];
  for (const one of cases) {
    it(`${one.mode}: one line, closed branch label, lateness ${String(one.lateness)} ms, duration ${String(one.duration)} ms`, async () => {
      const { run, events } = await selfStop(one.mode);
      expect(run.backend.controlReads).toBe(one.reads);
      expect(events).toHaveLength(1);
      const [line] = events;
      const label = one.mode === 'nonOkStatus' ? 'invalidControlBody' : one.mode;
      expect(line).toMatchObject({ source: 'control-window', recorded: false, branch: label, latenessMs: one.lateness, durationMs: one.duration });
      // Value-free: a closed key set, integers for both numbers, and nothing of the secret or the page in the line or the log.
      expect(Object.keys(required(line)).every((key) => ALLOWED_KEYS.includes(key))).toBe(true);
      expect(Number.isInteger(line?.latenessMs)).toBe(true);
      expect(Number.isInteger(line?.durationMs)).toBe(true);
      expect(run.logs.lines.join('\n')).not.toContain(CONTROL_WINDOW_CANARY);
    });
  }

  it('does not add the attribution to a stop the API recorded', async () => {
    const held = heldLaunch();
    const run = secretRun({ launcher: held.launcher, control: () => ({ kind: 'response', status: 200, body: JSON.stringify({ executionId: OBSERVED_EXECUTION(), cancelRequested: true, revoked: false }) }) });
    await run.submit();
    await until(() => held.launches() === 1);
    run.controlClock.advance(1000);
    await until(() => held.aborts() === 1);
    await run.settle();
    const events = cancelEvents(run.logs);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'control', recorded: true });
    expect(events[0]).not.toHaveProperty('branch');
    expect(events[0]).not.toHaveProperty('latenessMs');
    expect(events[0]).not.toHaveProperty('durationMs');
  });
});

// ── f-h: after Ready ──────────────────────────────────────────────────────────────────────────

describe('AC-11 f-h (R10c, ruling A12): a post-Ready stop is outer CANCELLED only when the API recorded it', () => {
  /** The real launcher over a scripted child that hangs in step 0, so the run is past Ready when the control tick fires. */
  async function running(onStop: 'flush' | 'ignore', control?: ControlAnswer) {
    const driver: ChildDriver = createChildDriver({ hangOnStep: 0, onStop }, { stopTimeoutMs: 40, launchTimeoutMs: 5000 });
    const root = mkdtempSync(join(tmpdir(), 'studio-runner-r10c-'));
    roots.push(root);
    const run = secretRun({ launcher: driver.launcher, scratch: createFsScratchStore(root), ...(control ? { control } : {}) });
    await run.submit();
    await until(() => driver.spawner.children.length > 0 && driver.child().sent.some((message) => message.kind === 'execute'), 20_000);
    return { run, driver };
  }
  const lost: ControlAnswer = () => ({ kind: 'timeout' });
  const sourceCount = (run: { job: ObservedJob }): number => run.job.artifact.steps.length;

  function expectInterruptedAsStopped(final: Record<string, unknown>, count: number): void {
    const steps = final.steps as Record<string, unknown>[];
    expect(steps).toHaveLength(count);
    // The step the stop interrupted: SKIPPED, the start reading it has, no finish, the fixed text and never the child's own code.
    expect(steps[0]).toMatchObject({ stepIndex: 0, status: 'SKIPPED', finishedAtMs: null, durationMs: null, failure: STOPPED_STEP_MESSAGE });
    expect((steps[0] as { startedAtMs: unknown }).startedAtMs).not.toBeNull();
    for (const step of steps.slice(1)) expect(step).toMatchObject({ status: 'SKIPPED', startedAtMs: null, finishedAtMs: null, durationMs: null, failure: null });
    expect(JSON.stringify(steps)).not.toContain('"failure":"CANCELLED"');
  }

  it('f: a control read lost after Ready, child honours the stop: outer RUN_ERROR / CANCELLED, the interrupted step is the stop text', async () => {
    const { run, driver } = await running('flush', lost);
    run.controlClock.advance(1000);
    await run.settle();
    expect(driver.child().sent.map((message) => message.kind)).toContain('stop');
    const final = run.final();
    expect(final.browserStartedAt).not.toBeNull();
    expect(final.outcome).toMatchObject({ result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' });
    expect(final.outcome).not.toMatchObject({ errorMessage: CANCELLED_MESSAGE });
    expectInterruptedAsStopped(final, sourceCount(run));
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'control-window', recorded: false, branch: 'invalidControlBody' }]);
  });

  it('f: the same self-stop when the child ignores the stop and is killed after the grace: the same shape', async () => {
    const { run, driver } = await running('ignore', lost);
    run.controlClock.advance(1000);
    await until(() => driver.child().killed > 0, 20_000);
    await run.settle();
    const final = run.final();
    expect(final.outcome).toMatchObject({ result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' });
    // A killed child never reported the steps it did not reach, and the cancel's D1 rule leaves them out: the report is the interrupted step alone.
    expectInterruptedAsStopped(final, 1);
  });

  it('f: a missed window (the valid answer arrives after it closed) is the same shape', async () => {
    const { run } = await running('flush', () => 'hang');
    run.controlClock.advance(1000);
    await until(() => run.backend.controlReads === 1);
    run.controlClock.skip(1000 - CONTROL_WINDOW_MARGIN_MS);
    run.release({ kind: 'response', status: 200, body: JSON.stringify({ executionId: run.executionId, cancelRequested: false, revoked: false }) });
    await run.settle();
    expect(run.final().outcome).toMatchObject({ result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' });
    expect(cancelEvents(run.logs)).toMatchObject([{ branch: 'windowPassed', durationMs: 975 }]);
  });

  it('g: a valid control answer that arrives after its window closed still says the revocation is recorded, so the run keeps outer CANCELLED', async () => {
    const { run } = await running('flush', () => 'hang');
    run.controlClock.advance(1000);
    await until(() => run.backend.controlReads === 1);
    run.controlClock.skip(1000 - CONTROL_WINDOW_MARGIN_MS);
    run.release({ kind: 'response', status: 200, body: JSON.stringify({ executionId: run.executionId, cancelRequested: false, revoked: true }) });
    await run.settle();
    expect(run.final().outcome).toMatchObject({ result: 'ERROR', errorCode: 'CANCELLED' });
    // The stop was still the runner's own (the window had closed); the line says the fact was already recorded when it was ordered.
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'control-window', recorded: true, branch: 'windowPassed' }]);
  });

  it('g: a lost control body (truncated, so unreadable) carries no fact: the run is RUN_ERROR / CANCELLED until an acknowledgement says otherwise', async () => {
    const { run } = await running('flush', () => ({ kind: 'response', status: 200, body: '{' }));
    run.controlClock.advance(1000);
    await run.settle();
    expect(run.final().outcome).toMatchObject({ result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED' });
  });

  it('g: a DELETE recorded after the self-stop, before the run settles, upgrades it to outer CANCELLED with one stop', async () => {
    const { run, driver } = await running('ignore', lost);
    run.controlClock.advance(1000);
    await until(() => cancelEvents(run.logs).length === 1);
    expect(run.app.coordinator.cancel(run.executionId)).toEqual({ status: 202, code: 'CANCELLING' });
    await until(() => driver.child().killed > 0, 20_000);
    await run.settle();
    const final = run.final();
    expect(final.outcome).toMatchObject({ result: 'ERROR', errorCode: 'CANCELLED', errorMessage: CANCELLED_MESSAGE });
    expect(driver.child().sent.filter((message) => message.kind === 'stop')).toHaveLength(1);
    // The upgrade records the fact; it never orders a second stop and never writes a second line.
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'control-window', recorded: false }]);
  });

  it('g (mandatory regression): a recorded revocation whose control read is lost still ends outer CANCELLED, so the API names AUTHORIZATION_REVOKED', async () => {
    const { run, driver } = await running('flush', lost);
    // The API recorded the revocation; its answer to the control read never arrived. From here every acknowledgement says so.
    run.backend.revokeRecorded = true;
    run.controlClock.advance(1000);
    await run.settle();
    expect(driver.child().sent.map((message) => message.kind)).toContain('stop');
    const final = run.final();
    expect(final.outcome).toMatchObject({ result: 'ERROR', errorCode: 'CANCELLED' });
    // The self-stop is still what ordered the stop; the progress acknowledgement is what recorded the fact.
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'control-window', recorded: false }]);
  });

  it('g: a control answer that says revoked is a recorded stop at once, and stays outer CANCELLED', async () => {
    const { run } = await running('flush', () => ({ kind: 'response', status: 200, body: JSON.stringify({ executionId: OBSERVED_EXECUTION(), cancelRequested: false, revoked: true }) }));
    run.controlClock.advance(1000);
    await run.settle();
    expect(run.final().outcome).toMatchObject({ result: 'ERROR', errorCode: 'CANCELLED' });
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'control', recorded: true }]);
  });

  it('g: a recorded DELETE before any self-stop is unchanged: outer CANCELLED, today\'s shape', async () => {
    const { run } = await running('flush');
    expect(run.app.coordinator.cancel(run.executionId)).toEqual({ status: 202, code: 'CANCELLING' });
    await run.settle();
    expect(run.final().outcome).toMatchObject({ result: 'ERROR', errorCode: 'CANCELLED', errorMessage: CANCELLED_MESSAGE });
    expect(cancelEvents(run.logs)).toMatchObject([{ source: 'delete', recorded: true }]);
  });

  it('h: only an outer CANCELLED is rewritten: a drain kill keeps its own RUN_ERROR text, and no new error vocabulary appears', async () => {
    const { run } = await running('ignore');
    expect(cancelEvents(run.logs)).toEqual([]);
    run.app.coordinator.terminateInFlight();
    await run.settle();
    const outcome = run.final().outcome as Record<string, unknown>;
    expect(outcome).toMatchObject({ result: 'ERROR', errorCode: 'RUN_ERROR' });
    expect(outcome.errorMessage).not.toBe('CANCELLED');
  });
});

function OBSERVED_EXECUTION(): string { return fixture.job.binding.executionId; }
