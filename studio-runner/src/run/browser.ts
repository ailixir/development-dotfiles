import type {InvocationControl} from '../executor/observedReplay.js';
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

import { domainAllowed, OriginNotAllowed } from '../allowedDomains.js';
import { GuidedLaunchFailure, GUIDED_START_BUDGET_MS, GUIDED_START_RESERVE_MS, guidedCloseStages, launchFailureCause } from './guidedBrowser.js';
import type { GuidedBrowser, GuidedLaunchPhase, GuidedLossReason, GuidedRecordingRequest, GuidedStartup } from './guidedBrowser.js';
import { killLaunchTree, survivorsOf } from './tree.js';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page, Frame, CDPSession } from 'playwright';
import { readdir, rm, mkdtemp,realpath,lstat } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';

import type { BrowserFactory, BrowserHandle, BrowserLaunchRequest } from './browserFactory.js';
import {BrowserStartupCleanupFailure} from './browserFactory.js';
import {BootstrapPageGuard,boundedStartup,isAbsoluteStartupTimeout} from './observedBootstrap.js';
import {readVersionPaths} from './versionProbe.js';
import {validateAppVideoPath} from './appVideoOwnership.js';
import { createObservationFlow } from './observationFlow.js';
import { ClosedActionError, closedPageStep } from './closedError.js';
import { loadInjectedSource } from './playwrightEngine.js';
import type { BoundElement, PageLike } from './targetAction.js';
import type { ObservationConfig, ObservationSession } from './observationTypes.js';
import { SCRATCH_SUBDIRECTORIES, prepareBrowserProfile, requireBrowserPreferences,assertEffectiveBrowserPreferences,browserProfileConfinement,releaseBrowserProfile } from './scratchLayout.js';
import type {BrowserPreferenceEvidence} from './scratchLayout.js';

/** Fixed trusted startup probe, before app routing/evidence/secret delivery. No model callback,
 * additional page or arbitrary preference export; restore the required initial blank document. */
async function verifyBrowserPreferences(page:Page,profile:string):Promise<BrowserPreferenceEvidence>{
  const expected=browserProfileConfinement(profile).defaultProfile.path;
  await page.goto('chrome://version/');const {profilePath:path,executablePath:executable}=await readVersionPaths(page);
  if(!path||await realpath(path)!==expected)throw new Error('PROFILE_PREFERENCES_REQUIRED');
  if(!executable||await realpath(executable)!==await realpath(chromium.executablePath()))throw new Error('PROFILE_MISMATCH');
  await page.goto('chrome://prefs-internals/');
  const effective=await page.evaluate(()=>{
    const p=JSON.parse(document.body.innerText) as {credentials_enable_service?:{value?:unknown};autofill?:{profile_enabled?:{value?:unknown};credit_card_enabled?:{value?:unknown}};session?:{restore_on_startup?:{value?:unknown}}};
    return {credentialsEnableService:p.credentials_enable_service?.value,autofillProfileEnabled:p.autofill?.profile_enabled?.value,autofillCreditCardEnabled:p.autofill?.credit_card_enabled?.value,restoreOnStartup:p.session?.restore_on_startup?.value};
  });
  assertEffectiveBrowserPreferences(effective);if(browserProfileConfinement(profile).defaultProfile.path!==expected)throw new Error('PROFILE_PREFERENCES_REQUIRED');await page.goto('about:blank');browserProfileConfinement(profile);
  return {channel:'chromium',browserVersion:page.context().browser()?.version()??'UNKNOWN',activeProfilePath:expected,executablePath:await realpath(executable),effective};
}

function mainDocumentTransition(page: Page): Promise<boolean> {
  const loaded = (): Promise<void> => page.waitForLoadState('domcontentloaded', {timeout: 30000});
  return page.waitForEvent('framenavigated', {predicate: frame => frame === page.mainFrame(), timeout: 30000}).then(loaded).then(() => true, () => false);
}

/**
 * How long the main frame may stay on a host outside the whitelist (an SSO hop, say) before the work
 * that needs the page gives up: learning ends `ORIGIN_NOT_ALLOWED`, a replay step `POLICY_REFUSED`.
 * Replay's own step deadline bounds it further. Nothing is observed or done while the page is away.
 */
