/**
 * The declared refusal vocabularies of the two write operations this surface calls
 * (story 10.10, AC-12 / AC-14).
 *
 * **The branch is taken on `error`, never on `message`.** @po's ruling on story 10.9:
 * *"the message is human-readable prose and is not a branch key."* The message is shown to the
 * reader because 10.9 AC-7 makes it name what moved, which is genuinely useful; branching on it
 * is a different thing and AC-12 asserts it is not happening.
 *
 * The code sets themselves are read from `openapi.yaml` by `studioContract.test.ts`
 * (`x-conflict-codes` on each operation, and the four `400` codes of `compileTest`), so a fourth
 * code added to the document surfaces as an unhandled branch rather than as silent misrouting.
 */

export interface ConflictNarrative {
  /** The explanation derived from the code. */
  readonly explanation: string;
  /**
   * Whether the caller can clear the condition themselves. ADR-002 §14.3 puts `TEST_DELETED` and
   * `TEST_QUARANTINED` on the not-retriable side: offering a retry that will be refused teaches
   * an author the gate is negotiable.
   */
  readonly callerCanClear: boolean;
}

export const CONFIRM_CONFLICT_NARRATIVES: Readonly<Record<string, ConflictNarrative>> = {
  STALE_CANDIDATE: {
    explanation:
      'The candidate you were reading is no longer the current one, so nothing was confirmed. The screen below has been refreshed to what the draft holds now. Read it and confirm again if you still want to.',
    callerCanClear: true,
  },
  TEST_DELETED: {
    explanation:
      'This draft has been deleted, so it cannot be translated or confirmed. Nothing here will change that.',
    callerCanClear: false,
  },
  TEST_QUARANTINED: {
    explanation:
      'This draft is held while its CSI is sorted out. Your work is kept and nothing has been removed; translating and confirming are paused until the CSI is resolved.',
    callerCanClear: false,
  },
};

export const COMPILE_CONFLICT_NARRATIVES: Readonly<Record<string, ConflictNarrative>> = {
  TEST_DELETED: CONFIRM_CONFLICT_NARRATIVES.TEST_DELETED,
  TEST_QUARANTINED: CONFIRM_CONFLICT_NARRATIVES.TEST_QUARANTINED,
};

/** The four authoring-bound refusals of `POST /tests/{id}/compile`, all `400`. */
export const COMPILE_REJECTION_NARRATIVES: Readonly<Record<string, string>> = {
  SOURCE_TOO_MANY_STEPS:
    'This draft has more steps than a single test may hold. Split it into smaller tests before asking for a translation.',
  SOURCE_LINE_TOO_LONG:
    'One of your lines is longer than a single step may be. Shorten the line named below and try again.',
  SOURCE_TOO_LARGE:
    'The draft as a whole is larger than may be sent for translation. Split it into smaller tests.',
  INLINE_CREDENTIAL:
    'A line looks like it holds a password or a key. Move it into a vault reference and leave the line pointing at the reference instead.',
};

export const UNDECLARED_CONFLICT_NARRATIVE: ConflictNarrative = {
  explanation:
    'The server refused this action for a reason this page does not have wording for yet. Nothing was changed. The reason it gave is shown below so it can be quoted in a ticket.',
  callerCanClear: false,
};

export function confirmConflictNarrative(code: string): ConflictNarrative {
  return CONFIRM_CONFLICT_NARRATIVES[code] ?? UNDECLARED_CONFLICT_NARRATIVE;
}

export function compileConflictNarrative(code: string): ConflictNarrative {
  return COMPILE_CONFLICT_NARRATIVES[code] ?? UNDECLARED_CONFLICT_NARRATIVE;
}

export function compileRejectionNarrative(code: string): string {
  return (
    COMPILE_REJECTION_NARRATIVES[code] ??
    'The server refused to start a translation for a reason this page does not have wording for yet. Nothing was changed.'
  );
}
