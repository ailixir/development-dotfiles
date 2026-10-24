import type { GuidedBrowser, GuidedLossReason, GuidedRecordingRequest, GuidedStartup } from './guidedBrowser.js';
import type { Page } from 'playwright';
import type { BrowserFactory } from './browserFactory.js';
import type { ObservationConfig, ObservationSession } from './observationTypes.js';
export declare const playwrightBrowserFactory: BrowserFactory;
/**
 * Dedicated Chromium isolated world: application scripts cannot inspect policy/secrets or replace
 * the collector's builtins/DOM getters. All evaluation sources below are fixed trusted code.
 * Actual Elements and exact-hint resolution stay together in that world; nothing is stamped on
 * the application DOM, and no probe event is dispatched into the application.
 */
export declare function createBrowserObservationSession(page: Page, config: ObservationConfig): ObservationSession;
/**
 * Guided launch begins in a proven blank document with a private persistent profile.
 *
 * STUDIO-OBS-013 AC-1: with a {@link GuidedRecordingRequest} the same persistent context is a
 * recorded context (`recordVideo` at context creation, explicit size, exactly as replay records).
 * The evidence directory is the caller's, outside this scratch directory, so `close()` (which
 * disposes scratch) never deletes the finalized webm before the caller's upload attempt.
 */
export declare function launchGuidedBrowser(config: ObservationConfig, contextId: string, onLost: (reason?: GuidedLossReason) => void, recording?: GuidedRecordingRequest, startup?: GuidedStartup): Promise<GuidedBrowser>;