export const RETURN_WINDOW_MS = 15_000;

/** The host of the main frame when it is an http(s) page outside the whitelist; `null` when nothing is off-list. */
function offListHost(url: string, allowedDomains: readonly string[]): string | null {
  if (!/^https?:/iu.test(url) || domainAllowed(allowedDomains, url)) return null;
  try { return new URL(url).hostname; } catch { return null; }
}

/**
 * Waits until the main frame is on a whitelisted host again, at most {@link RETURN_WINDOW_MS}.
 * Page-initiated navigations, redirect chains, iframes and subresources may use any host; only the
 * moment the runner needs the page (an observation, a step's guard) requires it back on the list.
 * @throws OriginNotAllowed (host only) when the window ends with the page still off-list.
 */
async function awaitWhitelistedMainFrame(page: Page, allowedDomains: readonly string[], windowMs = RETURN_WINDOW_MS): Promise<void> {
  const deadline = Date.now() + windowMs;
  let waited = false;
  for (;;) {
    const host = offListHost(page.url(), allowedDomains);
    if (host === null) break;
    if (Date.now() >= deadline) throw new OriginNotAllowed(host);
    waited = true;
    await new Promise<void>(resolve => { setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))); });
  }
  // Back on the list: let the document settle before anything reads it.
  if (waited) await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, deadline - Date.now()) }).catch(() => undefined);
}

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
    requireBrowserPreferences(join(request.scratchPath, SCRATCH_SUBDIRECTORIES.profile));

    const context: BrowserContext = await chromium.launchPersistentContext(
      join(request.scratchPath, SCRATCH_SUBDIRECTORIES.profile),
      {
        ...(request.observedScope?{channel:'chromium'}:{}),
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

    const startupDeadline=request.startup?.deadlineEpochMs??Date.now()+30000;
    const cleanupStartup=async():Promise<void>=>{const closing=context.close();const now=Date.now(),deadline=Math.max(now+1,Math.min(startupDeadline,now+5000));await boundedStartup(()=>closing,deadline,undefined,5000);releaseBrowserProfile(join(request.scratchPath,SCRATCH_SUBDIRECTORIES.profile));};
    try {
    let extraPageListener: (() => void) | null = null;
    let sawExtraPage = false;
    const guard=request.observedScope?new BootstrapPageGuard<Page>(opened=>{sawExtraPage=true;void opened.close().catch(()=>undefined);}):undefined;
    if(guard)context.on('page',opened=>{guard.opened(opened);});
    const [first] = context.pages();
    let page:Page;
    if(request.observedScope){if(!first)throw new Error('TARGET_DRIFT');page=first;}else page=first??await context.newPage();
    let preferenceEvidence:BrowserPreferenceEvidence|undefined;
    if(request.observedScope){const deadline=startupDeadline,signal=request.startup?.signal;try{
      if(!guard)throw new Error('TARGET_DRIFT');page=guard.inspectStartup(context.pages());
      const startupVideo=page.video();if(!startupVideo)throw new Error('RECORDING_FAILED');
      preferenceEvidence=await boundedStartup(()=>verifyBrowserPreferences(page,join(request.scratchPath,SCRATCH_SUBDIRECTORIES.profile)),deadline,signal);guard.check();
      await boundedStartup(()=>page.close(),deadline,signal,5000);guard.check();
      const path=await boundedStartup(()=>startupVideo.path(),deadline,signal,5000),root=await realpath(request.scratchPath),directory=await realpath(videoDir),actual=await realpath(path),file=await lstat(path);
      if(directory!==join(root,SCRATCH_SUBDIRECTORIES.video)||(await lstat(videoDir)).isSymbolicLink()||file.isSymbolicLink()||!file.isFile()||dirname(actual)!==directory)throw new Error('RECORDING_FAILED');
      await boundedStartup(()=>startupVideo.delete(),deadline,signal,5000);guard.check();
      if((await readdir(videoDir)).length!==0)throw new Error('RECORDING_FAILED');guard.startupRemoved(context.pages());guard.beginApp();
      page=await boundedStartup(()=>context.newPage(),deadline,signal);guard.appReturned(page,context.pages());
      if(page.url()!=='about:blank')throw new Error('TARGET_DRIFT');
    }catch(error){try{await cleanupStartup();}catch{throw new BrowserStartupCleanupFailure();}throw error;}}

    const observedScope = request.observedScope;
    let blankConnection: CDPSession | null = null;
    let blankObject: string | null = null;
    if (observedScope) {
      const initializeBlank=async():Promise<void>=>{
      blankConnection = await context.newCDPSession(page);
      const tree = await blankConnection.send('Page.getFrameTree');
      const world = await blankConnection.send('Page.createIsolatedWorld', {frameId:tree.frameTree.frame.id,worldName:`checks-replay-blank-${randomUUID()}`,grantUniveralAccess:false});
      const document = await blankConnection.send('Runtime.evaluate',{expression:'document',contextId:world.executionContextId,returnByValue:false});
      blankObject = document.result.objectId ?? null;
      if (!blankObject || page.url() !== 'about:blank') throw new Error('TARGET_DRIFT');
      };
      await boundedStartup(initializeBlank,startupDeadline,request.startup?.signal);
    }
    const blankMatches = async (): Promise<boolean> => {
      if (!blankConnection || !blankObject) return false;
      try { const r = await blankConnection.send('Runtime.callFunctionOn',{objectId:blankObject,functionDeclaration:'function() { return this === document && location.href === "about:blank" && location.origin === "null"; }',returnByValue:true});return !r.exceptionDetails && r.result.value === true; } catch { return false; }
    };
    const approvedDestination = (destination:string):void => {
      const url = new URL(destination);
      if (!domainAllowed(request.allowedDomains, destination) || url.username || url.password) throw new Error('POLICY_REFUSED');
    };
    const hosts = new Set<string>();
    context.on('request', (request_) => {
      if (hosts.size >= MAX_OBSERVED_HOSTS) return;
      const host = hostOf(request_.url());
      if (host !== null) hosts.add(host);
    });

    if(!guard)context.on('page', (opened) => {
      if (opened === page) return;
      // Closed immediately (§5.2, AC-15): V1 drives one page, and execution never continues on
      // the other one. Its recording is dealt with in `close`, below, where the files are
      // finalized and can actually be removed.
      sawExtraPage = true;
      void opened.close().catch(() => undefined);
      extraPageListener?.();
    });

    let disposed=false;
    guard?.check();
    const appVideo=observedScope?page.video():null;
    let appVideoPath:Promise<string>|undefined;

    return {
      ...(preferenceEvidence?{preferenceEvidence}:{}),
      page,

      createObservationSession: (config) => createBrowserObservationSession(page, config),
      ...(observedScope ? {
        observedBlankMatches: blankMatches,
        observedStartupReady(){return guard?.ready(page,context.pages())===true;},
        observedAppVideoPath(){guard?.check();if(!appVideo||!guard?.ready(page,context.pages()))throw new Error('RECORDING_FAILED');appVideoPath??=boundedStartup(()=>appVideo.path(),startupDeadline,request.startup?.signal).then(path=>validateAppVideoPath(request.scratchPath,path));return appVideoPath;},
        async observedInitialContextMatches(){guard?.check();return observedScope.initialContext.kind==='initialBlank'?blankMatches():new URL(page.url()).origin===observedScope.initialContext.origin;},
        async observedWait(strategy:'load'|'domcontentloaded'|'networkidle',timeoutMs:number){await closedPageStep(()=>page.waitForLoadState(strategy,{timeout:timeoutMs}));},
        observedNavigateBlank(destination:string, control?:InvocationControl) { return closedPageStep(async function (): Promise<void> {
          const reached = mainDocumentTransition(page);
          control?.check();
          approvedDestination(destination);
          if (!blankConnection || !blankObject || !await blankMatches()) throw new Error('TARGET_DRIFT');
          control?.check();
          control?.beginInvocation();
          const r=await blankConnection.send('Runtime.callFunctionOn',{objectId:blankObject,functionDeclaration:'function(destination) { if (this !== document || location.href !== "about:blank" || location.origin !== "null") throw new Error("TARGET_CHANGED"); location.assign(destination); }',arguments:[{value:destination}],returnByValue:true});
          control?.check();
          if (r.exceptionDetails) throw new Error('TARGET_DRIFT');
          if (!await reached) throw new Error('TARGET_DRIFT');
          control?.check();
        }); },
      } : {}),

      onExtraPage(listener: () => void): void {
        extraPageListener = listener;
        guard?.subscribe(listener);
      },

      observedHosts(): readonly string[] {
        return [...hosts].sort();
      },

      async close(): Promise<string | null> {
        if (disposed) return null;
        const video = observedScope?appVideo:page.video();
        // Awaited, because that is what flushes the file (§6.1, Playwright's documented
        // finalization behaviour). A recording nobody waited for is a recording nobody has.
        await context.close();
        await context.browser()?.close();disposed=true;releaseBrowserProfile(join(request.scratchPath,SCRATCH_SUBDIRECTORIES.profile));
        if (video === null) return null;
        const produced = await video.path();
        if(observedScope){appVideoPath??=Promise.resolve(validateAppVideoPath(request.scratchPath,produced));if(validateAppVideoPath(request.scratchPath,produced)!==await appVideoPath)throw new Error('RECORDING_FAILED');}
        // **One run, one video.** A context records per *page*, so a popup starts a second file
        // even though it is closed on sight. Leaving it in scratch would mean the run produced
        // two recordings and something downstream would have to choose between them — or worse,
        // merge them, which §5.2 forbids outright. The stray files go here, after the close that
        // finalized them, and only ever inside this run's own video directory.
        if (sawExtraPage && !observedScope) await removeStrayRecordings(videoDir, produced);
        return produced;
      },

      async dispose(): Promise<void> {
        if (disposed) return;
        try{await context.close();await context.browser()?.close();disposed=true;releaseBrowserProfile(join(request.scratchPath,SCRATCH_SUBDIRECTORIES.profile));}catch{if(observedScope)throw new BrowserStartupCleanupFailure();}
      },
    };
    }catch(error){if(error instanceof BrowserStartupCleanupFailure)throw error;try{await cleanupStartup();}catch{throw new BrowserStartupCleanupFailure();}throw error;}
  },
};

