import type { StudioCapabilitiesState } from '@/utils/config/studioCapabilities';

/**
 * Pure helpers for inserting references into a step (STUDIO-OBS-008 AC-5(b), plan "L4").
 *
 * A step refers to a plain variable as `<var NAME>` and to a Vault secret as `<secret ID>`. ID is
 * the secret's Vault name, the required `secretId` of a `secretRef` declaration, as
 * `listTestSecrets` returns it (ruling D-8). There is no name fallback and no alias: the picker
 * only ever writes a name it received from the server or from a create answer.
 *
 * Nothing here holds or formats a secret value. The only secret data these helpers see is a name.
 */

/**
 * The reference name grammar: `Variable.secretId` in `openapi.yaml`
 * (`^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$`), which is also the `<var NAME>` / `<secret ID>` token
 * grammar the MSW validate-variables mirror scans with, minus `.` and `..`.
 */
const REFERENCE_NAME = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$/u;

export function isReferenceName(name: string): boolean {
  return REFERENCE_NAME.test(name);
}

function requireReferenceName(name: string, kind: 'var' | 'secret'): string {
  if (!isReferenceName(name)) {
    throw new Error(`Not a valid <${kind}> reference name`);
  }
  return name;
}

/** `<var NAME>` for a declared plain variable. Throws on a name the token grammar cannot carry. */
export function varToken(name: string): string {
  return `<var ${requireReferenceName(name, 'var')}>`;
}

/** `<secret ID>` for a Vault secret name (D-8). Throws on a name that is not a valid `secretId`. */
export function secretToken(secretId: string): string {
  return `<secret ${requireReferenceName(secretId, 'secret')}>`;
}

export interface InsertionResult {
  /** The step text with the token in place of the selection. */
  text: string;
  /** Where the caret goes: straight after the inserted token. */
  caret: number;
}

const clamp = (value: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), max) : max;

/**
 * Replaces `text[start, end)` with `token`, keeping everything around it byte for byte. A collapsed
 * selection (`start === end`) inserts at the caret. Out-of-range or reversed bounds are clamped and
 * ordered, so a stale selection never drops text. A non-finite bound means "the end of the text".
 */
export function insertAtSelection(
  text: string,
  start: number,
  end: number,
  token: string,
): InsertionResult {
  const a = clamp(start, text.length);
  const b = clamp(end, text.length);
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  return {
    text: `${text.slice(0, from)}${token}${text.slice(to)}`,
    caret: from + token.length,
  };
}

// ---------------------------------------------------------------------------
// Visible copy for the secrets half of the picker and the secret selectors
// ---------------------------------------------------------------------------

/** Shown while no persisted test exists (copy kept from `SecretInput.tsx`'s default hint). */
export const SECRETS_NEED_SAVED_TEST = 'Save the test before adding secrets';

/**
 * Why secrets are not offered right now, or `null` when they are. Every state but a ready
 * `vaultSecrets: true` answer is unavailable and is said so in visible text: secrets are never
 * simulated (AC-5(a), `getStudioTestCapabilities` "A client treats loading, an error and any
 * non-200 as unavailable and never simulates a value").
 *
 * `noTestHint` is the caller's wording for the "no persisted test yet" state.
 */
export function secretsUnavailableText(
  state: StudioCapabilitiesState,
  noTestHint: string = SECRETS_NEED_SAVED_TEST,
): string | null {
  switch (state.status) {
    case 'unknown':
      return noTestHint;
    case 'loading':
      return 'Checking whether secrets are available for this test…';
    case 'unavailable':
      return 'Studio could not confirm that secrets are available for this test, so they are off.';
    case 'ready':
      return state.capabilities.vaultSecrets ? null : 'Vault is not connected for this environment.';
  }
}

/**
 * The author-facing text for a refused secrets call. Codes are the `ErrorResponse.error` values of
 * `listTestSecrets` / `createTestSecret` in `openapi.yaml`; `apiClient` hands them over as the
 * error's `message`. No message here quotes the request, so none can carry a value.
 */
export function secretFailureText(failure: unknown, fallback: string): string {
  const code = (failure as { message?: unknown } | null)?.message;
  if (typeof code !== 'string') return fallback;
  if (code === 'VAULT_NOT_CONFIGURED') return 'Vault is not connected for this environment.';
  if (code === 'SECRET_ALREADY_EXISTS') return 'A secret with this name already exists for this test.';
  if (code === 'VAULT_UNAVAILABLE') return 'Vault is temporarily unavailable. Try again.';
  if (code.startsWith('INVALID_SECRET_')) return 'The secret was rejected: check the name, value and origins.';
  return fallback;
}
