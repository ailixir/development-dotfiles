import type {InvocationControl} from '../executor/observedReplay.js';
import type { RecordedContextCapability } from './observedAccount.js';
/**
 * **The only module in this package that imports Playwright** (AC-1).
 *
 * `eslint.boundary-rules.js` restricts `playwright` and `playwright-core` everywhere else, with
 * proving fixtures under `fixtures/lint/`, and `test/run/playwright-confinement.test.ts` asserts
 * over the sources that no Playwright import appears in `src/validator/**`, `src/executor/**`,
 * `src/server/**` or `src/reporting/**`. Keeping the import to one small file is what makes that
 * claim checkable rather than aspirational.
 *
 * ## The sandbox
 *
 * `chromiumSandbox: true` is written literally below and there is **no** configuration key,
 * environment variable, job field or code path that can set it to `false` (AC-6a, §9.3, ADR-001
 * §8). Playwright's own default is `false` — it adds `--no-sandbox` — so the default is the wrong
 * way round and the requirement has to be a gate rather than a habit. `args` is an explicitly
 * empty array for the same reason: a reviewer cannot see an argument that was never written, and
 * an empty literal is something a diff can show being filled in.
 *
 * If Chromium will not start sandboxed, this module reports it. It does **not** retry without the
 * sandbox: `test/run/sandbox.test.ts` drives that path and asserts a single launch attempt with a
 * single set of arguments.
 *
 * ## One browser, one context, one page — and everything it writes is scratch
 *
 * `launchPersistentContext` is used rather than `launch` + `newContext` because it puts the
 * browser's own profile/user-data directory where AC-22 requires it: inside the per-run scratch
 * directory, which is cleared on every exit path. `downloadsPath` and `tracesDir` go there too,
 * and the child sets `TMPDIR` so Chromium's temp output follows. Recording is configured **at
 * context creation** with an explicit size (§6.1) and is never attached per page.
 */

import { PrivateObservationInventory } from './observationInventory.js';
import { dispatchNativeInput } from './nativeInput.js';
import type { NativePoint } from './nativeInput.js';
import { GuidedLaunchFailure } from './guidedBrowser.js';
import type { GuidedBrowser } from './guidedBrowser.js';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page, Frame, CDPSession } from 'playwright';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { BrowserFactory, BrowserHandle, BrowserLaunchRequest } from './browserFactory.js';
import { installObservationCollector } from './observationCollector.js';
import { observationOptions, exportObservation } from './observationSanitizer.js';
import type { ObservationConfig, ObservationSession, Observation, GuidedInvocationResult, AcquisitionResult } from './observationTypes.js';
import type { PageLike } from './playwrightAdapter.js';
import { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';

/** Bounded so an adversarial page cannot grow the observation set without limit (AC-19). */
const MAX_OBSERVED_HOSTS = 64;

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'about:' || parsed.protocol === 'blob:' ? null : parsed.host || parsed.protocol;
  } catch {
    return null;
  }
}

/**
 * Deletes every file in the run's video directory except the one the single page produced.
 *
 * Scoped to that directory and best-effort: a recording that cannot be removed is not worth
 * failing a run over, and the run is already reporting an unsupported-workflow code.
 */
async function removeStrayRecordings(videoDir: string, keep: string): Promise<void> {
  try {
    for (const entry of await readdir(videoDir)) {
      const path = join(videoDir, entry);
      if (path === keep) continue;
      await rm(path, { force: true });
    }
  } catch {
    // The directory may not exist if nothing was ever recorded.
  }
}