/**
 * The observation session of a guided or replay page: the Playwright side only. Everything that observes, prepares, resolves or
 * acts is `observationFlow.ts` (no Playwright import, unit-tested with fakes); this file supplies the real Page, a CDP session on it,
 * the main-frame navigation counter and the whitelist wait. The page-state program and WI-2's engine run in the same dedicated
 * isolated world `checks-observation-<uuid>`: application scripts cannot inspect policy or secrets, and nothing is stamped on the
 * application DOM.
 */
export function createBrowserObservationSession(page: Page, config: ObservationConfig): ObservationSession {
  return createObservationFlow({
    // A Playwright Page satisfies PageLike except for the parameter type of Locator.and (a real Locator); targetAction only ever passes
    // locators built from this same page, so the structural type is kept narrow and the one difference is bridged here.
    page: page as unknown as PageLike,
    newCdp: () => page.context().newCDPSession(page),
    inspectBoundElement: bound => inspectCapturedElement(page, bound),
    onNavigation(listener) {
      const navigated = (frame: Frame): void => { if (frame === page.mainFrame()) listener(); };
      page.on('framenavigated', navigated);
      return () => { page.off('framenavigated', navigated); };
    },
    awaitWhitelistedMainFrame: allowedDomains => awaitWhitelistedMainFrame(page, allowedDomains),
  }, config);
}

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike => {
  if (typeof value !== 'object' || value === null) throw new ClosedActionError('TARGET_CHANGED');
  return value as RecordLike;
};
const callable = (value: unknown): ((...args: unknown[]) => unknown) => {
  if (typeof value !== 'function') throw new ClosedActionError('TARGET_CHANGED');
  return value as (...args: unknown[]) => unknown;
};

