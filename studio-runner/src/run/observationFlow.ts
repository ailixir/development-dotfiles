/**
 * The observation session (ADR-SC-007 WI-4, ADR-SC-008 D7) without Playwright. `browser.ts` composes it with the real Page and CDP
 * session; the unit tier drives it with fakes. Step code acts through the Playwright objects it is given, so what is left here is what
 * observes and what guards the password path:
 *
 * - observe(): WI-2 `perceive` on an engine opened in a fresh isolated world `checks-observation-<uuid>`, the page-state program
 *   (`pageStateInPage.ts`) installed in the same world, ONE deadline raced over the whole call, the wire observation built from the
 *   perception, never an emptied observation.
 * - invalidate(): step code ran, so every stamp taken before it is dead; the next observe() recertifies (FR-19).
 * - the password pair of the page-state program, withhold, commitCapture and dispose.
 *
 * Every error that leaves is closed (closedError.ts): a ClosedActionError, or OriginNotAllowed (host only).
 */
import { randomUUID } from 'node:crypto';
import { domainAllowed } from '../allowedDomains.js';
import { validate } from '../guided/contracts.js';
import type { Observation, ObservationFact } from '../guided/types.js';
import { ClosedActionError, closeObservationError, detachedObservationState, pageLeftUnderObservation, type ClosedActionCode } from './closedError.js';
import { createPasswordControl } from './passwordControl.js';
import type { PasswordWorldResult } from './passwordControl.js';
import { raceDeadline, unitsFor } from './observationDeadline.js';
import { observationOptions, exportObservation } from './observationSanitizer.js';
import type { ObservationConfig, ObservationExport, ObservationFocus, ObservationSession } from './observationTypes.js';
import { installPageState } from './pageStateInPage.js';
import { perceive, type Perception } from './perceive.js';
import { openEngine, untrackedObservationChannel } from './playwrightEngine.js';
import type { CdpSession, PerceptionEngine } from './playwrightEngine.js';
import { PrivateInventory, mintCaptureOrigin } from './privateInventory.js';
import { shownRefsOf } from '../validator/outlineRefs.js';

/** An observation is kept only if the page stayed unchanged this long after it was taken (else it is taken again, a bounded number of times). */
export { shownRefsOf };
export const OBSERVATION_QUIET_MS = 400;
export const OBSERVATION_ATTEMPTS = 8;
/** The probe that tells an engine that still answers from one that does not. */
const PROBE_MS = 1_000;

/** What the flow reads of the page: its URL. Everything else the page does is step code's business. */
export interface PageLike { url(): string }

export interface FlowCdp extends CdpSession {
  detach?(): Promise<void>;
}

/** The Playwright side of the session, supplied by browser.ts (and faked by the unit tier). */
export interface FlowHost {
  readonly page: PageLike;
  /** A new CDP session on the page. */
  newCdp(): Promise<FlowCdp>;
  /** Registers a listener for every main-frame navigation; returns the unsubscribe. */
  onNavigation(listener: () => void): () => void;
  /** Registers a listener for every new main-frame document (a navigation that is not a history change); returns the unsubscribe. */
  onDocument(listener: () => void): () => void;
  /** Waits (bounded) until the main frame is on a whitelisted host again; throws OriginNotAllowed when it is not. */
  awaitWhitelistedMainFrame(allowedDomains: readonly string[]): Promise<void>;
}

/** The WI-2 calls the flow makes. Replaceable only by the unit tier. */
export interface FlowEngine {
  openEngine: typeof openEngine;
  perceive: typeof perceive;
}
const WI2: FlowEngine = { openEngine, perceive };

interface Remote { result?: { value?: unknown; objectId?: string }; exceptionDetails?: { exception?: { description?: string } } }

interface Held {
  readonly generation: number;
  readonly documentId: string;
  readonly origin: string;
  readonly navigation: number;
  readonly perception: Perception;
  readonly observation: Observation;
  readonly pageStateId: string;
}

