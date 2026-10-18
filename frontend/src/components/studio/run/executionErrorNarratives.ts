import {
  EXECUTION_ERROR_CODES,
  type ExecutionErrorCode,
  type ExecutionSnapshot,
  type ReplayFailure,
  type TestDetailDto,
} from '@/types/studio/studioTypes';

/**
 * What a terminal `ERROR` means, per code (story 10.11a, AC-6).
 *
 * Until this story, `errorCode` was rendered **nowhere**: it existed in the type, in ten fixtures
 * and in one contract assertion, and a terminal `ERROR` reached the user as the word "ERROR".
 * That is also why ADR-002 §15.5 could record the frontend union's drift as having no runtime
 * effect — nothing narrowed on it. This module is the narrowing, and AC-5's set assertion is what
 * keeps it honest in both directions.
 *
 * **Nothing here is invented.** Every `browserClaim` and every `remedyOwner` is the document's own
 * per-code table in `components.schemas.ExecutionErrorCode.description`, reworded for a reader and
 * not for a machine. The two facts are separated because they are the two axes the document itself
 * says the codes divide on: *"what a caller may conclude about the browser, and … who can clear the
 * condition"*. None is a synonym for another, so none of them may be collapsed into
 * "something went wrong". `CANCELLED` (ADR-002 §29) is the one a person caused on purpose; it is
 * rendered as a statement rather than as a failure, and offers no re-run because nothing about the
 * run needs clearing.
 *
 * **`offersRerun` is a rule, not a convenience.** Exactly three codes — `DISPATCH_FAILED`,
 * `START_TIMEOUT` and `STALE` — are cleared by *"a new execution"* in the document's own words, so
 * exactly those three carry a one-click re-run. `DISPATCH_UNKNOWN` is cleared by *investigation*
 * and architecture §5.1 *"forbids resending browser work on an ambiguous outcome, so a new run is
 * an explicit human decision"*: offering the button there would be the surface making the decision
 * §5.1 reserves for a person. The remaining four are cleared out of band and a re-run cannot move
 * them, so offering one would teach an author the condition is negotiable — 10.10's argument for
 * `callerCanClear`, one surface over.
 *
 * There is **no fallback**. {@link executionErrorNarrative} throws on anything the document does
 * not declare, for the reason `runModeFor` throws on an undeclared `readiness`: a ninth code the
 * server starts sending must be a loud failure, not a generic panel that hides which of the eight
 * is true. `studioContract.test.ts` reads the enum from `openapi.yaml` and asserts this record
 * covers it exactly, in both directions.
 */
export interface ExecutionErrorNarrative {
  /** The accessible name of the error region. Distinct per code — AC-6 asserts it. */
  readonly title: string;
  /** What a caller may conclude about the browser. The document's `Browser` column. */
  readonly browserClaim: string;
  /** Who can clear the condition. The document's `What clears it` column. */
  readonly remedyOwner: string;
  /** True only for the three codes the document clears with *"a new execution"*. */
  readonly offersRerun: boolean;
}

export const EXECUTION_ERROR_NARRATIVES: Readonly<
  Record<ExecutionErrorCode, ExecutionErrorNarrative>
> = {
  TIMEOUT: {
    title: 'The run hit its total time cap',
    browserClaim:
      'The browser started and ran your steps, and was then killed when the run passed the total time allowed for it.',
    remedyOwner:
      'You can clear this: shorten the test, or split it into smaller tests, so it finishes inside the total runtime allowed. That allowance is a platform setting an operator can raise within server limits; it is not something this editor sets.',
    offersRerun: false,
  },
  DISPATCH_FAILED: {
    browserClaim:
      'No browser started. The send was definitely refused, or the queue deadline passed with nothing admitted.',
    title: 'The run was never sent to a browser',
    remedyOwner: 'You can clear this: start a new execution. Nothing about the draft needs to change.',
    offersRerun: true,
  },
  DISPATCH_UNKNOWN: {
    title: 'We cannot tell whether a browser ran',
    browserClaim:
      'Unknown. The send neither succeeded nor failed cleanly, and nothing since has resolved it; you must assume neither that a browser ran nor that it did not.',
    remedyOwner:
      'Nobody can clear this automatically. Someone has to look at what happened; starting another run is a decision a person makes deliberately, not a button this page offers.',
    offersRerun: false,
  },
  START_TIMEOUT: {
    title: 'A browser was admitted but never confirmed a start',
    browserClaim:
      'The run was admitted, and then the browser never confirmed a start: the deadline for a start report passed with nothing arriving.',
    remedyOwner: 'You can clear this: start a new execution. Nothing about the draft needs to change.',
    offersRerun: true,
  },
  STALE: {
    title: 'A browser started and then stopped reporting',
    browserClaim:
      'The browser started and then stopped reporting: the run went past its fixed runtime and its delivery margins with nothing arriving to close it out.',
    remedyOwner: 'You can clear this: start a new execution. Nothing about the draft needs to change.',
    offersRerun: true,
  },
  DISPATCH_DISABLED: {
    title: 'Execution was switched off across the platform',
    browserClaim:
      'No browser started. Execution had already been switched off platform-wide when this run was due to be sent.',
    remedyOwner:
      'An operator clears this by re-enabling execution. It affects every queued run, not only yours, so there is nothing about this draft to fix.',
    offersRerun: false,
  },
  AUTHORIZATION_REVOKED: {
    title: 'Permission to run was withdrawn before the browser started',
    browserClaim:
      'No browser started. The last check before sending found that permission to execute for this CSI had been withdrawn.',
    remedyOwner:
      'Whoever administers entitlements clears this by restoring that access, out of band. Retrying cannot.',
    offersRerun: false,
  },
  SECRET_TOO_LONG: {
    title: 'A secret exceeds the supported size',
    browserClaim:
      'No browser started. The dispatcher refused a secret longer than 4096 characters without truncating it.',
    remedyOwner:
      'Whoever owns the secret clears this by rotating it to a supported value of at most 4096 characters before starting a new run.',
    offersRerun: false,
  },
  CANCELLED: {
    title: 'The run was stopped on request',
    browserClaim:
      'Someone pressed Stop. If a browser had started it was asked to stop, given a few seconds to close and save its recording, and then ended; steps that had not finished were not completed, and any recording is whatever was captured before the stop.',
    remedyOwner:
      'Nothing needs clearing: this is the outcome that was asked for. Start the test again whenever you want a complete run.',
    offersRerun: false,
  },
  REFERENCE_UNAVAILABLE: {
    title: 'A variable or secret the run needs stopped resolving',
    browserClaim:
      'No browser started. A declared variable or secret reference that resolved when the run was accepted no longer resolved when it was sent.',
    remedyOwner:
      'Whoever owns that reference clears this by restoring it, or you clear it by correcting what the draft declares. Retrying cannot.',
    offersRerun: false,
  },
};

