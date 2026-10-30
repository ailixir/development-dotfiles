/**
 * The observation session of ADR-SC-007 WI-4 without Playwright (plan D-1, D-2, D-5, D-16). `browser.ts` composes it with the real
 * Page and CDP session; the unit tier drives it with fakes. Everything that observes, prepares, resolves or acts is here:
 *
 * - observe(): WI-2 `perceive` on an engine opened in a fresh isolated world `checks-observation-<uuid>`, the page-state program
 *   (`pageStateInPage.ts`) installed in the same world, ONE deadline raced over the whole call, the wire observation built from the
 *   perception, never an emptied observation.
 * - prepareTarget(): ref -> synthesize -> verify -> agree with the facts -> G1 / read eligibility -> ResolvedTarget, and the
 *   verified-element binding of D-16, all under the prepare budget.
 * - resolveTarget() / invoke(): the one resolver and the one executor of `targetAction.ts` through the public API.
 *
 * Every error that leaves is closed (closedError.ts): a ClosedActionError, or OriginNotAllowed (host only).
 */
import type { checkPublicSourceRelations } from './perceptionInPage.js';
import { randomUUID } from 'node:crypto';
import { domainAllowed } from '../allowedDomains.js';
import type { InvocationControl } from '../executor/observedReplay.js';
import { validate, hash } from '../guided/contracts.js';
import type { Observation, ObservationFact, ResolvedTarget } from '../guided/types.js';
import { ActionBudget, budgetFor, LEARN_PROFILE, PREPARE_BUDGET_MS, profileFor, REPLAY_PROFILE } from './actionBudget.js';
import { ClosedActionError, closeObservationError, closePlaywrightError, detachedObservationState, type ClosedActionCode } from './closedError.js';
import { synthesize, toEngineSelector, locatorValues, type Locator } from './locatorSynth.js';
import { createPasswordControl } from './passwordControl.js';
import type { PasswordWorldResult } from './passwordControl.js';
import { raceDeadline, unitsFor } from './observationDeadline.js';
import { timed } from './targetOptions.js';
import { observationOptions, exportObservation } from './observationSanitizer.js';
import { readRuleIdFor } from './observationReadProfile.js';
import type { ObservationConfig, ObservationExport, ObservationFocus, ObservationSession, InvocationIdentity, PrepareTargetRequest, ResolveTargetRequest, ResolveTargetResult, TargetInvocation, TargetInvocationResult } from './observationTypes.js';
import { installPageState } from './pageStateInPage.js';
import { perceive, type Perception } from './perceive.js';
import { backendIdsForSelector, replacedFocusedField, checkLiveOptions, openEngine, captureSourceOnEngine, sourceValue, sourceBackendNodeId, sourceSame, compareSource, disposeSource, checkPublicRelationsOnEngine, checkFrozenSourceContext, untrackedObservationChannel } from './playwrightEngine.js';
import type { CdpSession, PerceptionEngine } from './playwrightEngine.js';
import { PrivateInventory, mintCaptureOrigin, type CaptureOrigin, type InventoryEntry } from './privateInventory.js';
import { shownRefsOf } from '../validator/outlineRefs.js';
import { assertPrepareProofAgrees, assertReadable, performOnTarget, resolveTarget, targetKey, type BoundElement, type PageLike } from './targetAction.js';

/** An observation is kept only if the page stayed unchanged this long after it was taken (else it is taken again, a bounded number of times). */
export { shownRefsOf };
export const OBSERVATION_QUIET_MS = 400;
export const OBSERVATION_ATTEMPTS = 8;
/** One resolveTarget() call (replay poll or prefix preparation): count plus at most one identity snapshot. */
export const RESOLVE_BUDGET_MS = 5_000;
/** The probe that tells an engine that still answers from one that does not. */
const PROBE_MS = 1_000;

export interface FlowCdp extends CdpSession {
  detach?(): Promise<void>;
}

/** The Playwright side of the session, supplied by browser.ts (and faked by the unit tier). */
export interface FlowHost {
  readonly page: PageLike;
  /** A new CDP session on the page. */
  newCdp(): Promise<FlowCdp>;
  /** Exact captured handle identity, local to the current page/main frame/context. */
  inspectBoundElement(bound: BoundElement): Promise<number>;
  /** Registers a listener for every main-frame navigation; returns the unsubscribe. */
  onNavigation(listener: () => void): () => void;
  /** Waits (bounded) until the main frame is on a whitelisted host again; throws OriginNotAllowed when it is not. */
  awaitWhitelistedMainFrame(allowedDomains: readonly string[]): Promise<void>;
}

/** The WI-2 calls the flow makes. Replaceable only by the unit tier. */
export interface FlowEngine {
  openEngine: typeof openEngine;
  perceive: typeof perceive;
  synthesize: typeof synthesize;
  checkLiveOptions: typeof checkLiveOptions;
  backendIdsForSelector: typeof backendIdsForSelector;
  replacedFocusedField: typeof replacedFocusedField;
  checkPublicSources: (engine: PerceptionEngine, request: Parameters<typeof checkPublicSourceRelations>[0], entries: readonly InventoryEntry[]) => Promise<boolean>;
}
const WI2: FlowEngine = { openEngine, perceive, synthesize, checkLiveOptions, backendIdsForSelector, replacedFocusedField, checkPublicSources: checkPublicRelationsOnEngine };

interface Remote { result?: { value?: unknown; objectId?: string }; exceptionDetails?: { exception?: { description?: string } } }

interface Held {
  readonly generation: number;
  readonly documentId: string;
  readonly origin: string;
  readonly navigation: number;
  readonly perception: Perception;
  readonly readRuleId: string | null;
  readonly observation: Observation;
  readonly pageStateId: string;
}
/** D-16: the element verified at prepare. */
interface Binding { readonly backendNodeId: number; readonly documentId: string; readonly generation: number; readonly navigation: number }

const fail = (code: ClosedActionCode): ClosedActionError => new ClosedActionError(code);
const hasTableContext = (target: ResolvedTarget): boolean => (target.locator.length === 5 || target.locator.length === 6) && target.locator[0]?.by === 'tag' && target.locator[0].tag === 'table';