export const playwrightBrowserFactory: BrowserFactory = {
  async launch(request: BrowserLaunchRequest): Promise<BrowserHandle> {
    if (request.browser !== 'chromium') {
      throw new Error(`Unsupported browser "${request.browser}": V1 launches Chromium only.`);
    }

    const videoDir = join(request.scratchPath, SCRATCH_SUBDIRECTORIES.video);

    const context: BrowserContext = await chromium.launchPersistentContext(
      join(request.scratchPath, SCRATCH_SUBDIRECTORIES.profile),
      {
        headless: true,
        // §9.3 / ADR-001 §8. Not configurable, not overridable, never retried without it.
        chromiumSandbox: true,
        // Explicitly empty: no `--no-sandbox`, no `--disable-setuid-sandbox`, no
        // `--disable-gpu-sandbox`, and a diff that adds one is visible (AC-6a).
        args: [],
        viewport: { width: request.viewport.width, height: request.viewport.height },
        // Configured at context creation, with an explicit size (§6.1, AC-7).
        recordVideo: {
          dir: videoDir,
          size: { width: request.recording.width, height: request.recording.height },
        },
        downloadsPath: join(request.scratchPath, SCRATCH_SUBDIRECTORIES.downloads),
        tracesDir: join(request.scratchPath, SCRATCH_SUBDIRECTORIES.traces),
        acceptDownloads: false,
        ...(request.observedScope ? {serviceWorkers: 'block' as const} : {}),
      },
    );

    const [first] = context.pages();
    const page: Page = first ?? (await context.newPage());

    const observedScope = request.observedScope;
    let blankConnection: CDPSession | null = null;
    let blankObject: string | null = null;
    if (observedScope) {
      await context.route('**/*', async route => {
        let allowed = false;
        try { allowed = observedScope.allowedOrigins.includes(new URL(route.request().url()).origin); } catch { /* fail closed */ }
        if (allowed) await route.continue().catch(() => undefined); else await route.abort().catch(() => undefined);
      });
      blankConnection = await context.newCDPSession(page);
      const tree = await blankConnection.send('Page.getFrameTree');
      const world = await blankConnection.send('Page.createIsolatedWorld', {frameId:tree.frameTree.frame.id,worldName:`checks-replay-blank-${randomUUID()}`,grantUniveralAccess:false});
      const document = await blankConnection.send('Runtime.evaluate',{expression:'document',contextId:world.executionContextId,returnByValue:false});
      blankObject = document.result.objectId ?? null;
      if (!blankObject || page.url() !== 'about:blank') { await context.close(); throw new Error('TARGET_DRIFT'); }
    }
    const blankMatches = async (): Promise<boolean> => {
      if (!blankConnection || !blankObject) return false;
      try { const r = await blankConnection.send('Runtime.callFunctionOn',{objectId:blankObject,functionDeclaration:'function() { return this === document && location.href === "about:blank" && location.origin === "null"; }',returnByValue:true});return !r.exceptionDetails && r.result.value === true; } catch { return false; }
    };
    const approvedDestination = (destination:string):void => {
      const url = new URL(destination);
      if (!observedScope?.allowedOrigins.includes(url.origin) || url.username || url.password) throw new Error('POLICY_REFUSED');
    };
    const hosts = new Set<string>();
    context.on('request', (request_) => {
      if (hosts.size >= MAX_OBSERVED_HOSTS) return;
      const host = hostOf(request_.url());
      if (host !== null) hosts.add(host);
    });

    let extraPageListener: (() => void) | null = null;
    let sawExtraPage = false;
    context.on('page', (opened) => {
      if (opened === page) return;
      // Closed immediately (§5.2, AC-15): V1 drives one page, and execution never continues on
      // the other one. Its recording is dealt with in `close`, below, where the files are
      // finalized and can actually be removed.
      sawExtraPage = true;
      void opened.close().catch(() => undefined);
      extraPageListener?.();
    });

    let closed = false;

    return {
      page: page as unknown as PageLike,

      createObservationSession: (config) => createBrowserObservationSession(page, config),
      ...(observedScope ? {
        observedBlankMatches: blankMatches,
        async observedInitialContextMatches(){return observedScope.initialContext.kind==='initialBlank'?blankMatches():new URL(page.url()).origin===observedScope.initialContext.origin;},
        async observedWait(strategy:'load'|'domcontentloaded'|'networkidle',timeoutMs:number){await page.waitForLoadState(strategy,{timeout:timeoutMs});},
        async observedNavigateBlank(destination:string, control?:InvocationControl) {
          control?.check();
          approvedDestination(destination);
          if (!blankConnection || !blankObject || !await blankMatches()) throw new Error('TARGET_DRIFT');
          control?.check();
          control?.beginInvocation();
          const r=await blankConnection.send('Runtime.callFunctionOn',{objectId:blankObject,functionDeclaration:'function(destination) { if (this !== document || location.href !== "about:blank" || location.origin !== "null") throw new Error("TARGET_CHANGED"); location.assign(destination); }',arguments:[{value:destination}],returnByValue:true});
          control?.check();
          if (r.exceptionDetails) throw new Error('TARGET_DRIFT');
          await page.waitForURL(destination,{timeout:30000,waitUntil:'domcontentloaded'});
          control?.check();
        },
        observedAccountContext: {
          identity:Object.freeze({}),scope:observedScope,
          async installCookies(cookies: Parameters<RecordedContextCapability['installCookies']>[0]) {
            for (const cookie of cookies) {
              if (!observedScope.allowedOrigins.some(origin => {const u=new URL(origin);return u.hostname===cookie.domain && (!cookie.secure || u.protocol==='https:');})) throw new Error('POLICY_REFUSED');
            }
            await context.addCookies(cookies.map(cookie=>({...cookie})));
          },
          async enter(destination:string) {
            approvedDestination(destination);
            if (observedScope.initialContext.kind!=='observedDocument' || new URL(destination).origin!==observedScope.initialContext.origin) throw new Error('POLICY_REFUSED');
            await page.goto(destination,{waitUntil:'domcontentloaded',timeout:30000});
          },
        },
      } : {}),

      onExtraPage(listener: () => void): void {
        extraPageListener = listener;
      },

      observedHosts(): readonly string[] {
        return [...hosts].sort();
      },

      async close(): Promise<string | null> {
        if (closed) return null;
        closed = true;
        const video = page.video();
        // Awaited, because that is what flushes the file (§6.1, Playwright's documented
        // finalization behaviour). A recording nobody waited for is a recording nobody has.
        await context.close();
        await context.browser()?.close();
        if (video === null) return null;
        const produced = await video.path();
        // **One run, one video.** A context records per *page*, so a popup starts a second file
        // even though it is closed on sight. Leaving it in scratch would mean the run produced
        // two recordings and something downstream would have to choose between them — or worse,
        // merge them, which §5.2 forbids outright. The stray files go here, after the close that
        // finalized them, and only ever inside this run's own video directory.
        if (sawExtraPage) await removeStrayRecordings(videoDir, produced);
        return produced;
      },

      async dispose(): Promise<void> {
        if (closed) return;
        closed = true;
        await context.close().catch(() => undefined);
        await context.browser()?.close().catch(() => undefined);
      },
    };
  },
};