const fail = (code: ClosedActionCode): ClosedActionError => new ClosedActionError(code);

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
  let documents = 0;
  let generation = 0;
  let documentId = '';
  let held: Held | null = null;
  /** Step code ran since `held` was taken: it still names the document (observe() keeps its identity) but nothing may be stamped against it. */
  let stale = false;
  let deadlineLatched = false;

  const unsubscribe = host.onNavigation(() => { navigation++; });
  const unsubscribeDocument = host.onDocument(() => { documents++; });

  const assertOpen = (): void => { if (closed) throw fail('CONTEXT_LOST'); };
  const channel = async (): Promise<FlowCdp> => {
    if (!cdp) { rawCdp = await host.newCdp(); cdp = untrackedObservationChannel(rawCdp); }
    return cdp;
  };
  const send = async (method: string, params?: object): Promise<Remote> => (await (await channel()).send(method, params)) as Remote;

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
    const observation: Observation = {
      schemaVersion: 3, sessionId: options.sessionId, documentId: candidateDocumentId, generation: stampedGeneration, origin: taken.origin, scopeHash: options.scopeHash, observedAt: new Date().toISOString(),
      coverage: { withheldRegions: counters.withheldPrivate + counters.withheldSensitive + counters.splitWithheld, unsupportedRegions: counters.unsupported, passwordControls: counted.result.value },
      projection: { projected: taken.outline.projected, tier: taken.outline.projectionTier, totalNodes: taken.outline.totalNodes, shownNodes: taken.outline.shownNodes, notShown: taken.outline.notShown, outlineBytes: taken.outline.text === '' ? Buffer.byteLength('- document', 'utf8') : taken.outline.bytes },
      // An empty page has no outline line, and the contract wants one: the document root is the line a populated page starts with too.
      outline: taken.outline.text === '' ? '- document' : taken.outline.text, facts,
    };
    validate('observation', observation);
    const shown = shownRefsOf(observation.outline), keys = Object.keys(facts);
    if (shown.size !== keys.length || keys.some(key => !shown.has(key))) throw fail('OBSERVATION_UNAVAILABLE');
    const exported = exportObservation(observation, maxBytes);
    checkpoint();
    documentId = candidateDocumentId;
    held = { generation: stampedGeneration, documentId, origin: taken.origin, navigation: before, perception: taken, observation: exported.observation, pageStateId };
    stale = false;
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

  /**
   * A step can return before the navigation it started has committed (a page-level key press, a select whose page script navigates a tick later), so the
   * observation that follows it can start on the old document and fail with STALE_OBSERVATION or OBSERVATION_UNAVAILABLE. When a navigation or a new document
   * appeared during the attempt (or the protocol says the document went away under it: that error can arrive before Playwright's own event), the page has settled on something new: wait for the whitelist again (an SSO redirect is not SCOPE_DENIED) and observe once
   * more, inside the same deadline. One retry only, for these two codes only; anything else, or a second failure, leaves with its own code.
   */
  async function observeWithOneRetry(maxBytes: number, settle: boolean, focus: ObservationFocus | undefined, deadlineAt: number, attempt: { engine: PerceptionEngine | null; pageStateId: string | null; expired: boolean }, generationBefore: number): Promise<ObservationExport> {
    const seen = navigation + documents;
    try {
      return await observeOnce(maxBytes, settle, focus, deadlineAt, attempt);
    } catch (error) {
      const code = closeObservationError(error).error;
      const retryable = code instanceof ClosedActionError && (code.code === 'STALE_OBSERVATION' || code.code === 'OBSERVATION_UNAVAILABLE');
      if (!retryable || closed || attempt.expired || (navigation + documents === seen && !pageLeftUnderObservation(error))) throw error;
      await release(attempt);
      attempt.engine = null;
      attempt.pageStateId = null;
      generation = generationBefore;
      await host.awaitWhitelistedMainFrame(options.allowedDomains);
      return observeOnce(maxBytes, settle, focus, deadlineAt, attempt);
    }
  }

  async function observe(maxBytes: number = options.limits.bytes, settle = false, focus?: ObservationFocus, deadlineMs?: number): Promise<ObservationExport> {
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
      return await raceDeadline(observeWithOneRetry(maxBytes, settle, focus, deadlineAt, attempt, generationBefore), deadlineAt, () => {
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
  // page-level steps and the password path (page-state program)

  const pageCall = async (declaration: string, args: readonly unknown[]): Promise<Remote> => {
    const current = held;
    if (current === null) throw fail('TARGET_CHANGED');
    return send('Runtime.callFunctionOn', { objectId: current.pageStateId, functionDeclaration: declaration, arguments: args.map(value => ({ value })), returnByValue: true });
  };
  const session: ObservationSession = {
    observe,
    commitCapture(value) {
      if (closed) throw fail('CONTEXT_LOST');
      inventory.addCapture(value, mintCaptureOrigin());
    },
    invalidate() { stale = true; },
    documentCurrent(target, origin) {
      if (closed || busy || held === null || stale || held.navigation !== navigation || held.documentId !== target.documentId || held.generation !== target.generation || held.origin !== origin) return false;
      try { return new URL(page.url()).origin === origin; } catch { return false; }
    },
    documentEpoch: () => documents,
    ...createPasswordControl({
      current: () => ({ closed, busy, generation, observedNavigation: held !== null && !stale ? held.navigation : -1, navigation, documentId: held?.documentId, available: held !== null && !stale && cdp !== null }),
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
    async dispose() {
      closed = true;
      knownSecrets.length = 0;
      inventory.dispose();
      unsubscribe();
      unsubscribeDocument();
      const last = held;
      held = null;
      if (last !== null) await release({ pageStateId: last.pageStateId, engine: last.perception.engine });
      await rawCdp?.detach?.().catch(() => undefined);
      cdp = null;
      rawCdp = null;
    },
  };
  return session;
}
