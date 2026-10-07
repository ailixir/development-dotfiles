import type { CompileStatus, TestDto, TestLastRunFilter } from '@/types/studio/studioTypes';

/**
 * Display vocabulary for the Studio tests list (story 10.46, Track C).
 *
 * Readiness follows the five `compileStatus` states of architecture §4.2 with the same meaning the
 * editor's narratives give them (`compileStateNarratives.ts`). A value outside the five is shown as
 * sent with a neutral tone, so a server change is visible on the list instead of crashing it; the
 * editor's own total mappings stay the place that throws.
 */

export type ReadinessTone = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface ReadinessPresentation {
  label: string;
  tone: ReadinessTone;
  /** One sentence for the chip's tooltip. */
  hint: string;
}

export const READINESS: Readonly<Record<CompileStatus, ReadinessPresentation>> = {
  READY: {
    label: 'Ready to run',
    tone: 'success',
    hint: 'A confirmed revision of this draft is runnable.',
  },
  AWAITING_CONFIRMATION: {
    label: 'Needs confirmation',
    tone: 'warning',
    hint: 'A translation is waiting for your review and confirmation in the editor.',
  },
  COMPILING: {
    label: 'Translating',
    tone: 'info',
    hint: 'The saved steps are being translated right now.',
  },
  NEEDS_REVISION: {
    label: 'Needs changes',
    tone: 'error',
    hint: 'Some steps could not be made runnable. Open the test to see why.',
  },
  STALE: {
    label: 'Not translated',
    tone: 'default',
    hint: 'The saved steps have not been translated yet. Running the test translates them first.',
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

export type LastRunOutcome = NonNullable<TestDto['lastRunStatus']>;

/** Maximum test name length, matching the backend column. */
export const TEST_NAME_MAX_LENGTH = 255;

/** The editor route for a test; a real link so middle-click and new-tab work. */
export const testHref = (id: string): string => `/checks/studio/${id}`;
