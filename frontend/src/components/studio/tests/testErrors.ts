/**
 * Turns a refused create or delete into a sentence for the dialog (story 10.46, Track C).
 *
 * `apiClient` rejects with an `Error` carrying the Axios `response`; the backend's body is
 * `{ error, message }`. Only a `400`'s `message` is shown as sent — it is the validation detail
 * written for the author. Every other status gets a fixed sentence, so no internal detail leaks.
 */

interface RefusedRequest {
  response?: { status?: number; data?: { message?: unknown } | null };
}

export function statusOf(failure: unknown): number | null {
  const status = (failure as RefusedRequest | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

function validationDetail(failure: unknown): string | null {
  const message = (failure as RefusedRequest | null)?.response?.data?.message;
  return typeof message === 'string' && message.trim() !== '' ? message.trim() : null;
}

export const CREATE_ERRORS = {
  validation: 'Some details are not valid. Check the form and try again.',
  forbidden: 'You do not have permission to create tests for this system.',
  conflict: 'This test conflicts with an existing one. Change the name and try again.',
  generic: 'This test could not be created. Please try again.',
} as const;

export function createErrorMessage(failure: unknown): string {
  switch (statusOf(failure)) {
    case 400:
      return validationDetail(failure) ?? CREATE_ERRORS.validation;
    case 403:
      return CREATE_ERRORS.forbidden;
    case 409:
      return CREATE_ERRORS.conflict;
    default:
      return CREATE_ERRORS.generic;
  }
}

export const DELETE_ERRORS = {
  forbidden: 'You do not have permission to delete this test.',
  generic: 'This test could not be deleted. Please try again.',
} as const;

export function deleteErrorMessage(failure: unknown): string {
  switch (statusOf(failure)) {
    case 403:
      return DELETE_ERRORS.forbidden;
    default:
      return DELETE_ERRORS.generic;
  }
}