/**
 * Dedicated Chromium isolated world: application scripts cannot inspect policy/secrets or replace
 * the collector's builtins/DOM getters. All evaluation sources below are fixed trusted code.
 * Actual Elements and exact-hint resolution stay together in that world; nothing is stamped on
 * the application DOM, and no probe event is dispatched into the application.
 */
export function createBrowserObservationSession(page: Page, config: ObservationConfig): ObservationSession {
  const options = observationOptions(config);
  let cdp: CDPSession | null = null;
  let objectId: string | null = null;
  let generation = 0;
  let closed = false;
  let busy = false;
  let navigation = 0;
  let observedNavigation = -1;
  const privateInventory = new PrivateObservationInventory();
  const assertSessionOpen = (): void => { if (closed) throw new Error('CONTEXT_LOST'); };
  let acquisitionObservation:Observation|null=null;
  const worldName = `checks-observation-${randomUUID()}`;
  const navigated = (frame: Frame) => { if (frame === page.mainFrame()) navigation++; };
  page.on('framenavigated', navigated);
  const initialize = async (): Promise<void> => {
    cdp ??= await page.context().newCDPSession(page);
    if (objectId) {
      try {
        await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { return true; }', returnByValue: true });
        return;
      } catch { objectId = null; }
    }
    const tree = await cdp.send('Page.getFrameTree');
    const world = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName, grantUniveralAccess: false });
    const installed = await cdp.send('Runtime.callFunctionOn', {
      executionContextId: world.executionContextId,
      functionDeclaration: installObservationCollector.toString(),
      arguments: [{ value: options }, { value: privateInventory.snapshot() }], returnByValue: false, objectGroup: worldName,
    });
    if (installed.exceptionDetails || !installed.result.objectId) throw new Error('OBSERVATION_UNAVAILABLE');
    objectId = installed.result.objectId;
  };
  return {
    async observe(maxBytes = options.limits.bytes) {
      if (closed || busy) throw new Error('STALE_OBSERVATION');
      privateInventory.assertLive();
      if (!Number.isInteger(maxBytes) || maxBytes<1 || maxBytes>options.limits.bytes) throw new Error('BUDGET_EXCEEDED');
      if (generation >= 2147483647) throw new Error('BUDGET_EXCEEDED');
      busy = true;
      const before = navigation;
      try {
        await initialize();
        if (!cdp || !objectId) throw new Error('OBSERVATION_UNAVAILABLE');
        const result = await cdp.send('Runtime.callFunctionOn', {
          objectId, functionDeclaration: 'function(identity) { const observation = this.collect(identity); return { observation, inventory: this.privateInventory() }; }',
          arguments: [{ value: { documentId: randomUUID(), generation: ++generation, observedAt: new Date().toISOString(), maxBytes } }], returnByValue: true,
        });
        if (result.exceptionDetails) {
          // Preserve only our data-free codes; CDP exception text never becomes a public error.
          const description = result.exceptionDetails.exception?.description ?? '';
          throw new Error(description.includes('INVALID_UNICODE') ? 'INVALID_UNICODE' : description.includes('SCOPE_DENIED') ? 'SCOPE_DENIED' : 'OBSERVATION_UNAVAILABLE');
        }
        if (before !== navigation) throw new Error('STALE_OBSERVATION');
        observedNavigation = navigation;
        const collected = result.result.value as { observation: Observation; inventory: [string, boolean][] };
        assertSessionOpen();
        privateInventory.merge(collected.inventory);
        const exported=exportObservation(collected.observation,maxBytes);acquisitionObservation=exported.observation;return exported;
      } catch (error) {
        privateInventory.fail();
        const code=error instanceof Error ? error.message : '';
        throw new Error(['INVALID_UNICODE','SCOPE_DENIED','BUDGET_EXCEEDED','STALE_OBSERVATION','CONTEXT_LOST'].includes(code)?code:'OBSERVATION_UNAVAILABLE');
      } finally { busy = false; }
    },
    async acquire(request):Promise<AcquisitionResult>{
      const refused:AcquisitionResult={kind:'REFUSED',code:'TARGET_DRIFT'};
      if(closed||busy||!cdp||!objectId||observedNavigation!==navigation||request.generation!==generation||!acquisitionObservation||request.documentId!==acquisitionObservation.documentId||request.origin!==acquisitionObservation.origin)return refused;
      const before=navigation;
      try{
        const result=await cdp.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(request) { return this.acquire(request); }',arguments:[{value:request}],returnByValue:true});
        assertSessionOpen();if(result.exceptionDetails||before!==navigation)return refused;
        const value:unknown=result.result.value;
        if(typeof value!=='object'||value===null||Array.isArray(value))return refused;const r=value as Record<string,unknown>,keys=Object.keys(r).sort().join(',');
        if((r.kind==='ABSENT'||r.kind==='VISIBILITY_PENDING')&&keys==='kind')return {kind:r.kind};
        if(r.kind==='REFUSED'&&keys==='code,kind'&&['TARGET_DRIFT','READ_REFUSED','POLICY_REFUSED'].includes(String(r.code)))return {kind:'REFUSED',code:r.code as 'TARGET_DRIFT'|'READ_REFUSED'|'POLICY_REFUSED'};
        if(r.kind!=='READY'||keys!=='kind,target'||typeof r.target!=='object'||r.target===null||Array.isArray(r.target))return refused;
        const target=r.target as Record<string,unknown>;
        if(Object.keys(target).sort().join(',')!=='documentId,generation,nodeId'||target.documentId!==request.documentId||target.generation!==request.generation||typeof target.nodeId!=='string'||!acquisitionObservation.nodes.some(n=>n.nodeId===target.nodeId))return refused;
        return {kind:'READY',target:{documentId:request.documentId,generation:request.generation,nodeId:target.nodeId}};
      }catch{return refused;}
    },
    async matches(target, hint) {
      if (closed || busy || !cdp || !objectId || target.generation !== generation || observedNavigation !== navigation) return false;
      const before = navigation;
      try {
        const result = await cdp.send('Runtime.callFunctionOn', {
          objectId, functionDeclaration: 'function(target, hint) { return this.matches(target, hint); }',
          arguments: [{ value: target }, { value: hint }], returnByValue: true,
        });
        return !result.exceptionDetails && result.result.value === true && before === navigation;
      } catch { return false; }
    },
    async withhold(values) {
      assertSessionOpen();
      try {
        privateInventory.merge([...options.knownSecrets,...values].map(value=>[value,true]));
        options.knownSecrets = [...new Set([...options.knownSecrets, ...values])];
        if (cdp && objectId) {
          const result=await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(values) { this.withhold(values); }', arguments: [{ value: values }], returnByValue: true });
          if(result.exceptionDetails)throw new Error('CONTEXT_LOST');
          assertSessionOpen();
        }
      } catch { privateInventory.fail(); throw new Error('CONTEXT_LOST'); }
    },
    async navigate(target, origin, destination) {
      if (closed || busy || !cdp || !objectId || observedNavigation !== navigation) throw new Error('TARGET_CHANGED');
      const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(target, origin, destination) { this.navigate(target, origin, destination); }', arguments: [{ value: target }, { value: origin }, { value: destination }], returnByValue: true });
      if (result.exceptionDetails) throw new Error('TARGET_CHANGED');
      await page.waitForURL(destination, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    },
    async assertPage(target, origin, predicate, expected) {
      if (closed || busy || !cdp || !objectId || observedNavigation !== navigation) throw new Error('TARGET_CHANGED');
      const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(target, origin, predicate, expected) { return this.assertPage(target, origin, predicate, expected); }', arguments: [{ value: target }, { value: origin }, { value: predicate }, { value: expected }], returnByValue: true });
      if (result.exceptionDetails) throw new Error('TARGET_CHANGED');
      return result.result.value === true;
    },
    async pageMatches(target, origin) {
      if (closed || busy || !cdp || !objectId || observedNavigation !== navigation) return false;
      try {
        const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(target, origin) { return this.pageMatches(target, origin); }', arguments: [{ value: target }, { value: origin }], returnByValue: true });
        return !result.exceptionDetails && result.result.value === true;
      } catch { return false; }
    },
    async validateInvocation(invocation) {
      if (closed || busy || !cdp || !objectId || observedNavigation !== navigation) return false;
      try {
        const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(invocation) { return this.validateInvocation(invocation); }', arguments: [{ value: invocation }], returnByValue: true });
        return !result.exceptionDetails && result.result.value === true;
      } catch { return false; }
    },
    async invoke(invocation, control) {
      control?.check();
      const live = (): void => { assertSessionOpen(); control?.check(); };
      const begin = (): void => { live(); if (control?.phase === 'PREPARING') control.beginInvocation(); };
      if (closed || busy || !cdp || !objectId || observedNavigation !== navigation) throw new Error('TARGET_CHANGED');
      const kind = invocation.operation.kind;
      if (kind === 'click' || kind === 'check' || kind === 'uncheck' || kind === 'hover' || kind === 'press') {
        // The retained element lives in the private isolated world. No selector is re-resolved.
        const native = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function(invocation) { return this.nativeTarget(invocation); }', arguments: [{ value: invocation }], returnByValue: false });
        live();
        if (native.exceptionDetails || !native.result.objectId) throw new Error('TARGET_CHANGED');
        const elementId = native.result.objectId;
        const connection = cdp; const collectorId = objectId;
        try {
          await dispatchNativeInput(invocation.operation, {
            async inspect() {
              live();
              const state = await connection.send('Runtime.callFunctionOn', { objectId: collectorId, functionDeclaration: 'function(invocation, element) { if (this.nativeTarget(invocation) !== element) throw new Error("TARGET_CHANGED"); return this.nativeState(invocation); }', arguments: [{ value: invocation }, { objectId: elementId }], returnByValue: true });
              live();
              if (state.exceptionDetails) throw new Error('TARGET_CHANGED');
              return state.result.value as { alreadyChecked: boolean; requiresReveal: boolean };
            },
            async revealAndValidate() {
              const assertOpen = (): void => { live(); };
              assertOpen();
              // One public retained-node scroll, bounded together with two frame checks. No
              // selector lookup, alternate target, repeat scroll or native input retry occurs.
              const reveal = async (): Promise<void> => {
                begin();
                await connection.send('DOM.scrollIntoViewIfNeeded', { objectId: elementId });
                assertOpen();
                const guard = await connection.send('Runtime.callFunctionOn', {
                  objectId: collectorId,
                  functionDeclaration: 'async function(invocation, element) { await new Promise(resolve => requestAnimationFrame(resolve)); if (!this.acceptReveal(invocation, element)) return false; await new Promise(resolve => requestAnimationFrame(resolve)); return this.nativeTarget(invocation) === element; }',
                  arguments: [{ value: invocation }, { objectId: elementId }], returnByValue: true, awaitPromise: true,
                });
                assertOpen();
                if (guard.exceptionDetails || guard.result.value !== true) throw new Error('UNKNOWN_OUTCOME');
              };
              let timer: ReturnType<typeof setTimeout> | undefined;
              const timeout = new Promise<never>((_resolve,reject) => { timer = setTimeout(() => { control?.poison('TIMEOUT'); reject(new Error('UNKNOWN_OUTCOME')); },1000); });
              try { await Promise.race([reveal(),timeout]); } finally { if(timer)clearTimeout(timer); }
            },
            async focusAndValidate() {
              live();
              begin();
              await connection.send('DOM.focus', { objectId: elementId });
              live();
              const guard = await connection.send('Runtime.callFunctionOn', { objectId: collectorId, functionDeclaration: 'function(invocation, element) { return this.nativeTarget(invocation) === element && element.getRootNode().activeElement === element; }', arguments: [{ value: invocation }, { objectId: elementId }], returnByValue: true });
              live();
              if (guard.exceptionDetails || guard.result.value !== true) throw new Error('UNKNOWN_OUTCOME');
            },
            async point() {
              live();
              const guard = await connection.send('Runtime.callFunctionOn', { objectId: collectorId, functionDeclaration: 'function(invocation, element) { if (this.nativeTarget(invocation) !== element) throw new Error("TARGET_CHANGED"); return this.nativePoint(invocation); }', arguments: [{ value: invocation }, { objectId: elementId }], returnByValue: true });
              live();
              if (guard.exceptionDetails) throw new Error('TARGET_CHANGED');
              return guard.result.value as NativePoint;
            },
            async confirmToggle() {
              live();
              const guard = await connection.send('Runtime.callFunctionOn', { objectId: collectorId, functionDeclaration: 'function(invocation, element) { return this.confirmToggle(invocation, element); }', arguments: [{ value: invocation }, { objectId: elementId }], returnByValue: true });
              assertSessionOpen();
              live();
              if (guard.exceptionDetails || guard.result.value !== true) throw new Error('UNKNOWN_OUTCOME');
            },
            async mouse(input) { begin(); await connection.send('Input.dispatchMouseEvent', input); live(); },
            async key(input) { begin(); await connection.send('Input.dispatchKeyEvent', input); live(); },
          });
          begin(); // An already-satisfied toggle is one completed no-op invocation.
          return {};
        } finally { await connection.send('Runtime.releaseObject', { objectId: elementId }).catch(() => undefined); }
      }
      begin();
      const result = await cdp.send('Runtime.callFunctionOn', {
        objectId, functionDeclaration: 'function(invocation) { return this.invoke(invocation); }', arguments: [{ value: invocation }], returnByValue: true,
      }).catch(() => { throw new Error('UNKNOWN_OUTCOME'); });
      live();
      if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception?.description ?? '').includes('POST_FOCUS_CHANGED') ? 'UNKNOWN_OUTCOME' : 'TARGET_CHANGED');
      return result.result.value as GuidedInvocationResult;
    },
    async dispose() {
      closed = true; options.knownSecrets = []; privateInventory.dispose();
      page.off('framenavigated', navigated);
      if (cdp && objectId) await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { this.dispose(); }' }).catch(() => undefined);
      await cdp?.send('Runtime.releaseObjectGroup', { objectGroup: worldName }).catch(() => undefined);
      await cdp?.detach().catch(() => undefined);
      cdp = null; objectId = null;
    },
  };
}