/** No public ElementHandle.evaluate/getProperty, adoption, DOM mutation, query or action. */
export async function inspectCapturedElement(
  page: unknown,
  captured: BoundElement,
): Promise<number> {
  try {
    // Verify the unchanged exact bundle/version before touching the trusted private mapping.
    loadInjectedSource();
    const apiPage = record(page), apiHandle = record(captured);
    const connection = record(apiPage._connection);
    if (apiHandle._connection !== connection) throw new ClosedActionError('TARGET_CHANGED');
    const toImpl = callable(connection.toImpl);
    const implPage = record(toImpl.call(connection, page));
    const mainFrame = callable(apiPage.mainFrame);
    const apiFrame = mainFrame.call(page);
    const implFrame = record(toImpl.call(connection, apiFrame));
    const implHandle = record(toImpl.call(connection, captured));
    const context = record(implHandle._context);
    const delegate = record(context.delegate), client = record(delegate._client);
    const send = callable(client.send), currentContext = callable(implFrame.existingContext);
    const objectId = implHandle._objectId;
    if (typeof objectId !== 'string' || objectId.length === 0) throw new ClosedActionError('TARGET_CHANGED');
    const live = (): void => {
      if (apiPage._connection !== connection || apiHandle._connection !== connection
        || toImpl.call(connection, page) !== implPage || toImpl.call(connection, captured) !== implHandle
        || mainFrame.call(page) !== apiFrame || toImpl.call(connection, apiFrame) !== implFrame
        || implHandle.__elementhandle !== true || implHandle._disposed !== false
        || implHandle._page !== implPage || implHandle._frame !== implFrame
        || implHandle._context !== context || currentContext.call(implFrame, 'main') !== context
        || implHandle._objectId !== objectId || context.delegate !== delegate || delegate._client !== client) {
        throw new ClosedActionError('TARGET_CHANGED');
      }
    };
    live();
    const response = record(await send.call(client, 'DOM.describeNode', { objectId }));
    live();
    const backendNodeId = record(response.node).backendNodeId;
    if (typeof backendNodeId !== 'number' || !Number.isSafeInteger(backendNodeId) || backendNodeId <= 0) {
      throw new ClosedActionError('TARGET_CHANGED');
    }
    return backendNodeId;
  } catch {
    // Neither raw protocol errors, page text, attributes, object IDs nor causes escape.
    throw new ClosedActionError('TARGET_CHANGED');
  }
}