/** Races a promise against a short timer; a timeout is a rejection. */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(fail('OBSERVATION_UNAVAILABLE')); }, ms);
    work.then(
      value => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : fail('OBSERVATION_UNAVAILABLE')); },
    );
  });
}

/** The main document commits (or the wait ends): used around author-directed navigation. */
export function mainDocumentTransition(page: PageLike): Promise<boolean> {
  const main = page.mainFrame();
  return page.waitForEvent('framenavigated', { predicate: frame => frame === main, timeout: 30_000 })
    .then(() => page.waitForLoadState('domcontentloaded', { timeout: 30_000 }))
    .then(() => true, () => false);
}

export function createObservationFlow(host: FlowHost, config: ObservationConfig, engines: Partial<FlowEngine> = {}, clock: () => number = Date.now): ObservationSession {
  const options = observationOptions(config);
  const wi2: FlowEngine = { ...WI2, ...engines };
  const page = host.page;
  const inventory = new PrivateInventory();
  const knownSecrets = [...options.knownSecrets];
  let cdp: FlowCdp | null = null;
  let rawCdp: FlowCdp | null = null;
  let closed = false;
  const isDisposed = (): boolean => closed;
  let busy = false;
  let navigation = 0;
  let generation = 0;
  let documentId = '';
  let held: Held | null = null;
  let deadlineLatched = false;
  const bindings = new Map<string, Binding>();
  interface Capture {
    sourceId: string; engine: PerceptionEngine; origin: CaptureOrigin | null; navigation: number; resolved: ResolvedTarget;
    identity: InvocationIdentity | undefined; preparationId: string | undefined; committed: boolean;
    value: string;
  }
  const captures = new Map<string, Capture>();
  const clearCaptures = (): void => { for (const capture of captures.values()) void disposeSource(capture.engine, capture.sourceId); captures.clear(); };
  interface Continuity { identity: InvocationIdentity; binding: Binding }
  let pendingContinuity: Continuity | null = null;
  let committedContinuity: Continuity | null = null;
  const clearContinuity = (): void => { pendingContinuity = null; committedContinuity = null; };

  const unsubscribe = host.onNavigation(() => { navigation++; clearContinuity(); clearCaptures(); });

  const assertOpen = (): void => { if (closed) throw fail('CONTEXT_LOST'); };
  const channel = async (): Promise<FlowCdp> => {
    if (!cdp) { rawCdp = await host.newCdp(); cdp = untrackedObservationChannel(rawCdp); }
    return cdp;
  };
  const send = async (method: string, params?: object): Promise<Remote> => (await (await channel()).send(method, params)) as Remote;
  const hostnameOf = (origin: string): string => { try { return new URL(origin).hostname; } catch { return ''; } };
  const heldIsLive = (candidate: Held | null): candidate is Held => candidate !== null && !closed && !busy && candidate.navigation === navigation;

  /** Releases a held observation's page-state object and engine. Best effort: a dead channel is not an error here. */
  const release = async (target: { pageStateId: string | null; engine: PerceptionEngine | null }): Promise<void> => {
    const channelNow = cdp;
    if (channelNow === null) return;
    if (target.pageStateId !== null) {
      await channelNow.send('Runtime.callFunctionOn', { objectId: target.pageStateId, functionDeclaration: 'function() { this.dispose(); }' }).catch(() => undefined);
      await channelNow.send('Runtime.releaseObject', { objectId: target.pageStateId }).catch(() => undefined);
    }
    if (target.engine !== null) await channelNow.send('Runtime.releaseObject', { objectId: target.engine.objectId }).catch(() => undefined);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // observe()

  async function observeOnce(maxBytes: number, settle: boolean, focus: ObservationFocus | undefined, deadlineAt: number, attempt: { engine: PerceptionEngine | null; pageStateId: string | null; expired: boolean }): Promise<ObservationExport> {
    const checkpoint = (): void => { if (attempt.expired) throw fail('OBSERVATION_DEADLINE'); assertOpen(); };
    checkpoint();
    const before = navigation;
    const channelNow = await channel();
    const world = `checks-observation-${randomUUID()}`;
    const engine = await wi2.openEngine(channelNow, { worldName: world });
    attempt.engine = engine;
    checkpoint();
    const installed = await send('Runtime.callFunctionOn', { executionContextId: engine.worldId, functionDeclaration: installPageState.toString(), arguments: [{ value: { allowedDomains: [...options.allowedDomains] } }], returnByValue: false, objectGroup: world });
    const pageStateId = installed.result?.objectId;
    if (installed.exceptionDetails !== undefined || typeof pageStateId !== 'string') throw fail('OBSERVATION_UNAVAILABLE');
    attempt.pageStateId = pageStateId;
    checkpoint();
    // Navigation remains the stale-binding fence, including hash changes. Document identity instead follows
    // the previous isolated handle's immutable root; a replaced document can also arrive without a navigation event.
    const sameDocument = async (stateId: string): Promise<boolean> => {
      let response: Remote;
      try {
        response = await send('Runtime.callFunctionOn', { objectId: stateId, functionDeclaration: 'function() { return this.sameDocument(); }', returnByValue: true });
      } catch (error) {
        checkpoint();
        if (detachedObservationState(error)) return false;
        throw fail('OBSERVATION_UNAVAILABLE');
      }
      checkpoint();
      if (response.exceptionDetails !== undefined || typeof response.result?.value !== 'boolean') throw fail('OBSERVATION_UNAVAILABLE');
      return response.result.value;
    };
    const previous = held;
    const candidateDocumentId = previous !== null && await sameDocument(previous.pageStateId) ? documentId : randomUUID();
    const pageStateCall = async (declaration: string, args: readonly unknown[], awaitPromise = false): Promise<Remote> => {
      const response = await send('Runtime.callFunctionOn', { objectId: pageStateId, functionDeclaration: declaration, arguments: args.map(value => ({ value })), returnByValue: true, awaitPromise });
      checkpoint();
      return response;
    };
    let perception: Perception | null = null;
    let stampedGeneration = 0;
    let mark = 0;
    const take = async (): Promise<void> => {
      const revision = await pageStateCall('function() { return this.revision(); }', []);
      if (revision.exceptionDetails !== undefined || typeof revision.result?.value !== 'number') throw fail('OBSERVATION_UNAVAILABLE');
      mark = revision.result.value;
      stampedGeneration = ++generation;
      perception = await wi2.perceive({
        cdp: channelNow, engine, inventory, privateValues: [...knownSecrets], maxBytes: options.limits.outlineBytes, workBudgetUnits: unitsFor(deadlineAt - clock()),
        ...(focus !== undefined ? { stepText: focus.stepText, targetIntents: focus.targetIntents } : {}),
      });
      checkpoint();
      const stamped = await pageStateCall('function(documentId, generation, revision) { this.stamp(documentId, generation, revision); }', [candidateDocumentId, stampedGeneration, mark]);
      if (stamped.exceptionDetails !== undefined) throw fail('OBSERVATION_UNAVAILABLE');
    };
    await take();
    // A page that is still changing (autocomplete after typing, late scripts) would invalidate this observation before its first use:
    // take it again once the page has been quiet, a bounded number of times.
    for (let round = 1; settle && round < OBSERVATION_ATTEMPTS; round++) {
      const quiet = await pageStateCall('function(quietMs, since) { return this.stable(quietMs, since); }', [OBSERVATION_QUIET_MS, mark], true);
      if (quiet.exceptionDetails !== undefined || quiet.result?.value === true) break;
      await take();
    }
    if (before !== navigation) throw fail('STALE_OBSERVATION');
    const taken = perception as Perception | null;
    if (taken === null) throw fail('OBSERVATION_UNAVAILABLE');
    if (!domainAllowed(options.allowedDomains, taken.origin)) throw fail('SCOPE_DENIED');
    const counted = await pageStateCall('function() { return this.passwordCount(); }', []);
    if (counted.exceptionDetails !== undefined || typeof counted.result?.value !== 'number') throw fail('OBSERVATION_UNAVAILABLE');
    if (previous !== null) await release({ pageStateId: previous.pageStateId, engine: previous.perception.engine });
    // No asynchronous work remains between this root check and committing the held observation. stamp cannot rebase its witness.
    if (!await sameDocument(pageStateId)) throw fail('STALE_OBSERVATION');
    if (before !== navigation) throw fail('STALE_OBSERVATION');
    const counters = taken.counters;
    const facts: Record<string, ObservationFact> = {};
    for (const [ref, fact] of Object.entries(taken.facts)) {
      facts[ref] = { ...fact, evidenceSegments: (taken.evidenceSegments[ref] ?? []).map(segment => ({ ...segment })) };
    }
    const readRuleId = readRuleIdFor(options.readProfile, hostnameOf(taken.origin));
    const observation: Observation = {
      schemaVersion: 3, sessionId: options.sessionId, documentId: candidateDocumentId, generation: stampedGeneration, origin: taken.origin, scopeHash: options.scopeHash, observedAt: new Date().toISOString(),
      coverage: { withheldRegions: counters.withheldPrivate + counters.withheldSensitive + counters.splitWithheld, unsupportedRegions: counters.unsupported, passwordControls: counted.result.value },
      projection: { projected: taken.outline.projected, tier: taken.outline.projectionTier, totalNodes: taken.outline.totalNodes, shownNodes: taken.outline.shownNodes, notShown: taken.outline.notShown, outlineBytes: taken.outline.text === '' ? Buffer.byteLength('- document', 'utf8') : taken.outline.bytes },
      // An empty page has no outline line, and the contract wants one: the document root is the line a populated page starts with too.
      readRuleId, outline: taken.outline.text === '' ? '- document' : taken.outline.text, facts,
    };
    validate('observation', observation);
    const shown = shownRefsOf(observation.outline), keys = Object.keys(facts);
    if (shown.size !== keys.length || keys.some(key => !shown.has(key))) throw fail('OBSERVATION_UNAVAILABLE');
    const exported = exportObservation(observation, maxBytes);
    checkpoint();
    documentId = candidateDocumentId;
    held = { generation: stampedGeneration, documentId, origin: taken.origin, navigation: before, perception: taken, readRuleId, observation: exported.observation, pageStateId };
    bindings.clear();
    attempt.engine = null;
    attempt.pageStateId = null;
    return exported;
  }

  /** PERCEPTION_UNAVAILABLE is the deadline refusal only when the engine still answers and the inventory is live (probe p5); a dead channel is unavailability. */
  async function engineStillAnswers(engine: PerceptionEngine | null): Promise<boolean> {
    if (engine === null) return false;
    try {
      inventory.assertLive();
      const probe = (await within((await channel()).send('Runtime.callFunctionOn', { objectId: engine.objectId, functionDeclaration: 'function() { return true; }', returnByValue: true }), PROBE_MS)) as Remote;
      return probe.exceptionDetails === undefined && probe.result?.value === true;
    } catch {
      return false;
    }
  }

  async function observe(maxBytes: number = options.limits.bytes, settle = false, focus?: ObservationFocus, deadlineMs?: number): Promise<ObservationExport> {
    pendingContinuity = null; // An uncommitted outcome can never be promoted after a refresh.
    if (closed || busy) throw fail('STALE_OBSERVATION');
    // A session whose observation ended at the deadline answers the same refusal again (the backend pulls the observation once more after a
    // post-dispatch attempt ran out of time): the failed inventory would otherwise report CONTEXT_LOST for what is still a heavy page.
    if (deadlineLatched) throw fail('OBSERVATION_DEADLINE');
    try { inventory.assertLive(); } catch { throw fail('CONTEXT_LOST'); }
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > options.limits.bytes || generation >= 2_147_483_647) throw fail('BUDGET_EXCEEDED');
    busy = true;
    const generationBefore = generation;
    const attempt = { engine: null as PerceptionEngine | null, pageStateId: null as string | null, expired: false };
    try {
      // Off the whitelist (for example at an SSO provider): observe nothing until the page is back, or fail. This wait has its own bound
      // (RETURN_WINDOW_MS) and runs BEFORE the collection deadline starts: the backend maps ORIGIN_NOT_ALLOWED, so it must not turn into a deadline.
      await host.awaitWhitelistedMainFrame(options.allowedDomains);
    } catch (error) {
      inventory.fail();
      busy = false;
      throw closeObservationError(error).error;
    }
    const deadlineAt = clock() + Math.min(options.limits.milliseconds, deadlineMs !== undefined && Number.isFinite(deadlineMs) ? Math.max(1, Math.floor(deadlineMs)) : options.limits.milliseconds);
    try {
      return await raceDeadline(observeOnce(maxBytes, settle, focus, deadlineAt, attempt), deadlineAt, () => {
        attempt.expired = true;
        inventory.fail();
        void release(attempt);
      }, clock);
    } catch (error) {
      const closedError = closeObservationError(error);
      // A session disposed while this observation was pending ends it as the session's own loss, not as an unavailable page.
      const mapped = isDisposed() ? fail('CONTEXT_LOST') : closedError.perceptionUnavailable && await engineStillAnswers(attempt.engine) ? fail('OBSERVATION_DEADLINE') : closedError.error;
      inventory.fail();
      void release(attempt);
      // A failed observation consumes no generation: the backend's expectedGeneration keeps naming the last one that succeeded.
      generation = generationBefore;
      if (mapped instanceof ClosedActionError && mapped.code === 'OBSERVATION_DEADLINE') deadlineLatched = true;
      throw mapped;
    } finally {
      busy = false;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // prepare

  const checkSources = async (current: Held, ref: string): Promise<boolean> => {
    const fact = current.observation.facts[ref]; if (!fact) return false;
    const sources: Parameters<typeof checkPublicSourceRelations>[0]['sources'] = [];
    for (const sourceRef of fact.scopeRefs ?? []) { const source = current.observation.facts[sourceRef]; if (!source?.nameComplete) return false; sources.push({ ref: sourceRef, name: source.name, role: source.role, mode: 'scope' }); }
    if (fact.readScope) for (const sourceRef of fact.readScope.sourceRefs) { const source = current.observation.facts[sourceRef]; if (!source?.nameComplete) return false; sources.push({ ref: sourceRef, name: source.name, role: source.role, mode: fact.readScope.relation }); }
    return sources.length === 0 || await wi2.checkPublicSources(current.perception.engine, { ref, sources,
      ...(fact.readScope?.tableTitleRef ? { tableTitleRef: fact.readScope.tableTitleRef } : {}) }, inventory.snapshot());
  };
  const readContextFor = (current: Held, ref: string): Parameters<typeof checkPublicSourceRelations>[0] | null => {
    const scope = current.observation.facts[ref]?.readScope;
    if (!scope) return null;
    const sources = scope.sourceRefs.map(sourceRef => {
      const source = current.observation.facts[sourceRef];
      if (!source?.nameComplete || !source.name) throw fail('TARGET_CHANGED');
      return { ref: sourceRef, name: source.name, role: source.role, mode: scope.relation };
    });
    return { ref, sources, ...(scope.tableTitleRef ? { tableTitleRef: scope.tableTitleRef } : {}) };
  };
  async function prepare(request: PrepareTargetRequest, state: { abandoned: boolean }): Promise<ResolvedTarget> {
    const current = held;
    if (!heldIsLive(current) || current.generation !== request.generation || current.documentId !== request.documentId || current.origin !== request.origin) throw fail('TARGET_CHANGED');
    const fact = current.observation.facts[request.ref];
    if (fact === undefined) throw fail('TARGET_CHANGED');
    if (!await checkSources(current, request.ref)) throw fail('TARGET_CHANGED');
    const budget = new ActionBudget(PREPARE_BUDGET_MS, clock);
    let candidate: ResolvedTarget;
    const sourceBinding = request.assertSourceBinding;
    if (sourceBinding) {
      const capture = captures.get(sourceBinding.bindingId);
      if (request.operation.kind !== 'assert' || request.operation.predicate !== 'containsText' || request.operation.expected?.kind !== 'binding'
        || request.operation.expected.bindingId !== sourceBinding.bindingId || !capture?.committed || capture.navigation !== navigation
        || capture.identity?.authority !== request.continuityAuthority
        || capture.identity?.admissionId !== sourceBinding.producerAdmissionId || capture.preparationId !== sourceBinding.producerPreparationId) throw fail('TARGET_CHANGED');
      candidate = { ...capture.resolved, assertTextMode: 'READ_BINDING_SOURCE' };
      if (inventory.matcher().hitSplit(locatorValues(candidate.locator as unknown as Locator))) throw fail('NO_DURABLE_LOCATOR');
      const id = current.perception.backendNodeIds[request.ref];
      const ids = await wi2.backendIdsForSelector(current.perception.engine, toEngineSelector(candidate.locator as unknown as Locator));
      if (id === undefined || ids.length !== 1 || ids[0] !== id || !await sourceSame(capture.engine, capture.sourceId, toEngineSelector(candidate.locator as unknown as Locator))) throw fail('TARGET_CHANGED');
    } else if (request.frozen !== undefined) {
      // Prefix replay: the learned target is not synthesized again; it is re-resolved below and must agree with the fact exactly.
      candidate = request.frozen;
    } else {
      const synthesis = await wi2.synthesize({ perception: current.perception, ref: request.ref, inventory, operation: request.operation });
      if (state.abandoned) throw fail('NO_DURABLE_LOCATOR');
      if (!synthesis.ok) throw fail('NO_DURABLE_LOCATOR');
      try {
        candidate = validate<ResolvedTarget>('locator', { locator: synthesis.locator, tier: synthesis.tier, identity: synthesis.identity }, 'ResolvedTarget');
      } catch { throw fail('NO_DURABLE_LOCATOR'); }
    }
    const direct = fact.directTextAssertion === true;
    const directOperation = request.operation.kind === 'assert' && request.operation.predicate === 'containsText' && request.operation.expected?.kind === 'authoredLiteral';
    if (direct) {
      if (!directOperation || sourceBinding || request.frozen && request.frozen.assertTextMode !== 'DIRECT_PUBLIC') throw fail('READ_NOT_ALLOWED');
      candidate = { ...candidate, assertTextMode: 'DIRECT_PUBLIC' };
    } else if (candidate.assertTextMode === 'DIRECT_PUBLIC' || candidate.assertTextMode === 'READ_BINDING_SOURCE' && !sourceBinding) throw fail('READ_NOT_ALLOWED');
    const agreed = assertPrepareProofAgrees(true, fact, candidate);
    if (agreed === null || (request.frozen !== undefined && targetKey(agreed) !== targetKey(request.frozen))) throw fail('NO_DURABLE_LOCATOR');
    // The public API must agree with the engine: exactly one match, and the identity where the tier needs it.
    const resolved = await resolveTarget(page, agreed, { origin: request.origin, allowedDomains: options.allowedDomains, budget, profile: LEARN_PROFILE, operation: request.operation });
    if (resolved.kind !== 'READY') throw fail('NO_DURABLE_LOCATOR');
    if (request.operation.kind === 'selectOption' && request.authoredLiteral !== null) {
      const verdict = await wi2.checkLiveOptions({ engine: current.perception.engine, ref: request.ref, literal: request.authoredLiteral });
      if (verdict.kind === 'refuse') throw fail('OPTION_NOT_PRESENT');
    }
    if (request.operation.kind === 'read') {
      const recipe = request.operation.recipe;
      if (current.readRuleId === null || recipe.kind !== 'visibleText' || recipe.policyRuleId !== current.readRuleId || fact.text === undefined) throw fail('READ_NOT_ALLOWED');
      try { await assertReadable(page, resolved.locator, budget, 'READ_NOT_ALLOWED'); } catch (error) { throw closePlaywrightError(error, 'preFence'); }
    }
    const backendNodeId = current.perception.backendNodeIds[request.ref];
    if (request.pressInheritance) {
      const prior = committedContinuity, inherited = request.pressInheritance;
      const successor = prior !== null && backendNodeId !== undefined && backendNodeId !== prior.binding.backendNodeId
        && await wi2.replacedFocusedField(current.perception.engine, prior.binding.backendNodeId, backendNodeId).catch(() => false);
      if (request.operation.kind !== 'press' || !prior || request.continuityAuthority !== prior.identity.authority
        || prior.identity.admissionId !== inherited.predecessorAdmissionId || prior.identity.requestDigest !== inherited.predecessorRequestDigest
        || prior.identity.operationHash !== inherited.predecessorOperationHash || hash(prior.identity.coordinate) !== hash(inherited.predecessorCoordinate)
        || inherited.documentId !== current.documentId || prior.binding.documentId !== current.documentId || prior.binding.navigation !== navigation
        || backendNodeId !== prior.binding.backendNodeId && !successor) throw fail('TARGET_CHANGED');
    }
    if (backendNodeId === undefined) throw fail('NO_DURABLE_LOCATOR');
    if (state.abandoned || !heldIsLive(held) || held !== current) throw fail('NO_DURABLE_LOCATOR');
    bindings.set(targetKey(agreed), { backendNodeId, documentId: current.documentId, generation: current.generation, navigation: current.navigation });
    return agreed;
  }

  async function prepareTarget(request: PrepareTargetRequest): Promise<ResolvedTarget> {
    const state = { abandoned: false };
    try {
      return await raceDeadline(prepare(request, state), clock() + PREPARE_BUDGET_MS, () => { state.abandoned = true; }, clock);
    } catch (error) {
      if (error instanceof ClosedActionError) throw error.code === 'OBSERVATION_DEADLINE' ? fail('NO_DURABLE_LOCATOR') : error;
      throw closePlaywrightError(error, 'preFence');
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // resolve / refer / invoke

  async function resolve(request: ResolveTargetRequest): Promise<ResolveTargetResult> {
    assertOpen();
    if (busy) throw fail('STALE_OBSERVATION');
    if (request.operation.kind === 'read' && (request.readRuleId === null || request.readRuleId !== readRuleIdFor(options.readProfile, hostnameOf(request.origin)))) return { kind: 'REFUSED', code: 'READ_REFUSED' };
    let outcome;
    try {
      outcome = await resolveTarget(page, request.resolved, { origin: request.origin, allowedDomains: options.allowedDomains, budget: new ActionBudget(RESOLVE_BUDGET_MS, clock), profile: REPLAY_PROFILE, operation: request.operation });
    } catch (error) {
      const closedError = closePlaywrightError(error, 'preFence');
      if (closedError instanceof ClosedActionError && closedError.code === 'CONTEXT_LOST') throw closedError;
      if (closedError instanceof ClosedActionError) return { kind: 'REFUSED', code: 'TARGET_DRIFT' };
      throw closedError;
    }
    if (outcome.kind === 'ABSENT') return { kind: 'ABSENT' };
    if (outcome.kind === 'REFUSED') return { kind: 'REFUSED', code: 'TARGET_DRIFT' };
    if (hasTableContext(request.resolved)) {
      // A held observation of an earlier document (the page navigated since) has a destroyed engine context: only a current one is reused.
      const reuse = held !== null && !closed && held.navigation === navigation ? held : null;
      const contextEngine = reuse?.perception.engine ?? await wi2.openEngine(await channel());
      try {
        if (!await checkFrozenSourceContext(contextEngine, request.resolved.locator as unknown as Locator, toEngineSelector(request.resolved.locator as unknown as Locator), inventory.snapshot(), request.resolved.assertTextMode === 'READ_BINDING_SOURCE')) return { kind: 'REFUSED', code: 'TARGET_DRIFT' };
      } finally { if (!reuse) await contextEngine.cdp.send('Runtime.releaseObject', { objectId: contextEngine.objectId }).catch(() => undefined); }
    }
    return { kind: 'READY' };
  }

  /** Prefix replay: the ref of the held observation that names the frozen target. null = absent or not shown (WAIT); several matches = TARGET_CHANGED. */
  async function refFor(resolved: ResolvedTarget): Promise<string | null> {
    assertOpen();
    const current = held;
    if (!heldIsLive(current)) return null;
    let ids: number[];
    try {
      ids = await wi2.backendIdsForSelector(current.perception.engine, toEngineSelector(resolved.locator as unknown as Locator));
    } catch (error) {
      throw closePlaywrightError(error, 'preFence');
    }
    if (ids.length === 0) return null;
    if (ids.length >= 2) throw fail('TARGET_CHANGED');
    const id = ids[0];
    if (id === undefined) return null;
    const ref = Object.entries(current.perception.backendNodeIds).find(([, node]) => node === id)?.[0];
    if (ref === undefined || current.observation.facts[ref] === undefined) return null;
    // The frozen identity must be exactly what the gated fact says: a disagreeing identity is never normalised.
    const agreed = assertPrepareProofAgrees(true, current.observation.facts[ref], resolved);
    if (agreed === null || targetKey(agreed) !== targetKey(resolved)) throw fail('NO_DURABLE_LOCATOR');
    bindings.set(targetKey(resolved), { backendNodeId: id, documentId: current.documentId, generation: current.generation, navigation: current.navigation });
    return ref;
  }

  async function invoke(request: TargetInvocation, control?: InvocationControl): Promise<TargetInvocationResult> {
    control?.check();
    assertOpen();
    if (busy) throw fail('TARGET_CHANGED');
    if (request.resolved.assertTextMode && (request.operation.kind !== 'assert' || request.operation.predicate !== 'containsText'
      || (request.resolved.assertTextMode === 'DIRECT_PUBLIC' ? request.operation.expected?.kind !== 'authoredLiteral' || request.assertSourceBinding !== undefined
        : request.operation.expected?.kind !== 'binding'))) throw fail('READ_REFUSED');
    const profile = profileFor(request.profile);
    const budget = budgetFor(profile, control?.remainingMs?.() ?? Number.MAX_SAFE_INTEGER, clock);
    const learn = request.profile === 'learn';
    const invocationHeld = held;
    const invocationNavigation = navigation;
    let invocationEngine: PerceptionEngine | undefined = invocationHeld !== null && !closed && invocationHeld.navigation === navigation ? invocationHeld.perception.engine : undefined;
    const getInvocationEngine = async (): Promise<PerceptionEngine> => { invocationEngine ??= await wi2.openEngine(await channel()); return invocationEngine; };
    let newCapture: { bindingId: string; capture: Capture } | undefined;
    const authority = (): void => {
      control?.check();
      assertOpen();
      if (busy || navigation !== invocationNavigation || held !== invocationHeld || new URL(page.url()).origin !== request.origin) throw fail('TARGET_CHANGED');
      if (learn && (!heldIsLive(invocationHeld) || invocationHeld.origin !== request.origin
        || invocationHeld.documentId !== request.expect?.documentId || invocationHeld.generation !== request.expect.generation)) throw fail('TARGET_CHANGED');
    };
    let binding: Binding | undefined;
    if (learn) {
      // Learn acts only on a target prepared in the observation the proposal came from.
      const current = held;
      binding = bindings.get(targetKey(request.resolved));
      const expect = request.expect;
      if (!heldIsLive(current) || binding === undefined || expect === undefined || current.documentId !== expect.documentId || current.generation !== expect.generation
        || binding.documentId !== expect.documentId || binding.generation !== expect.generation || binding.navigation !== navigation) throw fail('TARGET_CHANGED');
    }
    const predecessor = committedContinuity;
    clearContinuity(); // Every invocation consumes the immediately preceding capability, including refusals.
    if (request.pressInheritance) {
      const inherited = request.pressInheritance, current = request.invocationIdentity;
      const successor = binding !== undefined && predecessor !== null && binding.backendNodeId !== predecessor.binding.backendNodeId
        && await wi2.replacedFocusedField(await getInvocationEngine(), predecessor.binding.backendNodeId, binding.backendNodeId).catch(() => false);
      if (!binding || !predecessor || request.operation.kind !== 'press' || !current
        || current.authority !== predecessor.identity.authority || inherited.predecessorAdmissionId !== predecessor.identity.admissionId
        || inherited.predecessorRequestDigest !== predecessor.identity.requestDigest || inherited.predecessorOperationHash !== predecessor.identity.operationHash
        || hash(inherited.predecessorCoordinate) !== hash(predecessor.identity.coordinate)
        || inherited.documentId !== binding.documentId || binding.documentId !== predecessor.binding.documentId
        || binding.navigation !== predecessor.binding.navigation || binding.backendNodeId !== predecessor.binding.backendNodeId && !successor) throw fail('TARGET_CHANGED');
    }
    try {
      authority();
      const resolved = await resolveTarget(page, request.resolved, { origin: request.origin, allowedDomains: options.allowedDomains, budget, profile, operation: request.operation });
      authority();
      if (resolved.kind !== 'READY') throw fail('TARGET_CHANGED');
      if (!learn && (request.operation.kind === 'read' || request.resolved.assertTextMode || hasTableContext(request.resolved))) {
        const witness = await resolved.locator.elementHandle({ timeout: budget.take(profile.boundCheckMs) });
        if (!witness) throw fail('TARGET_CHANGED');
        try { binding = { backendNodeId: await host.inspectBoundElement(witness), documentId: '', generation: 0, navigation }; }
        finally { await witness.dispose(); }
        authority();
      }
      const bound = binding;
      let invokedBinding: Binding | undefined;
      const sameNode = async (): Promise<boolean> => {
        authority();
        if (hasTableContext(request.resolved)) {
          const contextEngine = await getInvocationEngine();
          if (!await checkFrozenSourceContext(contextEngine, request.resolved.locator as unknown as Locator, toEngineSelector(request.resolved.locator as unknown as Locator), inventory.snapshot(), request.resolved.assertTextMode === 'READ_BINDING_SOURCE')) return false;
        }
        if (bound === undefined) return true;
        if (!learn) {
          const ids = await wi2.backendIdsForSelector(await getInvocationEngine(), toEngineSelector(request.resolved.locator as unknown as Locator));
          authority(); return ids.length === 1 && ids[0] === bound.backendNodeId;
        }
        if (invocationHeld === null) return false;
        const ids = await wi2.backendIdsForSelector(invocationHeld.perception.engine, toEngineSelector(request.resolved.locator as unknown as Locator));
        authority();
        const ref = Object.entries(invocationHeld.perception.backendNodeIds).find(([, id]) => id === bound.backendNodeId)?.[0];
        const same = ids.length === 1 && ids[0] === bound.backendNodeId && ref !== undefined && await checkSources(invocationHeld, ref);
        if (same && ids[0] !== undefined) invokedBinding = { ...bound, backendNodeId: ids[0] };
        return same;
      };
      const verifyCapturedElement = async (candidate: BoundElement, witness: BoundElement): Promise<void> => {
        authority();
        const capturedId = await host.inspectBoundElement(candidate);
        authority();
        const witnessId = await host.inspectBoundElement(witness);
        authority();
        if (budget.expired()) throw fail('TARGET_CHANGED');
        if (capturedId !== witnessId || (bound !== undefined && capturedId !== bound.backendNodeId)) throw fail('TARGET_CHANGED');
        if (bound) invokedBinding = { ...bound, backendNodeId: capturedId };
      };
      if (!(await timed(sameNode(), budget.take(profile.boundCheckMs)))) throw fail('TARGET_CHANGED');
      const readText = request.operation.kind !== 'read' ? undefined : async (): Promise<string> => {
        authority();
        if (request.operation.kind !== 'read' || captures.get(request.operation.bindingId)?.committed || captures.size >= 32) throw fail('READ_REFUSED');
        const previous = captures.get(request.operation.bindingId);
        if (previous) { await disposeSource(previous.engine, previous.sourceId); captures.delete(request.operation.bindingId); }
        const witness = await resolved.locator.elementHandle({ timeout: budget.take(profile.boundCheckMs) });
        if (!witness) throw fail('READ_REFUSED');
        let witnessId: number;
        try { witnessId = await host.inspectBoundElement(witness); } finally { await witness.dispose(); }
        authority();
        const engine = await getInvocationEngine();
        const ref = learn && invocationHeld && bound ? Object.entries(invocationHeld.perception.backendNodeIds).find(([, id]) => id === bound.backendNodeId)?.[0] : undefined;
        const readContext = learn && invocationHeld && ref ? readContextFor(invocationHeld, ref) : undefined;
        const sourceId = await captureSourceOnEngine(engine, toEngineSelector(request.resolved.locator as unknown as Locator), request.maxValueBytes,
          request.resolved.locator as unknown as Locator, readContext);
        const capture: Capture = { sourceId, engine, origin: null, navigation: invocationNavigation, resolved: request.resolved,
          identity: request.invocationIdentity, preparationId: request.preparationId, committed: false, value: '' };
        newCapture = { bindingId: request.operation.bindingId, capture };
        authority();
        if (await sourceBackendNodeId(engine, sourceId) !== witnessId || bound && witnessId !== bound.backendNodeId) throw fail('READ_REFUSED');
        const value = await sourceValue(engine, sourceId, inventory.snapshot());
        authority();
        capture.value = value;
        captures.set(request.operation.bindingId, capture);
        return value;
      };
      const compareText = request.resolved.assertTextMode === undefined ? undefined : async (expected: string): Promise<boolean> => {
        authority();
        if (request.operation.kind !== 'assert' || request.operation.predicate !== 'containsText') throw fail('READ_REFUSED');
        const selector = toEngineSelector(request.resolved.locator as unknown as Locator);
        if (request.resolved.assertTextMode === 'READ_BINDING_SOURCE') {
          const expectedBinding = request.operation.expected;
          if (expectedBinding?.kind !== 'binding') throw fail('READ_REFUSED');
          const capture = captures.get(expectedBinding.bindingId);
          if (!capture?.committed || !capture.origin || capture.navigation !== navigation) throw fail('READ_REFUSED');
          if (learn && (!request.assertSourceBinding || request.assertSourceBinding.bindingId !== expectedBinding.bindingId
            || request.assertSourceBinding.producerAdmissionId !== capture.identity?.admissionId
            || request.assertSourceBinding.producerPreparationId !== capture.preparationId
            || request.invocationIdentity?.authority !== capture.identity.authority)) throw fail('READ_REFUSED');
          if (!await sourceSame(capture.engine, capture.sourceId, selector)) throw fail('READ_REFUSED');
          authority();
          // Full ordinary inventory still has every origin; only this native comparison uses
          // the contributor-selected view. Fresh DOM values are also checked atomically there.
          const result = await compareSource(capture.engine, capture.sourceId, expected, inventory.foreignEntries(capture.origin), 'READ_BINDING_SOURCE', request.resolved.locator as unknown as Locator, selector, inventory.snapshot());
          authority(); return result;
        }
        if (request.resolved.assertTextMode !== 'DIRECT_PUBLIC' || request.operation.expected?.kind !== 'authoredLiteral' || request.assertSourceBinding) throw fail('READ_REFUSED');
        const engine = await getInvocationEngine();
        const ref = learn && invocationHeld && bound ? Object.entries(invocationHeld.perception.backendNodeIds).find(([, id]) => id === bound.backendNodeId)?.[0] : undefined;
        const sourceId = await captureSourceOnEngine(engine, selector, request.maxValueBytes, request.resolved.locator as unknown as Locator,
          learn && invocationHeld && ref ? readContextFor(invocationHeld, ref) : undefined);
        try {
          authority();
          if (!bound) throw fail('READ_REFUSED');
          if (await sourceBackendNodeId(engine, sourceId) !== bound.backendNodeId) throw fail('READ_REFUSED');
          const result = await compareSource(engine, sourceId, expected, inventory.snapshot(), 'DIRECT_PUBLIC', request.resolved.locator as unknown as Locator, selector);
          authority(); return result;
        } finally { await disposeSource(engine, sourceId); }
      };
      const result = await performOnTarget(page, request.operation, resolved.locator, request.resolvedValue, control, {
        profile, budget, authority, verifyCapturedElement, maxValueBytes: request.maxValueBytes, readRuleId: request.readRuleId, liveReadRuleId: readRuleIdFor(options.readProfile, hostnameOf(request.origin)),
        ...(readText ? { readText } : {}), ...(compareText ? { compareText } : {}),
        origin: request.origin, allowedDomains: options.allowedDomains, target: request.resolved, sameNode,
      });
      // `bound` is the invocation-local binding used by the real operation's last recheck,
      // never a later map lookup after an automatic observation or preparation.
      if (invokedBinding && request.invocationIdentity && ['fill','click','check'].includes(request.operation.kind)
        && result.assertionPassed !== false && invokedBinding.navigation === navigation) {
        pendingContinuity = { identity: structuredClone(request.invocationIdentity), binding: invokedBinding };
      }
      return result;
    } catch (error) {
      if (newCapture) { captures.delete(newCapture.bindingId); void disposeSource(newCapture.capture.engine, newCapture.capture.sourceId); }
      clearContinuity();
      throw closePlaywrightError(error, control?.phase === 'INVOKING' ? 'postFence' : 'preFence');
    } finally {
      if (invocationHeld === null && invocationEngine) await invocationEngine.cdp.send('Runtime.releaseObject', { objectId: invocationEngine.objectId }).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // page-level steps and the password path (page-state program)

  const pageCall = async (declaration: string, args: readonly unknown[]): Promise<Remote> => {
    const current = held;
    if (current === null) throw fail('TARGET_CHANGED');
    return send('Runtime.callFunctionOn', { objectId: current.pageStateId, functionDeclaration: declaration, arguments: args.map(value => ({ value })), returnByValue: true });
  };
  const pageStep = async <T>(work: () => Promise<T>): Promise<T> => {
    try { return await work(); } catch (error) { throw closePlaywrightError(error, 'preFence'); }
  };

  const session: ObservationSession = {
    observe,
    revokeReads: clearCaptures,
    clearContinuity,
    commitInvocation(identity) {
      const candidate = pendingContinuity;
      pendingContinuity = null;
      if (!candidate || hash(candidate.identity) !== hash(identity) || candidate.binding.navigation !== navigation || closed) { committedContinuity = null; return; }
      committedContinuity = candidate;
    },
    commitRead(bindingId, producer) {
      const capture = captures.get(bindingId);
      if (!capture || capture.committed || capture.navigation !== navigation || closed
        || producer && (capture.preparationId !== producer.preparationId || !capture.identity || hash(capture.identity) !== hash(producer.identity))
        || !producer && capture.identity !== undefined) { clearCaptures(); throw fail('READ_REFUSED'); }
      capture.committed = true;
      capture.origin = mintCaptureOrigin();
      inventory.addCapture(capture.value, capture.origin);
      capture.value = '';
    },
    prepareTarget,
    resolveTarget: resolve,
    refForTarget: refFor,
    invoke,
    ...createPasswordControl({
      current: () => ({ closed, busy, generation, observedNavigation: held?.navigation ?? -1, navigation, documentId: held?.documentId, available: held !== null && cdp !== null }),
      async call(method, values) {
        const declaration = method === 'preparePassword' ? 'function(target, origin) { return this.preparePasswordResult(target, origin); }' : 'function(target, origin, allowedOrigins, value) { return this.fillPasswordResult(target, origin, allowedOrigins, value); }';
        return await pageCall(declaration, values) as PasswordWorldResult;
      },
    }, assertOpen, values => session.withhold?.(values) ?? Promise.resolve()),
    withhold(values) {
      if (closed) return Promise.reject(fail('CONTEXT_LOST'));
      try {
        inventory.withhold([...knownSecrets, ...values]);
        for (const value of values) if (!knownSecrets.includes(value)) knownSecrets.push(value);
        return Promise.resolve();
      } catch {
        inventory.fail();
        return Promise.reject(fail('CONTEXT_LOST'));
      }
    },
    async navigate(target, origin, destination) {
      clearContinuity();
      clearCaptures();
      const reached = mainDocumentTransition(page);
      if (closed || busy || !heldIsLive(held)) throw fail('TARGET_CHANGED');
      const result = await pageStep(() => pageCall('function(target, origin, destination) { this.navigate(target, origin, destination); }', [target, origin, destination]));
      if (result.exceptionDetails !== undefined) throw fail('TARGET_CHANGED');
      if (!await reached) throw fail('TARGET_CHANGED');
    },
    async assertPage(target, origin, predicate, expected) {
      clearContinuity();
      if (closed || busy || !heldIsLive(held)) throw fail('TARGET_CHANGED');
      const result = await pageStep(() => pageCall('function(target, origin, predicate, expected) { return this.assertPage(target, origin, predicate, expected); }', [target, origin, predicate, expected]));
      if (result.exceptionDetails !== undefined) throw fail('TARGET_CHANGED');
      return result.result?.value === true;
    },
    async pageMatches(target, origin) {
      if (closed || busy || !heldIsLive(held)) return false;
      try {
        const result = await pageCall('function(target, origin) { return this.pageMatches(target, origin); }', [target, origin]);
        return result.exceptionDetails === undefined && result.result?.value === true;
      } catch { return false; }
    },
    async dispose() {
      closed = true;
      clearContinuity();
      knownSecrets.length = 0;
      inventory.dispose();
      unsubscribe();
      const last = held;
      held = null;
      bindings.clear();
      if (last !== null) await release({ pageStateId: last.pageStateId, engine: last.perception.engine });
      await rawCdp?.detach?.().catch(() => undefined);
      cdp = null;
      rawCdp = null;
    },
  };
  return session;
}

