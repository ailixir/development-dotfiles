import type { ExecutionEvidence } from '../guided/types.js';
import type { ObservationSession } from './observationTypes.js';
import type {BrowserPreferenceEvidence} from './scratchLayout.js';

/** Private capability; instantiated only in the actual guided worker. */
export interface GuidedBrowser {
  readonly preferenceEvidence?:BrowserPreferenceEvidence;
  readonly scratchDirectory?: string;
  readonly evidence: ExecutionEvidence;
  readonly observations: ObservationSession;
  readonly blankMatches: () => Promise<boolean>;
  readonly navigateBlank: (destination: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

/** A partially created browser still needs confirmed cleanup before capacity can be released. */
export class GuidedLaunchFailure extends Error {
  constructor(readonly close: () => Promise<void>) { super('CONTEXT_LOST'); }
}