/** How long the hard teardown waits for an abandoned launch that has already left a process behind to settle. */
const LATE_LAUNCH_GRACE_MS = 1000;

/**
 * Guided launch begins in a proven blank document with a private persistent profile.
 *
 * STUDIO-OBS-013 AC-1: with a {@link GuidedRecordingRequest} the same persistent context is a
 * recorded context (`recordVideo` at context creation, explicit size, exactly as replay records).
 * The evidence directory is the caller's, outside this scratch directory, so `close()` (which
 * disposes scratch) never deletes the finalized webm before the caller's upload attempt.
 */
export async function launchGuidedBrowser(config: ObservationConfig, contextId: string, onLost: (reason?: GuidedLossReason) => void, recording?: GuidedRecordingRequest, startup?: GuidedStartup): Promise<GuidedBrowser> {
  if (process.env.DEBUG || process.env.PWDEBUG || process.env.NODE_DEBUG || process.env.NODE_OPTIONS) throw new Error('DIAGNOSTICS_DENIED');
  // REL-001/D4: the whole start has one deadline. A direct caller without a budget still gets the default one.
  const deadline = startup?.deadlineEpochMs ?? Date.now() + GUIDED_START_BUDGET_MS;
  const signal = startup?.signal;
  const bounded = <T,>(work: () => Promise<T>): Promise<T> => boundedStartup(work, deadline, signal);
  // Playwright's own `timeout` below ends its launch progress here; a Chrome it has not spawned by then is never spawned.
  let backstopAt = deadline + GUIDED_START_RESERVE_MS;
  const scratchDirectory = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'checks-guided-'));
  let context:BrowserContext|undefined;
  let launching:Promise<BrowserContext>|undefined;
  let closed = false;
  let gracefulStarted = false;
  let phase:GuidedLaunchPhase='PROFILE';
  let preparedProfile=join(scratchDirectory,SCRATCH_SUBDIRECTORIES.profile);
  // Run once: the graceful close, the hard teardown and a failed launch's cleanup can all reach it (KL-015-D5).
  let scratchDisposal:Promise<void>|null=null;
  const disposeScratchOnce=async():Promise<void>=>{releaseBrowserProfile(preparedProfile);await rm(scratchDirectory,{recursive:true,force:true});};
  const disposeScratch=():Promise<void>=>scratchDisposal??=disposeScratchOnce();
  try {
  const profile = prepareBrowserProfile(scratchDirectory);preparedProfile=profile;requireBrowserPreferences(profile);
  phase = 'PROCESS';
  // `timeout` is only a backstop that ends Playwright's own progress; it fires after the runner deadline, so the reported cause is the runner's.
  const backstopMs = Math.max(1, deadline - Date.now() + GUIDED_START_RESERVE_MS);
  backstopAt = Date.now() + backstopMs;
  const starting = chromium.launchPersistentContext(profile, { channel:'chromium',headless: true, handleSIGINT: false, handleSIGTERM: false, chromiumSandbox: true, args: [], acceptDownloads: false, serviceWorkers: 'block', timeout: backstopMs, ...(recording ? { recordVideo: { dir: recording.dir, size: { width: recording.size.width, height: recording.size.height } } } : {}), env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: scratchDirectory } });
  launching = starting;
  context = await bounded(() => starting);
  const live = context;
  const browser = context.browser();
  let page = context.pages()[0] ?? await bounded(() => live.newPage());
  let video = recording ? page.video() : null;
  let preferenceEvidence:BrowserPreferenceEvidence;
  if (recording && video) {
    // AR-QA SEC-001: replay's startup sequence (observedScope, above). The chrome:// probe is
    // recorded only on the startup page; that page is closed and its video deleted before the app
    // page exists, so no probe frame reaches the evidence. Any anomaly fails the launch closed.
    const startupPage = page, startupVideo = video;
    phase = 'PROBE';
    preferenceEvidence = await bounded(() => verifyBrowserPreferences(startupPage, profile));
    phase = 'STARTUP_PAGE';
    const closeStartupPage = async (): Promise<void> => {
      await startupPage.close();
      const path = await startupVideo.path(), directory = await realpath(recording.dir), actual = await realpath(path), file = await lstat(path);
      if ((await lstat(recording.dir)).isSymbolicLink() || file.isSymbolicLink() || !file.isFile() || dirname(actual) !== directory) throw new Error('RECORDING_FAILED');
      await startupVideo.delete();
      if ((await readdir(recording.dir)).length !== 0) throw new Error('RECORDING_FAILED');
    };
    await bounded(closeStartupPage);
    phase = 'APP_PAGE';
    page = await bounded(() => live.newPage());
    if (page.url() !== 'about:blank') throw new Error('TARGET_DRIFT');
    // Recording-context readiness: the one ADR-002 §11.6 origin instant, after the startup probe
    // recording is deleted and the fresh app page exists (replay semantics, AR-QA SEC-001).
    video = page.video();
    recording.ready(video !== null);
  } else {
    // Unrecorded launch, or a recorder fault (no video on the page): the probe stays on the single page.
    recording?.ready(false);
    phase = 'PROBE';
    const probePage = page;
    preferenceEvidence = await bounded(() => verifyBrowserPreferences(probePage, profile));
  }
  let extraPageListener: (() => void) | null = null;
  context.on('page', extra => { if (extra !== page) { void extra.close().catch(() => undefined); extraPageListener?.(); onLost('EXTRA_PAGE'); } });
  page.on('crash', () => { if (!closed) onLost('PAGE_CRASH'); });
  browser?.on('disconnected', () => { if (!closed) onLost('BROWSER_DISCONNECTED'); });
  const hosts = new Set<string>();
  context.on('request', request_ => { if (hosts.size >= MAX_OBSERVED_HOSTS) return; const host = hostOf(request_.url()); if (host !== null) hosts.add(host); });
  phase = 'BLANK_DOCUMENT';
  const blankPage = page;
  const cdp = await bounded(() => live.newCDPSession(blankPage));
  const tree = await bounded(() => cdp.send('Page.getFrameTree'));
  const world = await bounded(() => cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: `checks-blank-${randomUUID()}`, grantUniveralAccess: false }));
  const blank = await bounded(() => cdp.send('Runtime.evaluate', { expression: 'document', contextId: world.executionContextId, returnByValue: false }));
  // KL-015-D5: no graceful close here. The failed launch takes the hard teardown below, which is bounded; a graceful close of a browser that is already misbehaving is what hangs.
  if (!blank.result.objectId || page.url() !== 'about:blank') throw new Error('CONTEXT_LOST');
  const blankId = blank.result.objectId;
  const acquired=context;
  // KL-015-D5 rule D5-1: a graceful close bounded by GUIDED_CLOSE_GRACE_MS, then always this launch's hard teardown. `closed` is
  // set first so the browser's own disconnect, which the kill causes, is not reported as a loss.
  const stages = guidedCloseStages({ graceful: () => { gracefulStarted = true; return acquired.close(); }, hard: () => hardTeardown(acquired), onClosing: () => { closed = true; } });
  const evidence = { kind: 'initialBlank' as const, sessionId: config.sessionId, contextId, creationId: randomUUID(), documentId: randomUUID(), bootstrapId: randomUUID(), url: 'about:blank' as const, origin: null, generation: 0 as const };
  const blankMatches = async (): Promise<boolean> => {
    try { const result = await cdp.send('Runtime.callFunctionOn', { objectId: blankId, functionDeclaration: 'function() { return this === document && location.href === "about:blank" && location.origin === "null"; }', returnByValue: true }); return !result.exceptionDetails && result.result.value === true; } catch { return false; }
  };
  const navigateBlank = (destination: string, control?: InvocationControl): Promise<void> => closedPageStep(async function (): Promise<void> {
    const reached = mainDocumentTransition(page);
    control?.check();
    if (!domainAllowed(config.allowedDomains, destination)) throw new Error('POLICY_DENIED');
    control?.beginInvocation();
    const result = await cdp.send('Runtime.callFunctionOn', { objectId: blankId, functionDeclaration: 'function(destination) { if (this !== document || location.href !== "about:blank" || location.origin !== "null") throw new Error("TARGET_CHANGED"); location.assign(destination); }', arguments: [{ value: destination }], returnByValue: true });
    control?.check();
    if (result.exceptionDetails) throw new Error('TARGET_CHANGED');
    if (!await reached) throw new Error('TARGET_CHANGED');
    control?.check();
  });
  const close = stages.close;
  // The recorder outlives the hard stage on purpose (see `hardTeardown`). Wait for it to exit by itself, bounded; past the bound it is killed.
  const finalizeRecording = async (boundMs: number): Promise<boolean> => {
    if (!recording) return false;
    if (await stages.gracefulFulfilledWithin(boundMs)) return true;
    try { const killed = killLaunchTree(await launchMarkers(recording.dir)); await survivorsOf([...killed], 500); } catch { /* the settlement reports a salvaged prefix either way */ }
    return false;
  };
  // Valid after close: Playwright finalizes the webm when the context closes (§6.1).
  const recordedVideo = async (): Promise<string | null> => { if (!video) return null; try { return await video.path(); } catch { return null; } };
  // AC-1 parity: the recorded handle type the observed replay adapter consumes, same page/recording.
  const handle: BrowserHandle = {
    page,
    createObservationSession: (sessionConfig) => createBrowserObservationSession(page, sessionConfig),
    observedBlankMatches: blankMatches,
    observedInitialContextMatches: blankMatches,
    observedStartupReady: () => !closed,
    async observedWait(strategy, timeoutMs) { await closedPageStep(() => page.waitForLoadState(strategy, { timeout: timeoutMs })); },
    observedNavigateBlank: navigateBlank,
    onExtraPage(listener) { extraPageListener = listener; },
    observedHosts: () => [...hosts].sort(),
    async close() { await close(); return recordedVideo(); },
    async dispose() { await close().catch(() => undefined); },
  };
  return {
    preferenceEvidence,
    evidence,
    scratchDirectory,
    observations: createBrowserObservationSession(page, config),
    blankMatches,
    navigateBlank: destination => navigateBlank(destination),
    close,
    terminate: stages.terminate,
    orderlyClosed: stages.orderlyClosed,
    recordedVideo,
    finalizeRecording,
    handle,
  };
  } catch(error) {
    const acquired=context;
    // REL-001/D4 and KL-015-D5 rule D5-1: a launch that failed, whatever the reason (the deadline, a stop, or an error inside
    // it), has run no step and has no recording to finish, and a graceful close is what hangs on a wedged browser. It always
    // takes the hard teardown: kill only this launch's own processes, check they are gone, then clear scratch. That bounds the
    // non-deadline failure too (path (iii)); the graceful close this replaced waited on Playwright's own 30 s.
    closed=true;
    let teardown:Promise<void>|null=null;
    const hardClose=():Promise<void>=>teardown??=hardTeardown(acquired);
    const settled=hardClose().then(()=>undefined,()=>undefined);
    // Past the deadline, or stopped: reject now, the runtime waits for the teardown through `close`. Any other failure rejects once the
    // teardown has settled, so a launch that rejects has already cleared its scratch (its `close` is then only the memo of that outcome).
    if(signal?.aborted!==true&&!isAbsoluteStartupTimeout(error,deadline)&&Date.now()<deadline)await settled;
    // A wait the signal ended says CANCELLED; the abort reason says whether that was the deadline or a stop. Any other error is the cause as it is.
    throw new GuidedLaunchFailure(hardClose,launchFailureCause(error,signal),phase);
  }
  async function hardTeardown(acquired:BrowserContext|undefined):Promise<void>{
    // After a graceful stage was started, the recorder is spared: Playwright's ffmpeg names `recording.dir` in its argv, and a SIGKILL at the
    // grace deadline leaves a webm with no Duration and no Cues (Chrome: duration Infinity). `finalizeRecording` waits for it, bounded, then kills it.
    // Every other teardown (a start that failed, `terminate` alone) has no recording to finish and kills it with the rest, as before.
    const markers=await launchMarkers(...(gracefulStarted?[scratchDirectory]:[scratchDirectory,recording?.dir]));
    // Throws when the process table cannot show this worker: "nothing to kill" must never mean "could not look".
    const seen=new Set<number>(killLaunchTree(markers));
    // An abandoned launch may still hand back a context, or spawn its Chrome, after that first listing. Where the
    // listing found something the launch fails by itself within a moment, so a second of grace is enough. Where it
    // found nothing the Chrome may simply not exist yet: wait for the launch to settle, but no later than Playwright's
    // own backstop, after which it spawns nothing more. The slot stays held for as long as this takes.
    if(!acquired&&launching){
      const waitMs=seen.size===0?Math.max(LATE_LAUNCH_GRACE_MS,backstopAt-Date.now()):LATE_LAUNCH_GRACE_MS;
      let timer:ReturnType<typeof setTimeout>|undefined;
      const late=await Promise.race([launching.then(value=>value,()=>undefined),new Promise<undefined>(resolve=>{timer=setTimeout(()=>{resolve(undefined);},waitMs);})]);
      if(timer)clearTimeout(timer);
      if(late)await boundedStartup(()=>late.close(),Date.now()+1000,undefined,1000).catch(()=>undefined);
    }
    // Once more, for a Chrome that spawned after the first listing.
    for(const pid of killLaunchTree(markers))seen.add(pid);
    if((await survivorsOf([...seen],500)).length>0)throw new Error('CONTEXT_LOST');
    await disposeScratch();
  }
}

/** The launch's own absolute paths, as written and as resolved, for matching its children by command line. */
async function launchMarkers(...paths:(string|undefined)[]):Promise<string[]>{
  const out=new Set<string>();
  for(const path of paths){if(!path)continue;out.add(path);try{out.add(await realpath(path));}catch{/* The path is gone or unreadable; the written form still matches. */}}
  return [...out];
}
