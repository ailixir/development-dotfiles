import type { InvocationControl } from '../executor/observedReplay.js';
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
import type { BrowserPreferenceEvidence } from './scratchLayout.js';
export interface BrowserLaunchRequest {
    /** Job-supplied browser name. Only `chromium` is supported in V1. */
    readonly browser: string;
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
    /** Explicit recording geometry; never an implicit default (§6.1, AC-7). */
    readonly recording: {
        readonly width: number;
        readonly height: number;
    };
    /** The per-run scratch directory. Profile, video and temp output all live under it (AC-22). */
    readonly scratchPath: string;
    readonly observedScope?: Scope;
    /** Private continuous admission/start bound, never a job/configuration option. */
    readonly startup?: {
        readonly deadlineEpochMs: number;
        readonly signal: AbortSignal;
    };
}
export interface BrowserHandle {
    readonly preferenceEvidence?: BrowserPreferenceEvidence;
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
    observedStartupReady?(): boolean;
    /** Private exact actual app Video capability; never a directory-selected recording. */
    observedAppVideoPath?(): Promise<string>;
    observedWait?(strategy: 'load' | 'domcontentloaded' | 'networkidle', timeoutMs: number): Promise<void>;
    observedNavigateBlank?(destination: string, control?: InvocationControl): Promise<void>;
    /** Optional on browser-free unit fakes; implemented by the real trusted browser. */
    createObservationSession?(config: ObservationConfig): ObservationSession;
    /**
     * Fires when the context opens a page other than its single page — a popup or `window.open`.
     *
     * The handle closes the extra page itself; the callback exists so the run can refuse rather
     * than continue against a page the recording no longer follows (AC-15).
     */
    onExtraPage(listener: () => void): void;
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
export interface BrowserFactory {
    launch(request: BrowserLaunchRequest): Promise<BrowserHandle>;
}
/** Unconfirmed cleanup leaves the child alive for the parent's bounded process-tree kill. */
export declare class BrowserStartupCleanupFailure extends Error {
    constructor();
}
