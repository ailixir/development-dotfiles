/**
 * The seam between the child's run logic and the browser library (AC-1, AC-6a, AC-7).
 *
 * `src/run/childRuntime.ts` is written against this interface and never against Playwright, which
 * is what lets the whole of the child's behaviour — the paired origin read, the evidence
 * vocabulary, the popup refusal, the exit paths — be exercised in the browser-free unit tier
 * (AC-25) while `src/run/browser.ts` proves the same logic against real Chromium in the fixtures
 * tier (AC-18a).
 *
 * There is deliberately **no** `sandbox` field. §9.3 requires `chromiumSandbox: true` and
 * ADR-001 §8 says the image must never add a disabling flag; a seam that could carry the option
 * would be a configuration key for it, which AC-6a forbids outright.
 */

import type { ObservationConfig, ObservationSession } from './observationTypes.js';
import type { Scope } from '../executor/observedOperations.js';
import type {BrowserPreferenceEvidence} from './scratchLayout.js';
import {ObservedRefusal} from '../validator/observedReferencePolicy.js';

export interface BrowserLaunchRequest {
  /** Job-supplied browser name. Only `chromium` is supported in V1. */
  readonly browser: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Explicit recording geometry; never an implicit default (§6.1, AC-7). */
  readonly recording: { readonly width: number; readonly height: number };
  /** The per-run scratch directory. Profile, video and temp output all live under it (AC-22). */
  readonly scratchPath: string;
  readonly observedScope?: Scope;
  /** The runner's navigation whitelist; author-directed navigation must be on it. */
  readonly allowedDomains: readonly string[];
  /** Private continuous admission/start bound, never a job/configuration option. */
  readonly startup?:{readonly deadlineEpochMs:number;readonly signal:AbortSignal};
}

export interface BrowserHandle {
  readonly preferenceEvidence?:BrowserPreferenceEvidence;
  /**
   * The single page of the single context. V1 has exactly one (§5.2).
   *
   * Opaque on purpose: no run-path code drives it any more — the artifact-1 operation adapter that
   * did was deleted by STUDIO-OBS-012A AC-3, and the observed replay reaches the page only through
   * the `observed*` capabilities below. It stays on the handle as the fixtures tier's inspection
   * seam (the real Playwright page, cast where a test needs it).
   */
  readonly page: object;
  observedBlankMatches?(): Promise<boolean>;
  observedInitialContextMatches?(): Promise<boolean>;
  observedStartupReady?():boolean;
  /** Private exact actual app Video capability; never a directory-selected recording. */
  observedAppVideoPath?():Promise<string>;
  /** Optional on browser-free unit fakes; implemented by the real trusted browser. */
  createObservationSession?(config: ObservationConfig): ObservationSession;
  /** What step code runs against (ADR-SC-008 D3.2). Optional only on browser-free unit fakes. */
  readonly stepApi?: StepApi;
  /** Every host the browser issued a request to, deduplicated and bounded (AC-19). */
  observedHosts(): readonly string[];
  /**
   * Closes the context **and awaits it**, which is what flushes the webm (§6.1), then closes the
   * browser. Resolves with the produced recording path, or `null` when none was produced.
   */
  close(): Promise<string | null>;
  /** Last resort on an error path: tears the browser down without waiting for a flush. */
  dispose(): Promise<void>;
}

/** A Playwright Page, structurally: all the popup registry needs of one. */
export interface PageHandle { close(): Promise<void>; isClosed(): boolean }

/**
 * The pages a run opens besides its own. A page that opens while a step runs may be adopted by that step (it awaited the popup);
 * every other new page is closed when the step ends, or at once when no step runs. At most {@link POPUP_CAP} adopted pages are open
 * at any time across the whole run: the pages travel to later steps in `vars`, so the cap is not per step.
 */
export const POPUP_CAP = 4;
export class StepPages {
  private readonly adopted = new Set<PageHandle>();
  private readonly recorded = new Set<PageHandle>();
  private running = false;
  private any = false;
  /** Called for every context 'page' event of a page other than the run's own. */
  opened(page: PageHandle): void {
    this.any = true;
    if (this.running) this.recorded.add(page);
    else void page.close().catch(() => undefined);
  }
  begin(): void { this.running = true; }
  adopt(page: PageHandle): void {
    if (this.adopted.has(page)) return;
    if (this.openAdopted().length >= POPUP_CAP) {
      void page.close().catch(() => undefined);
      throw new ObservedRefusal('POLICY_REFUSED', undefined, true);
    }
    this.adopted.add(page);
  }
  openAdopted(): PageHandle[] { return [...this.adopted].filter(page => !page.isClosed()); }
  async end(): Promise<void> {
    this.running = false;
    const unadopted = [...this.recorded].filter(page => !this.adopted.has(page));
    this.recorded.clear();
    await Promise.all(unadopted.map(page => page.close().catch(() => undefined)));
  }
  /** True once any other page was opened: its recording, if it has one, is deleted when the run closes. */
  get sawOtherPage(): boolean { return this.any; }
}

/** What the step runner needs of the browser: the Playwright objects step code is given and the run's page policy. */
export interface StepApi {
  readonly page: object;
  readonly context: object;
  /** Playwright's `expect`, from the pinned `playwright/test` entry. */
  readonly expect: unknown;
  awaitWhitelistedMainFrame(allowedDomains: readonly string[]): Promise<void>;
  beginStep(): void;
  /**
   * After an effectful step's code: waits up to `navStartMs` for a main-frame navigation to start (or for one that started during the step), then for it to
   * commit and load, all within `maxMs`. Never rejects: a timeout just ends the wait (FIX-25).
   */
  settleNavigation?(maxMs: number): Promise<void>;
  endStep(): Promise<void>;
  adopt(page: object): void;
  adoptedPages(): readonly object[];
}

export interface BrowserFactory {
  launch(request: BrowserLaunchRequest): Promise<BrowserHandle>;
}
/** Unconfirmed cleanup leaves the child alive for the parent's bounded process-tree kill. */
export class BrowserStartupCleanupFailure extends Error {constructor(){super('CONTEXT_LOST');}}
