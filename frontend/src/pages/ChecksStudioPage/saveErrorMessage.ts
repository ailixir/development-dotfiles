/**
 * What the Save toast says when `PUT /tests/{id}` is refused (VAL-027).
 *
 * The server's `400` refusals for these codes carry a `message` written for the author ("Step 2 is
 * blank. Write what the step should do, or remove it."), so it is shown as-is. The branch is taken
 * on the `error` code and the status, never on the prose. Everything else — `5xx`, a network
 * failure, an unknown `400` code, or a declared code with no message — keeps the generic text, so
 * no internal detail reaches the toast.
 */
export const GENERIC_SAVE_ERROR = 'Failed to save';

/** The `400` codes whose message is author-facing by design. */
export const AUTHOR_FACING_SAVE_ERRORS: ReadonlySet<string> = new Set([
  'INVALID_STEPS',
  'INVALID_CONFIGURATION',
  'INLINE_CREDENTIAL',
  'SOURCE_LINE_TOO_LONG',
  'SOURCE_TOO_MANY_STEPS',
]);

interface SaveFailure {
  response?: { status?: number; data?: { error?: unknown; message?: unknown } | null };
}

export function saveErrorMessage(error: unknown): string {
  const response = (error as SaveFailure | null)?.response;
  const code = response?.data?.error;
  const message = response?.data?.message;
  if (
    response?.status === 400 &&
    typeof code === 'string' &&
    AUTHOR_FACING_SAVE_ERRORS.has(code) &&
    typeof message === 'string' &&
    message.trim() !== ''
  ) {
    return message.trim();
  }
  return GENERIC_SAVE_ERROR;
}
