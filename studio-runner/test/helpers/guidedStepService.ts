/**
 * The runtime-facing {@link GuidedBrowser} over in-process fakes (SC008-E15): the unit tier's stand-in for the per-session child.
 *
 * The runtime no longer runs steps or touches the observation session itself: it asks a `GuidedBrowser` (in production the proxy of a child
 * process). This helper builds one from the same parts the tests always had (a fake observation session, a fake page host, close hooks) by
 * putting the SAME step service the child serves (`createGuidedStepService`) in front of them, so `performStep`, the secret hook and the
 * secret evidence run exactly as they do in the child, without a process or a browser. The fence is requested through the `onFence` hook
 * the runtime passes, as the proxy would pass it after the child's request.
 */
import { TEST_DOMAINS } from './allowedDomains.js';
import type { GuidedBrowser, GuidedDocumentTarget, GuidedObservationPort } from '../../src/run/guidedBrowser.js';
import { createGuidedStepService } from '../../src/run/guidedChildService.js';
import type { GuidedStepService } from '../../src/run/guidedChildService.js';
import type { BrowserHandle } from '../../src/run/browserFactory.js';
import type { ExecutionEvidence } from '../../src/guided/types.js';
import type { ObservationSession } from '../../src/run/observationTypes.js';

export interface InProcessBrowserParts {
  readonly evidence: ExecutionEvidence;
  readonly preferenceEvidence?: GuidedBrowser['preferenceEvidence'];
  readonly scratchDirectory?: string;
  /** The observation session, as the child would hold it. */
  readonly observations: ObservationSession;
  /** Whether the page still is the blank bootstrap document. Defaults to true. */
  readonly blankMatches?: () => Promise<boolean>;
  /** The page host step code runs against. Without one a step is refused CONTEXT_LOST. */
  readonly handle?: BrowserHandle;
  readonly close: () => Promise<void>;
  readonly terminate: () => Promise<void>;
  readonly orderlyClosed: () => boolean;
  readonly recordedVideo?: () => Promise<string | null>;
  readonly finalizeRecording?: (boundMs: number) => Promise<boolean>;
  /** The navigation whitelist of the step service. Defaults to the unit tier's. */
  readonly allowedDomains?: readonly string[];
  /** The secret hook's test seam (formerly a runtime option): called with the value after the fence, before the trusted write. */
  readonly beforeSecretFill?: (value: string) => void;
}

/** The browser, plus the blank-document probe the tests script (the runtime reaches it through `observations.current`). */
export type InProcessBrowser = GuidedBrowser & { readonly blankMatches: () => Promise<boolean> };

export function inProcessBrowser(parts: InProcessBrowserParts): InProcessBrowser {
  const session = parts.observations;
  const blankMatches = parts.blankMatches ?? ((): Promise<boolean> => Promise.resolve(true));
  let service: GuidedStepService | null = null;
  const steps = (): GuidedStepService => {
    const stepApi = parts.handle?.stepApi;
    if (stepApi === undefined) throw new Error('CONTEXT_LOST');
    return service ??= createGuidedStepService({ stepApi, session }, {
      allowedDomains: parts.allowedDomains ?? TEST_DOMAINS,
      // Read per call: the unit tier's fake clocks replace Date after the browser is built.
      now: () => Date.now(),
      ...(parts.beforeSecretFill === undefined ? {} : { beforeSecretFill: parts.beforeSecretFill }),
    });
  };
  const observations: GuidedObservationPort = {
    current: (target: GuidedDocumentTarget) => target.kind === 'blank'
      ? blankMatches()
      : Promise.resolve(session.documentCurrent({ documentId: target.documentId, generation: target.generation }, target.origin)),
    observe: (maxBytes, settle, focus, deadlineMs) => session.observe(maxBytes, settle, focus, deadlineMs),
    withhold: async values => {
      if (session.withhold === undefined) throw new Error('CONTEXT_LOST');
      await session.withhold(values);
    },
    commitCapture: value => { session.commitCapture(value); return Promise.resolve(); },
  };
  return {
    ...(parts.preferenceEvidence === undefined ? {} : { preferenceEvidence: parts.preferenceEvidence }),
    ...(parts.scratchDirectory === undefined ? {} : { scratchDirectory: parts.scratchDirectory }),
    evidence: parts.evidence,
    observations,
    blankMatches,
    step: async (request, hooks) => { await Promise.resolve(); return steps().step(request, hooks.onFence); },
    abort: () => { service?.abort(); },
    close: parts.close,
    terminate: parts.terminate,
    orderlyClosed: parts.orderlyClosed,
    ...(parts.recordedVideo === undefined ? {} : { recordedVideo: parts.recordedVideo }),
    ...(parts.finalizeRecording === undefined ? {} : { finalizeRecording: parts.finalizeRecording }),
  };
}