/**
 * Total lookup, deliberately partial-unfriendly.
 *
 * A `??` fallback here would render eight different situations as one, which is ADR-002 §14.3's
 * finding on the wire reproduced in the browser. `studioContract.test.ts` asserts this record's
 * keys are exactly the document's non-null enum, so the throw is unreachable for any code the
 * contract declares — and loud for any it does not.
 */
export function executionErrorNarrative(code: string): ExecutionErrorNarrative {
  const narrative = (EXECUTION_ERROR_NARRATIVES as Record<string, ExecutionErrorNarrative>)[code];
  if (!narrative) {
    throw new Error(
      `Unknown ExecutionErrorCode "${code}": the values ADR-002 §15 and §29 declare are the whole set, ` +
        'and rendering an unknown one as a generic failure would hide what happened to the browser.',
    );
  }
  return narrative;
}

/** The carrier's order, so a rendering that enumerates does so in the document's order. */
export const EXECUTION_ERROR_KEYS: readonly ExecutionErrorCode[] = EXECUTION_ERROR_CODES;

/*
 * ---------------------------------------------------------------------------------------------
 * STUDIO-OBS-008 T0 ruling A1: the replay's named cause takes precedence
 * ---------------------------------------------------------------------------------------------
 */

/**
 * Which narrative a terminal replay snapshot gets (T0 ruling A1.6, "Precedence").
 *
 *  - `replayFailure` non-null **selects the narrative before `status` and `errorCode`**: the login
 *    notice for `LOGIN_REQUIRED`, the drift sentence for `TARGET_DRIFT`. The API derives it only from
 *    a final report whose `errorCode` is null (A1.2), and drift arrives as `status: ERROR` (OBS-A1-2),
 *    so without this precedence a drift would read as the unnamed-error statement.
 *  - `replayFailure` null or absent: the existing narratives apply unchanged (`errorCode`, the
 *    unnamed `ERROR`, or nothing).
 *
 * Nothing is derived from `stepResults[].message`, `logs` or `status` (A1.1: "A client never derives
 * it from …"). This function reads exactly one field.
 */
export type ReplayFailureNarrative =
  | { readonly kind: 'login'; readonly failure: Extract<ReplayFailure, { code: 'LOGIN_REQUIRED' }> }
  | { readonly kind: 'drift'; readonly failure: Extract<ReplayFailure, { code: 'TARGET_DRIFT' }> };

export function replayFailureNarrative(
  snapshot: Pick<ExecutionSnapshot, 'replayFailure'>,
): ReplayFailureNarrative | null {
  const failure = snapshot.replayFailure;
  if (failure === null || failure === undefined) return null;
  switch (failure.code) {
    case 'LOGIN_REQUIRED':
      return { kind: 'login', failure };
    case 'TARGET_DRIFT':
      return { kind: 'drift', failure };
    default: {
      // The carrier is closed; a third code is a contract change and must be loud, as for errorCode.
      const unknown: never = failure;
      throw new Error(`Unknown ReplayFailure code "${(unknown as { code: string }).code}".`);
    }
  }
}

/**
 * Whether the drift narrative offers "Learn again from step N" (T0 ruling A1.6, all three must hold):
 *  1. the test's current readiness, as `GET /tests/{id}` served it, is `READY`;
 *  2. the replayed revision is the test's confirmed revision (`snapshot.revisionId ===
 *     confirmedRevisionId`), so the step being re-learned is the one that drifted;
 *  3. the drifted step is still in the current draft, by stable ID.
 *
 * In every other case (`NEEDS_RELEARN`, a superseded revision, a missing step) the narrative is shown
 * with no action: the ordinary Run already learns from the server's k, and the client never sends a
 * step after k. The action never repairs anything automatically.
 */
export function learnAgainOffered(
  test: Pick<TestDetailDto, 'readiness' | 'confirmedRevisionId'> | null,
  snapshot: Pick<ExecutionSnapshot, 'replayFailure' | 'revisionId'>,
  draftStepIds: readonly string[],
): boolean {
  const failure = snapshot.replayFailure;
  if (test === null || failure === null || failure === undefined || failure.code !== 'TARGET_DRIFT') {
    return false;
  }
  return (
    test.readiness === 'READY' &&
    test.confirmedRevisionId !== null &&
    snapshot.revisionId === test.confirmedRevisionId &&
    draftStepIds.includes(failure.stepId)
  );
}
