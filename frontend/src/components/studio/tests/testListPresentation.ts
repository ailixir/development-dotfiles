import type { TestLastRunFilter, TestReadiness } from '@/types/studio/studioTypes';
import { LEARNED_READY_LABEL } from '@/components/studio/run/runEnablement';

/**
 * Display vocabulary for the Studio tests list (story 10.46, Track C).
 *
 * Readiness follows the four single-path states of ADR-SC-005 (`TestDto.readiness`). A value
 * outside the four is shown as sent with a neutral tone, so a server change is visible on the list
 * instead of crashing it; the editor's own total mapping (`runEnablement.ts`) stays the place that
 * throws.
 */

export type ReadinessTone = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface ReadinessPresentation {
  label: string;
  tone: ReadinessTone;
  /** One sentence for the chip's tooltip. */
  hint: string;
}

export const READINESS: Readonly<Record<TestReadiness, ReadinessPresentation>> = {
  READY: {
    label: LEARNED_READY_LABEL,
    tone: 'success',
    hint: 'The learned steps match the saved draft, so Run repeats them.',
  },
  UNLEARNED: {
    label: 'Not learned yet',
    tone: 'default',
    hint: 'No learned version matches the saved steps yet.',
  },
  LEARNING: {
    label: 'Learning',
    tone: 'info',
    hint: 'A Run is learning the saved steps right now.',
  },
  NEEDS_RELEARN: {
    label: 'Steps changed',
    tone: 'warning',
    hint: 'A step changed after the steps were learned.',
  },
};

export function readinessFor(status: string): ReadinessPresentation {
  return (
    (READINESS as Record<string, ReadinessPresentation>)[status] ?? {
      label: status,
      tone: 'default',
      hint: 'Readiness reported by the server.',
    }
  );
}

/** The environments a Studio test can target; the Create dialog and the list filter share them. */
export const STUDIO_TEST_ENVIRONMENTS = ['Development', 'Staging', 'UAT', 'Production'] as const;

export const LAST_RUN_FILTER_LABELS: Readonly<Record<TestLastRunFilter, string>> = {
  PASSED: 'Passed',
  FAILED: 'Failed',
  ERROR: 'Error',
  NEVER: 'Never run',
};

/** Maximum test name length, matching the backend column. */
export const TEST_NAME_MAX_LENGTH = 255;