/** Guided launch never records video, hosts, stdout or browser diagnostics. Account setup is
 * intentionally blank-only; production connected-account bootstrap belongs to OBS-007. */
export async function launchGuidedBrowser(config: ObservationConfig, contextId: string, onLost: () => void): Promise<GuidedBrowser> {
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.env.NODE_OPTIONS) throw new Error('DIAGNOSTICS_DENIED');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: [], env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp' } });
  try {
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
  const page = await context.newPage();
  let closed = false;
  context.on('page', extra => { if (extra !== page) { void extra.close().catch(() => undefined); onLost(); } });
  page.on('crash', onLost);
  browser.on('disconnected', () => { if (!closed) onLost(); });
  await context.route('**/*', async route => {
    let allowed = false;
    try { allowed = config.approvedOrigins.includes(new URL(route.request().url()).origin); } catch { /* deny */ }
    try { if (allowed) await route.continue(); else await route.abort(); } catch { if (!closed) onLost(); }
  });
  const cdp = await context.newCDPSession(page);
  const tree = await cdp.send('Page.getFrameTree');
  const world = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: `checks-blank-${randomUUID()}`, grantUniveralAccess: false });
  const blank = await cdp.send('Runtime.evaluate', { expression: 'document', contextId: world.executionContextId, returnByValue: false });
  if (!blank.result.objectId || page.url() !== 'about:blank') { await browser.close(); throw new Error('CONTEXT_LOST'); }
  const blankId = blank.result.objectId;
  let closePromise: Promise<void> | null = null;
  const closeBrowser = async (): Promise<void> => { await browser.close().catch(() => { throw new Error('CONTEXT_LOST'); }); await context.close().catch(() => undefined); };
  const evidence = { kind: 'initialBlank' as const, sessionId: config.sessionId, contextId, creationId: randomUUID(), documentId: randomUUID(), bootstrapId: randomUUID(), url: 'about:blank' as const, origin: null, generation: 0 as const };
  return {
    evidence,
    observations: createBrowserObservationSession(page, config),
    async blankMatches() {
      try { const result = await cdp.send('Runtime.callFunctionOn', { objectId: blankId, functionDeclaration: 'function() { return this === document && location.href === "about:blank" && location.origin === "null"; }', returnByValue: true }); return !result.exceptionDetails && result.result.value === true; } catch { return false; }
    },
    async navigateBlank(destination) {
      if (!config.approvedOrigins.includes(new URL(destination).origin)) throw new Error('POLICY_DENIED');
      const result = await cdp.send('Runtime.callFunctionOn', { objectId: blankId, functionDeclaration: 'function(destination) { if (this !== document || location.href !== "about:blank" || location.origin !== "null") throw new Error("TARGET_CHANGED"); location.assign(destination); }', arguments: [{ value: destination }], returnByValue: true });
      if (result.exceptionDetails) throw new Error('TARGET_CHANGED');
      await page.waitForURL(destination, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    },
    close() { closed = true; closePromise ??= closeBrowser(); return closePromise; },
  };
  } catch {
    const cleanup = async (): Promise<void> => { await browser.close().catch(() => { throw new Error('CONTEXT_LOST'); }); };
    throw new GuidedLaunchFailure(cleanup);
  }
}
