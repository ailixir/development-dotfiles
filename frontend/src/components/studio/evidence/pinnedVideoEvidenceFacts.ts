import type { VideoStatus } from '@/types/studio/studioTypes';

/**
 * What each `VideoStatus` must tell the reader, and what it must not, written **independently** of
 * `videoEvidenceNarratives.ts` (story 10.16a, AC-2, QA finding TEST-001).
 *
 * @qa rewrote `PROCESSING` to *"No recording exists for this run"* and the story's whole test set
 * stayed green. Every AC-2 assertion read its expected text out of the narratives module, and the
 * contract file only checks that the wordings are distinct and longer than ten characters. That is
 * the eleventh catalogued shape: an expected value imported from the module under test.
 *
 * This file is the second copy, and the copy is the point. **Do not derive these phrases from
 * `videoEvidenceNarratives.ts` to remove the duplication.** A comment cannot stop that refactor, which
 * is the twelfth shape, so `evidencePanel.test.tsx` asserts that this file imports neither the
 * narratives, the panel nor the folder's barrel. It also plants every import form to prove the
 * scanner can see them.
 *
 * Each state has **two slots**, like the panel: the title (the region's accessible name) and the
 * generic statement. A fact is pinned per slot, so a rendering that loses one fact cannot hide behind
 * the other. `deniedClaims` are what a *wrong* narrative for this state would say, most importantly
 * that `PROCESSING` has no recording or failed. They are checked over both slots, together with every
 * other state's required phrases. The phrases are matched case-insensitively.
 */
export interface PinnedVideoEvidenceFacts {
  /** Must appear in the rendered title (the region's accessible name). */
  readonly titlePhrase: string;
  /** Must appear in the rendered generic statement (FAILED/UNAVAILABLE with `video.error: null`). */
  readonly statementPhrase: string;
  /** Must appear in neither slot for this state. */
  readonly deniedClaims: readonly string[];
}

export const PINNED_VIDEO_EVIDENCE_FACTS: Readonly<Record<VideoStatus, PinnedVideoEvidenceFacts>> = {
  PROCESSING: {
    titlePhrase: 'still being produced',
    statementPhrase: 'not ready yet',
    deniedClaims: ['no recording', 'did not produce', 'failed', 'expired', 'cannot be played', 'none will'],
  },
  AVAILABLE: {
    titlePhrase: 'is available',
    statementPhrase: 'play the recording',
    deniedClaims: ['no recording', 'failed', 'expired', 'not ready'],
  },
  FAILED: {
    titlePhrase: 'could not be produced',
    statementPhrase: 'failed',
    deniedClaims: ['still being', 'not ready', 'expired'],
  },
  UNAVAILABLE: {
    titlePhrase: 'no usable recording',
    statementPhrase: 'no usable recording',
    deniedClaims: ['still being', 'not ready', 'expired', 'failed'],
  },
  EXPIRED: {
    titlePhrase: 'expired',
    statementPhrase: 'retention period',
    deniedClaims: ['still being', 'not ready', 'failed', 'no usable'],
  },
};

/** Below this length a pinned phrase stops discriminating. `''` would make every `toContain` true. */
export const MIN_PINNED_VIDEO_PHRASE_LENGTH = 6;
